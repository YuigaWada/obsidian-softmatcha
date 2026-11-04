import { SearchFault, type SearchLanguage } from "../domain/search";

export type ModelTransferPhase = "downloading" | "installing" | "cancelled";
export interface ModelPackSource {
  fetch(version: string, language: SearchLanguage): Promise<ArrayBuffer>;
}
export interface ModelPackTarget {
  install(data: ArrayBuffer, language?: SearchLanguage): Promise<unknown>;
}

/** Downloads only model data and validates before installation. */
export class DownloadModel {
  constructor(
    private source: ModelPackSource,
    private target: ModelPackTarget,
  ) {}

  async execute(
    version: string,
    language: SearchLanguage,
    phase: (value: ModelTransferPhase) => void = () => {},
    active: () => boolean = () => true,
  ): Promise<void> {
    phase("downloading");
    const data = await this.source.fetch(version, language);
    if (!active()) throw new SearchFault("downloadCancelled");
    phase("installing");
    await this.target.install(data, language);
  }
}
