import {
  searchText,
  type SearchConfig,
  type SearchResult,
} from "../domain/search";
import type { SearchEngine, Scheduler } from "./ports";
export interface SessionLabels {
  preparing: string;
  ready: string;
  indexing: string;
  error: (error: unknown) => string;
}
/** Application lifetime aggregate coordinator. Views never own models or warmup. */
export class SearchSession {
  state: string;
  private stopped = false;
  private version = 0;
  private cancel: (() => void) | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private engine: SearchEngine,
    private scheduler: Scheduler,
    private labels: SessionLabels = {
      preparing: "準備中…",
      ready: "検索準備完了",
      indexing: "モデル・索引を準備中…",
      error: (error: unknown) =>
        `準備エラー: ${error instanceof Error ? error.message : String(error)}`,
    },
    private maxAttempts = 60,
  ) {
    this.state = labels.preparing;
  }
  setLabels(labels: SessionLabels): void {
    for (const key of ["preparing", "ready", "indexing"] as const)
      if (this.state === this.labels[key]) {
        this.state = labels[key];
        break;
      }
    this.labels = labels;
  }
  prepare(config: Readonly<SearchConfig>): void {
    this.cancel?.();
    const version = ++this.version;
    const snapshot = { ...config };
    const run = async (attempt: number): Promise<void> => {
      if (this.stopped || version !== this.version) return;
      try {
        const ready = await this.engine.prepare(snapshot);
        if (this.stopped || version !== this.version) return;
        this.state = ready ? this.labels.ready : this.labels.indexing;
        if (ready) return;
      } catch (error) {
        if (this.stopped || version !== this.version) return;
        this.state = this.labels.error(error);
      }
      if (attempt < this.maxAttempts)
        this.cancel = this.scheduler.after(2000, () => void run(attempt + 1));
    };
    if (!this.stopped) void run(0);
  }
  search(
    value: string,
    config: Readonly<SearchConfig>,
    isCurrent: () => boolean = () => true,
    onPartial?: (result: SearchResult) => void,
  ): Promise<SearchResult> {
    this.engine.cancel?.();
    const query = searchText(value);
    const snapshot = { ...config };
    const next = this.tail.then(() => {
      if (this.stopped || !isCurrent()) return { results: [] };
      return this.engine.search(query, snapshot, (result) => {
        if (!this.stopped && isCurrent()) onPartial?.(result);
      });
    });
    // A failed request must not poison later searches.
    this.tail = next.catch(() => {});
    return next;
  }
  setActive(active: boolean): void {
    this.engine.setActive?.(active);
  }
  cancelSearch(): void {
    this.engine.cancel?.();
  }
  dispose(): void {
    this.stopped = true;
    this.version++;
    this.cancel?.();
    this.engine.dispose?.();
  }
}
