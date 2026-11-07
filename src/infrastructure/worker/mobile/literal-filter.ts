/** A negative-only bigram filter: positives still use the original exact matcher. */
function positions(a: number, b: number) {
  return [
    ((a * 131) ^ b) & 8191,
    (Math.imul(a * 8191 + b, 2654435761) >>> 19) & 8191,
  ];
}
const fold = (text: string) => text.toUpperCase().toLowerCase();
export function literalFilter(text: string): Uint8Array {
  const bits = new Uint8Array(1024),
    value = fold(text);
  for (let i = 1; i < value.length; i++)
    for (const h of positions(value.charCodeAt(i - 1), value.charCodeAt(i)))
      bits[h >>> 3] |= 1 << (h & 7);
  return bits;
}
export function mayContain(
  bits: Uint8Array | undefined,
  query: string,
): boolean {
  // Other Unicode case-folding rules and one-character queries use the full scan.
  if (
    !bits ||
    !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9\s_-]+$/u.test(
      query,
    )
  )
    return true;
  const word = fold(query.trim())
    .split(/\s+/)
    .sort((a, b) => b.length - a.length)[0];
  if (!word || word.length < 2) return true;
  for (let i = 1; i < word.length; i++)
    for (const h of positions(word.charCodeAt(i - 1), word.charCodeAt(i)))
      if (!(bits[h >>> 3] & (1 << (h & 7)))) return false;
  return true;
}
