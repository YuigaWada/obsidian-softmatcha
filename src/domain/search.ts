export type UiLocale = "ja" | "en";
export type SearchLanguage = "ja" | "en";
export class SearchFault extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
/** Search bounded context: platform-independent values and invariants. */
export interface SearchConfig {
  uiLanguage: "auto" | UiLocale;
  autoDownloadModels: boolean;
  searchLanguages: SearchLanguage[];
  locale?: UiLocale;
  similarity: number;
  limit: number;
}
export interface Hit {
  path: string;
  line: number;
  excerpt: string;
  score: number;
  kind?: "title";
  match_ranges?: [number, number][];
}
export interface SearchResult {
  results: Hit[];
  message?: string;
  mode?: "wasm";
  literalOnly?: "unknown" | "disabled" | "unavailable";
}
export const defaults: SearchConfig = {
  uiLanguage: "auto",
  autoDownloadModels: true,
  searchLanguages: ["ja", "en"],
  similarity: 0.45,
  limit: 50,
};
export function searchText(value: string): string {
  const text = value.trim();
  if (!text || text.length > 512) throw new SearchFault("invalidQuery");
  return text;
}
export function highlightRanges(
  text: string,
  ranges: [number, number][],
): [number, number][] {
  const valid = ranges
    .filter(
      ([a, b]) =>
        Number.isInteger(a) &&
        Number.isInteger(b) &&
        a >= 0 &&
        b > a &&
        b <= text.length,
    )
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of valid) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** Migrate persisted settings without trusting stale or edited JSON types. */
export function loadSearchConfig(value: unknown): SearchConfig {
  const result = {
    ...defaults,
    searchLanguages: [...defaults.searchLanguages],
  };
  if (!value || typeof value !== "object") return result;
  const saved = value as Partial<SearchConfig>;
  if (
    saved.uiLanguage === "auto" ||
    saved.uiLanguage === "ja" ||
    saved.uiLanguage === "en"
  )
    result.uiLanguage = saved.uiLanguage;
  if (typeof saved.autoDownloadModels === "boolean")
    result.autoDownloadModels = saved.autoDownloadModels;
  if (Array.isArray(saved.searchLanguages))
    result.searchLanguages = [
      ...new Set(saved.searchLanguages.filter((l) => l === "ja" || l === "en")),
    ];
  if (
    typeof saved.limit === "number" &&
    Number.isInteger(saved.limit) &&
    saved.limit >= 1 &&
    saved.limit <= 100
  )
    result.limit = saved.limit;
  if (
    typeof saved.similarity === "number" &&
    Number.isFinite(saved.similarity) &&
    saved.similarity >= 0.1 &&
    saved.similarity <= 1
  )
    result.similarity = saved.similarity;
  return result;
}
