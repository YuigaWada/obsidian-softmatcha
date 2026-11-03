import { highlightRanges } from "../domain/search";
/** Compact display only; source offsets and note line numbers stay unchanged. */
export function compactExcerpt(
  text: string,
  ranges: [number, number][],
): { text: string; ranges: [number, number][] } {
  const matches = highlightRanges(text, ranges);
  const lines: string[] = [];
  const mapped: [number, number][] = [];
  let offset = 0;
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    if (!line[0].trim()) continue;
    if (lines.length) offset++;
    const start = line.index;
    const end = start + line[0].length;
    for (const [a, b] of matches) {
      const left = Math.max(a, start);
      const right = Math.min(b, end);
      if (left < right)
        mapped.push([offset + left - start, offset + right - start]);
    }
    lines.push(line[0]);
    offset += line[0].length;
  }
  return { text: lines.join("\n"), ranges: mapped };
}
