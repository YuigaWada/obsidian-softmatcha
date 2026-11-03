import type { SearchEngine } from "../application/ports";
import type { SearchConfig, SearchResult } from "../domain/search";
export interface HttpResponse {
  status: number;
  json: any;
}
export type HttpClient = (request: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  throw: boolean;
}) => Promise<HttpResponse>;
/** Transport policy belongs to this adapter, not to UI or the search use case. */
export class RemoteSearchEngine implements SearchEngine {
  constructor(private request: HttpClient) {}
  private async post(
    path: string,
    body: unknown,
    config: Readonly<SearchConfig>,
  ): Promise<any> {
    const url = new URL(path, config.endpoint);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )
    )
      throw Error("リモート接続にはHTTPSを指定してください。");
    const response = await this.request({
      url: url.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(body),
      throw: false,
    });
    if (response.status !== 200)
      throw Error(
        response.json?.detail ?? `検索サービス: HTTP ${response.status}`,
      );
    return response.json;
  }
  async prepare(config: Readonly<SearchConfig>): Promise<boolean> {
    return Boolean(
      (await this.post("/v1/warmup", { corpus: config.corpus }, config))
        ?.warmed,
    );
  }
  async search(
    query: string,
    config: Readonly<SearchConfig>,
  ): Promise<SearchResult> {
    return this.post(
      "/v1/search",
      {
        query,
        corpus: config.corpus,
        limit: config.limit,
        min_similarity: config.similarity,
      },
      config,
    );
  }
}
