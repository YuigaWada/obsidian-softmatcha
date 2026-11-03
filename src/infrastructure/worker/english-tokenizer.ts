/** Surface offsets always refer to the original UTF-8 note, including emoji. */
export function englishTokenizer(
  text: string,
  vocabulary: Record<string, number>,
  unknown: number,
) {
  const encoder = new TextEncoder();
  let cursor = 0;
  let bytes = 0;
  return [
    ...text.matchAll(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[A-Za-z]+(?:['’][A-Za-z]+)*|\d+(?:[.,]\d+)*|[^\s]/gu,
    ),
  ].map((match) => {
    const start = match.index;
    bytes += encoder.encode(text.slice(cursor, start)).length;
    const first = bytes;
    bytes += encoder.encode(match[0]).length;
    cursor = start + match[0].length;
    const word = match[0].normalize("NFKC").replaceAll("’", "'");
    return {
      id:
        typeof vocabulary[word.toLowerCase()] === "number"
          ? vocabulary[word.toLowerCase()]
          : typeof vocabulary[word] === "number"
            ? vocabulary[word]
            : unknown,
      start: first,
      end: bytes,
    };
  });
}
