import type { Hit } from "../../domain/search";
export interface Note {
  path: string;
  text: string;
}
export function snippet(
  note: Note,
  start: number,
  end: number,
  score = 1,
): Hit {
  let left = Math.max(0, start - 100);
  let right = Math.min(note.text.length, end + 150);
  if (left > 0 && /[\uDC00-\uDFFF]/.test(note.text[left])) left--;
  if (right < note.text.length && /[\uDC00-\uDFFF]/.test(note.text[right]))
    right++;
  return {
    path: note.path,
    line: (note.text.slice(0, start).match(/\n/g) ?? []).length,
    excerpt: note.text.slice(left, right),
    score,
    match_ranges: [[start - left, end - left]],
  };
}
export function literalSearch(
  notes: Note[],
  query: string,
  limit: number,
): Hit[] {
  const escaped = query
    .trim()
    .split(/\s+/)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  if (!escaped) return [];
  const pattern = new RegExp(escaped, "giu");
  const hits: Hit[] = [];
  for (const note of notes) {
    pattern.lastIndex = 0;
    const seen = new Set<number>();
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(note.text))) {
      const hit = snippet(note, match.index, match.index + match[0].length);
      if (seen.has(hit.line)) continue;
      seen.add(hit.line);
      hits.push(hit);
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}
