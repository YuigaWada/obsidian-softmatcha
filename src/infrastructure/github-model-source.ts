import { requestUrl } from "obsidian";
import type { ModelPackSource } from "../application/model-download";
import { SearchFault, type SearchLanguage } from "../domain/search";

interface DownloadResponse {
  status: number;
  arrayBuffer: ArrayBuffer;
}
type Transport = (url: string) => Promise<DownloadResponse>;

/** Native Obsidian HTTP works on mobile without browser CORS restrictions. */
export class GithubModelSource implements ModelPackSource {
  constructor(
    private transport: Transport = (url) =>
      requestUrl({ url, method: "GET", throw: false }),
  ) {}

  async fetch(version: string, language: SearchLanguage): Promise<ArrayBuffer> {
    if (!/^\d+\.\d+\.\d+$/.test(version) || !["ja", "en"].includes(language))
      throw new SearchFault("downloadFailed");
    const url = `https://github.com/YuigaWada/obsidian-softmatcha/releases/download/models-${version}/models-${language}-${version}.zip`;
    let response: DownloadResponse;
    try {
      response = await this.transport(url);
    } catch {
      throw new SearchFault("downloadFailed");
    }
    if (response.status === 404) throw new SearchFault("downloadMissing");
    if (response.status !== 200) throw new SearchFault("downloadFailed");
    if (
      !response.arrayBuffer.byteLength ||
      response.arrayBuffer.byteLength > 160 * 1024 * 1024
    )
      throw new SearchFault("invalidPack");
    return response.arrayBuffer;
  }
}
