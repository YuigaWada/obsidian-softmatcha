import type { SearchConfig, SearchResult } from "../domain/search";
/** A persistent search session; the local WASM adapter implements this boundary. */
export interface SearchEngine {
  prepare(config: Readonly<SearchConfig>): Promise<boolean>;
  search(
    query: string,
    config: Readonly<SearchConfig>,
    onPartial?: (result: SearchResult) => void,
  ): Promise<SearchResult>;
  setActive?(active: boolean): void;
  cancel?(): void;
  dispose?(): void;
}
export interface Scheduler {
  after(ms: number, action: () => void): () => void;
}
