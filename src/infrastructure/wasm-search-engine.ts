import type { SearchEngine } from "../application/ports";
import {
  SearchFault,
  type SearchConfig,
  type SearchResult,
} from "../domain/search";
export interface DocumentVersion {
  path: string;
  mtime: number;
  size: number;
}
import type { WorkerReply, ModelInput } from "./worker/protocol";
interface AssetManifest {
  version?: string;
  dimensions?: number;
  dictionaries: string[];
  models?: Partial<
    Record<"ja" | "en", { path: string; dimensions: number; version: string }>
  >;
}
export interface LocalResources {
  exists?(path: string): Promise<boolean>;
  vaultId: string;
  binary(path: string): Promise<ArrayBuffer>;
  text(path: string): Promise<string>;
  list(): DocumentVersion[];
  read(path: string): Promise<string>;
}
export class WasmSearchEngine implements SearchEngine {
  private worker: Worker | undefined;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private id = 0;
  private initial: Promise<void> | undefined;
  private generation = "";
  private synchronization: Promise<boolean> | undefined;
  private stopped = false;
  private languages: SearchConfig["searchLanguages"] = ["ja", "en"];
  constructor(
    private resources: LocalResources,
    private createWorker: () => Worker,
  ) {}
  private call(
    type: string,
    payload: unknown,
    transfer: Transferable[] = [],
  ): Promise<unknown> {
    if (this.stopped || !this.worker)
      return Promise.reject(new SearchFault("engineStopped"));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker!.postMessage({ id, type, payload }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  private async initialize() {
    let manifest: AssetManifest = { dictionaries: [], models: {} };
    try {
      manifest = JSON.parse(
        await this.resources.text("manifest.json"),
      ) as AssetManifest;
    } catch {
      /* A standard community install starts with exact search. */
    }
    const requested = this.languages;
    const specs = manifest.models ?? {
      ja: {
        path: "",
        dimensions: manifest.dimensions ?? 300,
        version: manifest.version ?? "legacy-ja",
      },
    };
    const models: ModelInput[] = [];
    for (const language of requested) {
      const spec = specs[language];
      if (!spec) continue;
      const prefix = spec.path ? `${spec.path}/` : "";
      if (
        this.resources.exists &&
        (!(await this.resources.exists(`${prefix}vectors.f32`)) ||
          !(await this.resources.exists(`${prefix}vocab.json`)))
      )
        continue;
      models.push({
        language,
        vectors: await this.resources.binary(`${prefix}vectors.f32`),
        vocabulary: await this.resources.text(`${prefix}vocab.json`),
        dimensions: spec.dimensions,
        version: spec.version,
      });
    }
    const dictionaries: Record<string, ArrayBuffer> = {};
    if (models.some((model) => model.language === "ja"))
      for (const name of manifest.dictionaries)
        dictionaries[name] = await this.resources.binary(`dict/${name}.dat.gz`);
    if (this.stopped) return;
    this.worker = this.createWorker();
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const p = this.pending.get(event.data.id);
      if (!p) return;
      this.pending.delete(event.data.id);
      event.data.error
        ? p.reject(
            event.data.code
              ? new SearchFault(event.data.code)
              : Error(event.data.error),
          )
        : p.resolve(event.data.value);
    };
    this.worker.onerror = (event) => {
      for (const p of this.pending.values())
        p.reject(Error(event.message || "WASM worker failed"));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = undefined;
      this.initial = undefined;
      this.generation = "";
    };
    await this.call(
      "init",
      {
        models,
        dictionaries,
        vault: this.resources.vaultId,
      },
      [...models.map((model) => model.vectors), ...Object.values(dictionaries)],
    );
  }
  prepare(config: Readonly<SearchConfig>): Promise<boolean> {
    this.languages = [...(config.searchLanguages ?? ["ja", "en"])];
    if (!this.synchronization)
      this.synchronization = this.synchronize().finally(() => {
        this.synchronization = undefined;
      });
    return this.synchronization;
  }
  private async synchronize(): Promise<boolean> {
    if (this.stopped) return false;
    if (!this.initial)
      this.initial = this.initialize().catch((error) => {
        this.initial = undefined;
        this.worker?.terminate();
        this.worker = undefined;
        throw error;
      });
    await this.initial;
    if (this.stopped) return false;
    const files = this.resources
      .list()
      .sort((a, b) => a.path.localeCompare(b.path));
    const generation = JSON.stringify(files);
    if (generation === this.generation) return true;
    const documents = [];
    for (const file of files) {
      if (this.stopped) return false;
      documents.push({
        path: file.path,
        text: await this.resources.read(file.path),
      });
    }
    await this.call("sync", documents);
    this.generation = generation;
    return true;
  }
  async search(
    query: string,
    config: Readonly<SearchConfig>,
  ): Promise<SearchResult> {
    // Bootstrap is normally already running from application startup.
    if (!this.initial || !this.generation) await this.prepare(config);
    else await this.initial;
    const result = (await this.call("search", {
      query,
      config,
    })) as SearchResult;
    if (
      result.literalOnly === "disabled" &&
      config.searchLanguages.includes(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query)
          ? "ja"
          : "en",
      )
    )
      result.literalOnly = "unavailable";
    return result;
  }
  dispose(): void {
    this.stopped = true;
    this.worker?.terminate();
    for (const p of this.pending.values())
      p.reject(new SearchFault("engineStopped"));
    this.pending.clear();
  }
}
