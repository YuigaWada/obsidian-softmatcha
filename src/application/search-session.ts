import {
  searchText,
  type SearchConfig,
  type SearchResult,
} from "../domain/search";
import type { SearchEngine, Scheduler } from "./ports";
/** Application lifetime aggregate coordinator. Views never own models or warmup. */
export class SearchSession {
  state = "準備中…";
  private stopped = false;
  private version = 0;
  private cancel: (() => void) | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private engine: SearchEngine,
    private scheduler: Scheduler,
  ) {}
  prepare(config: Readonly<SearchConfig>): void {
    this.cancel?.();
    const version = ++this.version;
    const snapshot = { ...config };
    const run = async (attempt: number): Promise<void> => {
      if (this.stopped || version !== this.version) return;
      try {
        const ready = await this.engine.prepare(snapshot);
        if (this.stopped || version !== this.version) return;
        this.state = ready ? "検索準備完了" : "モデル・索引を準備中…";
        if (ready) return;
      } catch (error) {
        if (this.stopped || version !== this.version) return;
        this.state = `準備エラー: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (attempt < 60)
        this.cancel = this.scheduler.after(2000, () => void run(attempt + 1));
    };
    if (!this.stopped) void run(0);
  }
  search(
    value: string,
    config: Readonly<SearchConfig>,
    isCurrent: () => boolean = () => true,
  ): Promise<SearchResult> {
    const query = searchText(value);
    const snapshot = { ...config };
    const next = this.tail.then(() => {
      if (this.stopped || !isCurrent()) return { results: [] };
      return this.engine.search(query, snapshot);
    });
    // A failed request must not poison later searches.
    this.tail = next.catch(() => {});
    return next;
  }
  dispose(): void {
    this.stopped = true;
    this.version++;
    this.cancel?.();
    this.engine.dispose?.();
  }
}
