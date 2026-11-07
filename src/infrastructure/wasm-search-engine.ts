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
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      onPartial?: (value: unknown) => void;
    }
  >();
  private id = 0;
  private initial: Promise<void> | undefined;
  private generation = "";
  private synchronization: Promise<boolean> | undefined;
  private stopped = false;
  private resync = false;
  private active = true;
  private languages: SearchConfig["searchLanguages"] = ["ja", "en"];
  constructor(
    private resources: LocalResources,
    private createWorker: () => Worker,
    private mobile = false,
  ) {}
  private call(
    type: string,
    payload: unknown,
    transfer: Transferable[] = [],
    onPartial?: (value: unknown) => void,
  ): Promise<unknown> {
    if (this.stopped || !this.worker)
      return Promise.reject(new SearchFault("engineStopped"));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onPartial });
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
    const loaded = new Set<SearchConfig["searchLanguages"][number]>();
    if (this.mobile) {
      this.connectWorker();
      await this.call("init", {
        models: [],
        dictionaries: {},
        vault: this.resources.vaultId,
        mobile: true,
      });
      this.setActive(this.active);
    }
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
      if (
        this.mobile &&
        (await this.call("model-check", { language, version: spec.version }))
      ) {
        loaded.add(language);
        continue;
      }
      loaded.add(language);
      const model: ModelInput = {
        language,
        vectors: await this.resources.binary(`${prefix}vectors.f32`),
        vocabulary: await this.resources.text(`${prefix}vocab.json`),
        dimensions: spec.dimensions,
        version: spec.version,
      };
      if (this.mobile) await this.call("model", model, [model.vectors]);
      else models.push(model);
    }
    const dictionaries: Record<string, ArrayBuffer> = {};
    if (
      this.mobile
        ? loaded.has("ja")
        : models.some((model) => model.language === "ja")
    )
      for (const name of manifest.dictionaries) {
        if (this.mobile && (name === "tid_pos" || name === "unk_pos")) continue;
        dictionaries[name] = await this.resources.binary(`dict/${name}.dat.gz`);
      }
    if (this.stopped) return;
    if (this.mobile) {
      if (Object.keys(dictionaries).length)
        await this.call(
          "dictionary",
          dictionaries,
          Object.values(dictionaries),
        );
      return;
    }
    this.connectWorker();
    await this.call(
      "init",
      { models, dictionaries, vault: this.resources.vaultId },
      [...models.map((model) => model.vectors), ...Object.values(dictionaries)],
    );
  }
  private connectWorker() {
    this.worker = this.createWorker();
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const p = this.pending.get(event.data.id);
      if (!p) return;
      if (event.data.partial) {
        p.onPartial?.(event.data.value);
        return;
      }
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
  }
  prepare(config: Readonly<SearchConfig>): Promise<boolean> {
    this.languages = [...(config.searchLanguages ?? ["ja", "en"])];
    if (this.synchronization) {
      if (this.mobile) this.resync = true;
      return this.synchronization;
    }
    this.synchronization = (async () => {
      let ready = false;
      do {
        this.resync = false;
        ready = await this.synchronize();
      } while (this.mobile && this.resync && !this.stopped);
      return ready;
    })().finally(() => {
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
    if (this.mobile) {
      const needed = new Set((await this.call("sync-plan", files)) as string[]);
      for (const file of files) {
        if (this.stopped) return false;
        if (!needed.has(file.path)) continue;
        const text = await this.resources.read(file.path);
        if (this.stopped) return false;
        await this.call("sync-note", { file, text });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      await this.call(
        "sync-commit",
        files.map((f) => f.path),
      );
      this.generation = generation;
      return true;
    }
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
    onPartial?: (result: SearchResult) => void,
  ): Promise<SearchResult> {
    // Bootstrap is normally already running from application startup.
    if (this.mobile) {
      if (!this.initial) void this.prepare(config).catch(() => {});
      await this.initial;
    } else if (!this.initial || !this.generation) await this.prepare(config);
    else await this.initial;
    const result = (await this.call("search", { query, config }, [], (value) =>
      onPartial?.(value as SearchResult),
    )) as SearchResult;
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
  setActive(active: boolean): void {
    this.active = active;
    if (this.mobile && this.worker)
      this.worker.postMessage({ id: 0, type: "visibility", payload: active });
  }
  cancel(): void {
    if (this.mobile && this.worker)
      this.worker.postMessage({ id: 0, type: "cancel" });
  }
  dispose(): void {
    this.stopped = true;
    this.worker?.terminate();
    for (const p of this.pending.values())
      p.reject(new SearchFault("engineStopped"));
    this.pending.clear();
  }
}
