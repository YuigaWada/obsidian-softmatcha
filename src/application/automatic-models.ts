import type { SearchConfig, SearchLanguage } from "../domain/search";
import { DownloadModel, type ModelTransferPhase } from "./model-download";
export interface ModelInventory {
  has(language: SearchLanguage): Promise<boolean>;
}

/** One background pass at a time; completed packs are reused and failures cool down. */
export class AutomaticModels {
  private running: Promise<void> | undefined;
  get active() {
    return this.running !== undefined;
  }
  private retryAfter = new Map<SearchLanguage, number>();
  constructor(
    private inventory: ModelInventory,
    private download: DownloadModel,
    private now: () => number = Date.now,
  ) {}
  ensure(
    version: string,
    config: () => Readonly<SearchConfig>,
    phase: (language: SearchLanguage, value: ModelTransferPhase) => void,
    failed: (language: SearchLanguage, error: unknown) => void,
    active: () => boolean = () => true,
  ): Promise<void> {
    if (this.running) return this.running;
    const allowed = (language: SearchLanguage) =>
      active() &&
      config().autoDownloadModels &&
      config().searchLanguages.includes(language);
    this.running = (async () => {
      for (const language of [...config().searchLanguages]) {
        if (!allowed(language)) continue;
        try {
          if (await this.inventory.has(language)) continue;
          if (
            !allowed(language) ||
            this.now() < (this.retryAfter.get(language) ?? 0)
          )
            continue;
          await this.download.execute(
            version,
            language,
            (value) => phase(language, value),
            () => allowed(language),
          );
          this.retryAfter.delete(language);
        } catch (error) {
          if (!allowed(language)) {
            phase(language, "cancelled");
            continue;
          }
          this.retryAfter.set(language, this.now() + 5 * 60_000);
          failed(language, error);
        }
      }
    })().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
}
