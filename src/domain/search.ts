/** Search bounded context: platform-independent values and invariants. */
export interface SearchConfig {
  engine: "remote" | "wasm";
  endpoint: string;
  token: string;
  corpus: string;
  similarity: number;
  limit: number;
}
export interface Hit {
  path: string;
  line: number;
  excerpt: string;
  score: number;
  match_ranges?: [number, number][];
}
export interface SearchResult {
  results: Hit[];
  message?: string;
}
export const defaults: SearchConfig = {
  engine: "wasm",
  endpoint: "http://127.0.0.1:8769",
  token: "",
  corpus: "default",
  similarity: 0.45,
  limit: 50,
};
export function searchText(value: string): string {
  const text = value.trim();
  if (!text || text.length > 512)
    throw Error("検索語は1〜512文字で指定してください。");
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
