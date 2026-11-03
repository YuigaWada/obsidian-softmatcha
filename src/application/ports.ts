import type { SearchConfig, SearchResult } from "../domain/search";
/** A persistent search session; remote/native/WASM adapters share this boundary. */
export interface SearchEngine {
  prepare(config: Readonly<SearchConfig>): Promise<boolean>;
  search(query: string, config: Readonly<SearchConfig>): Promise<SearchResult>;
  dispose?(): void;
}
export interface Scheduler {
  after(ms: number, action: () => void): () => void;
}
