import { gunzipSync } from "fflate";
import Dictionaries from "kuromoji/src/dict/DynamicDictionaries";
import Tokenizer from "kuromoji/src/Tokenizer";
export const dictionaryFiles = [
  "base",
  "check",
  "tid",
  "tid_pos",
  "tid_map",
  "cc",
  "unk",
  "unk_pos",
  "unk_map",
  "unk_char",
  "unk_compat",
  "unk_invoke",
];
export function japaneseTokenizer(files: Record<string, ArrayBuffer>) {
  const raw = (name: string) => gunzipSync(new Uint8Array(files[name]));
  const int32 = (name: string) => {
    const a = raw(name);
    return new Int32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  };
  const dic = new Dictionaries();
  dic.loadTrie(int32("base"), int32("check"));
  dic.loadTokenInfoDictionaries(raw("tid"), raw("tid_pos"), raw("tid_map"));
  const cc = raw("cc");
  dic.loadConnectionCosts(
    new Int16Array(cc.buffer, cc.byteOffset, cc.byteLength / 2),
  );
  const compat = raw("unk_compat");
  dic.loadUnknownDictionaries(
    raw("unk"),
    raw("unk_pos"),
    raw("unk_map"),
    raw("unk_char"),
    new Uint32Array(compat.buffer, compat.byteOffset, compat.byteLength / 4),
    raw("unk_invoke"),
  );
  const tokenizer = new Tokenizer(dic);
  const encoder = new TextEncoder();
  return (
    text: string,
    vocabulary: Record<string, number>,
    unknown: number,
  ): { id: number; start: number; end: number }[] => {
    let cursor = 0;
    let bytes = 0;
    // NUL is a trie terminator in kuromoji. Split it out rather than mutating
    // the original note, and tokenize per line to bound Viterbi lattice memory.
    return text
      .split(/[\0\r\n]/)
      .flatMap((line) => tokenizer.tokenize(line))
      .flatMap((token: { surface_form: string }) => {
        const surface = token.surface_form;
        const start = text.indexOf(surface, cursor);
        if (start < 0) throw Error("Tokenizer returned an invalid surface");
        bytes += encoder.encode(text.slice(cursor, start)).length;
        const first = bytes;
        bytes += encoder.encode(surface).length;
        cursor = start + surface.length;
        if (!surface.trim()) return [];
        return [
          { id: vocabulary[surface] ?? unknown, start: first, end: bytes },
        ];
      });
  };
}
