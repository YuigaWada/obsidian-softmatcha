import type { SearchEngine } from "../application/ports";
import type { SearchConfig, SearchResult } from "../domain/search";
export interface DocumentVersion {
  path: string;
  mtime: number;
  size: number;
}
export interface LocalResources {
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
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  private id = 0;
  private initial: Promise<void> | undefined;
  private generation = "";
  private synchronization: Promise<boolean> | undefined;
  private stopped = false;
  constructor(
    private resources: LocalResources,
    private createWorker: () => Worker,
  ) {}
  private call(
    type: string,
    payload: unknown,
    transfer: Transferable[] = [],
  ): Promise<any> {
    if (this.stopped || !this.worker)
      return Promise.reject(Error("検索エンジンを停止しました。"));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker!.postMessage({ id, type, payload }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private async initialize() {
    const manifest = JSON.parse(await this.resources.text("manifest.json"));
    const vectors = await this.resources.binary("vectors.f32");
    const vocabulary = await this.resources.text("vocab.json");
    const dictionaries: Record<string, ArrayBuffer> = {};
    for (const name of manifest.dictionaries)
      dictionaries[name] = await this.resources.binary(`dict/${name}.dat.gz`);
    if (this.stopped) return;
    this.worker = this.createWorker();
    this.worker.onmessage = (event) => {
      const p = this.pending.get(event.data.id);
      if (!p) return;
      this.pending.delete(event.data.id);
      event.data.error
        ? p.reject(Error(event.data.error))
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
        vectors,
        vocabulary,
        dictionaries,
        dimensions: manifest.dimensions,
        version: manifest.version,
        vault: this.resources.vaultId,
      },
      [vectors, ...Object.values(dictionaries)],
    );
  }
  prepare(_config: Readonly<SearchConfig>): Promise<boolean> {
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
    return this.call("search", { query, config });
  }
  dispose(): void {
    this.stopped = true;
    this.worker?.terminate();
    for (const p of this.pending.values())
      p.reject(Error("検索エンジンを停止しました。"));
    this.pending.clear();
  }
}
