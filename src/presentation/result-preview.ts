import { highlightRanges, type Hit } from "../domain/search";

export interface GroupedHit extends Hit {
  matches: Hit[];
}
export interface PreviewLine {
  line: number;
  text: string;
  ranges: [number, number][];
}
export interface ResultPreview {
  lines: PreviewLine[];
  remaining: number;
}
/** Preserve ranking while showing each note only once. */
export function groupHits(hits: Hit[]): GroupedHit[] {
  const groups = new Map<string, GroupedHit>();
  for (const hit of hits) {
    let group = groups.get(hit.path);
    if (!group) {
      group = { ...hit, matches: [] };
      groups.set(hit.path, group);
    }
    if (hit.kind !== "title") group.matches.push(hit);
  }
  return [...groups.values()];
}
function matchedLines(hit: Hit): PreviewLine[] {
  const ranges = highlightRanges(hit.excerpt, hit.match_ranges ?? []);
  if (!ranges.length)
    return [
      { line: hit.line, text: hit.excerpt.split(/\r?\n/)[0], ranges: [] },
    ];
  const first = ranges[0][0];
  let line = hit.line - (hit.excerpt.slice(0, first).match(/\n/g) ?? []).length;
  const rows: PreviewLine[] = [];
  for (let start = 0; start <= hit.excerpt.length; line++) {
    const newline = hit.excerpt.indexOf("\n", start);
    let end = newline < 0 ? hit.excerpt.length : newline;
    if (hit.excerpt[end - 1] === "\r") end--;
    const local: [number, number][] = ranges.flatMap(([a, b]) =>
      a < end && b > start
        ? [
            [Math.max(a, start) - start, Math.min(b, end) - start] as [
              number,
              number,
            ],
          ]
        : [],
    );
    if (local.length && hit.excerpt.slice(start, end).trim())
      rows.push({ line, text: hit.excerpt.slice(start, end), ranges: local });
    if (newline < 0) break;
    start = newline + 1;
  }
  return rows;
}
function lineBounds(text: string, wanted: number): [number, number] {
  let start = 0;
  for (let line = 0; line < wanted; line++) {
    const next = text.indexOf("\n", start);
    if (next < 0) return [text.length, text.length];
    start = next + 1;
  }
  const next = text.indexOf("\n", start);
  let end = next < 0 ? text.length : next;
  if (text[end - 1] === "\r") end--;
  return [start, end];
}
function fullLine(row: PreviewLine, source: string): PreviewLine {
  const [start, end] = lineBounds(source, row.line);
  const text = source.slice(start, end);
  const offset = text.indexOf(row.text);
  const ranges: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of row.ranges) {
    const at =
      offset >= 0 ? offset + a : text.indexOf(row.text.slice(a, b), cursor);
    if (at >= 0) {
      ranges.push([at, at + b - a]);
      cursor = at + b - a;
    }
  }
  return { line: row.line, text, ranges: highlightRanges(text, ranges) };
}
function context(row: PreviewLine, source: string): PreviewLine[] {
  const [start, end] = lineBounds(source, row.line);
  const before: PreviewLine[] = [],
    after: PreviewLine[] = [];
  let pos = start,
    line = row.line;
  while (pos > 0 && before.length < 2) {
    const right = pos - 1;
    const left = right === 0 ? 0 : source.lastIndexOf("\n", right - 1) + 1;
    const text = source.slice(left, right).replace(/\r$/, "");
    line--;
    if (text.trim()) before.unshift({ line, text, ranges: [] });
    pos = left;
  }
  const newline = source.indexOf("\n", end);
  pos = newline < 0 ? source.length : newline + 1;
  line = row.line + 1;
  while (pos < source.length && after.length < 2) {
    const next = source.indexOf("\n", pos);
    const right = next < 0 ? source.length : next;
    const text = source.slice(pos, right).replace(/\r$/, "");
    if (text.trim()) after.push({ line, text, ranges: [] });
    pos = next < 0 ? source.length : next + 1;
    line++;
  }
  return [...before, row, ...after];
}
/** Bound DOM text as well as visual width; keep the first highlight in view. */
function clip(row: PreviewLine): PreviewLine {
  let left = Math.max(0, (row.ranges[0]?.[0] ?? 0) - 12);
  let right = Math.min(row.text.length, left + 500);
  if (left && /[\uDC00-\uDFFF]/.test(row.text[left])) left--;
  if (right < row.text.length && /[\uDC00-\uDFFF]/.test(row.text[right]))
    right++;
  const prefix = left ? "…" : "";
  // Copy bounded text so a short DOM substring cannot retain a large note.
  const text = [
    prefix,
    ...row.text.slice(left, right),
    right < row.text.length ? "…" : "",
  ].join("");
  const ranges = row.ranges.flatMap(([a, b]) =>
    a < right && b > left
      ? [
          [
            Math.max(a, left) - left + prefix.length,
            Math.min(b, right) - left + prefix.length,
          ] as [number, number],
        ]
      : [],
  );
  return { ...row, text, ranges };
}
export function resultPreview(
  group: GroupedHit,
  source?: string,
): ResultPreview {
  const rows = new Map<number, PreviewLine[]>();
  for (const hit of group.matches)
    for (const part of matchedLines(hit)) {
      const parts = rows.get(part.line) ?? [];
      parts.push(part);
      rows.set(part.line, parts);
    }
  const ordered = [...rows.keys()]
    .sort((a, b) => a - b)
    .slice(0, 5)
    .map((line) => {
      const parts = rows.get(line)!;
      const row =
        source === undefined ? { ...parts[0] } : fullLine(parts[0], source);
      for (const part of parts.slice(1)) {
        const extra = source === undefined ? part : fullLine(part, source);
        if (row.text === extra.text)
          row.ranges = highlightRanges(row.text, [
            ...row.ranges,
            ...extra.ranges,
          ]);
      }
      return row;
    });
  if (rows.size === 1 && source !== undefined)
    return { lines: context(ordered[0], source).map(clip), remaining: 0 };
  return { lines: ordered.map(clip), remaining: Math.max(0, rows.size - 5) };
}
