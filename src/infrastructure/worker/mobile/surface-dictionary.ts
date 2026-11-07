import { gunzipSync } from "fflate";
import DynamicDictionaries from "kuromoji/src/dict/DynamicDictionaries";
import TokenInfoDictionary from "kuromoji/src/dict/TokenInfoDictionary";
import UnknownDictionary from "kuromoji/src/dict/UnknownDictionary";
import { releaseBuffer } from "./buffers";
interface Target {
  target_map: Record<number, Uint32Array | undefined>;
  loadTargetMap(data: Uint8Array): unknown;
  dictionary: { getShort(offset: number): number };
}
/** Keep the packed target map rather than creating hundreds of thousands of JS arrays. */
function packedMap(input: Uint8Array) {
  const bytes = input.byteOffset % 4 ? new Uint8Array(input) : input;
  if (bytes.byteLength % 4) throw Error("Invalid dictionary map");
  const words = new Uint32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / 4,
  );
  const count = words[0];
  let cursor = 1,
    maxKey = 0,
    maxToken = 0;
  if (count > 1000000) throw Error("Invalid dictionary map");
  for (let row = 0; row < count; row++) {
    const key = words[cursor++],
      size = words[cursor++];
    if (key > 1000000 || cursor + size > words.length)
      throw Error("Invalid dictionary map");
    maxKey = Math.max(maxKey, key);
    for (let i = 0; i < size; i++)
      maxToken = Math.max(maxToken, words[cursor + i]);
    cursor += size;
  }
  const packed = words.slice(0, cursor),
    offsets = new Uint32Array(maxKey + 1);
  cursor = 1;
  for (let row = 0; row < count; row++) {
    const key = packed[cursor++];
    offsets[key] = cursor;
    cursor += 1 + packed[cursor];
  }
  releaseBuffer(input);
  if (bytes !== input) releaseBuffer(bytes);
  const map: Record<number, Uint32Array | undefined> = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== "string" || !/^\d+$/.test(key)) return undefined;
        const at = offsets[Number(key)];
        return at ? packed.subarray(at + 1, at + 1 + packed[at]) : undefined;
      },
    },
  );
  return { map, maxToken };
}
export function surfaceDictionary(files: Record<string, ArrayBuffer>) {
  const raw = (name: string) => gunzipSync(new Uint8Array(files[name]));
  const records = (name: string, maximum: number) => {
    const bytes = raw(name);
    try {
      if (maximum % 10 || maximum + 6 > bytes.length)
        throw Error("Invalid token dictionary");
      const packed = new Int16Array((maximum / 10 + 1) * 3);
      const source = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      for (let token = 0; token <= maximum / 10; token++)
        for (let field = 0; field < 3; field++)
          packed[token * 3 + field] = source.getInt16(
            token * 10 + field * 2,
            true,
          );
      return {
        getShort(offset: number) {
          return packed[Math.floor(offset / 10) * 3 + (offset % 10) / 2];
        },
      };
    } finally {
      releaseBuffer(bytes);
    }
  };
  const known = Object.create(TokenInfoDictionary.prototype) as Target;
  const unknown = Object.create(UnknownDictionary.prototype) as Target;
  const dic = new DynamicDictionaries(undefined, known, undefined, unknown);
  const asInt32 = (name: string) => {
    const bytes = raw(name);
    return new Int32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  };
  const check = asInt32("check");
  let last = check.length - 1;
  while (last >= 0 && check[last] < 0) last--;
  if (last < 0) throw Error("Invalid dictionary trie");
  // Same boundary as doublearray's shrink(): retain the final unused node.
  // Out-of-range reads already return the unused-node sentinel in doublearray.
  const length = last + 2;
  const trimmedCheck = check.slice(0, length);
  releaseBuffer(check);
  const base = asInt32("base");
  const trimmedBase = base.slice(0, length);
  releaseBuffer(base);
  dic.loadTrie(trimmedBase, trimmedCheck);
  const knownMap = packedMap(raw("tid_map"));
  known.loadTargetMap = () => {
    known.target_map = knownMap.map;
    return known;
  };
  dic.loadTokenInfoDictionaries(
    new Uint8Array(),
    new Uint8Array(),
    new Uint8Array(),
  );
  // Surface-only Viterbi needs three int16 fields, never the int32 POS offset.
  known.dictionary = records("tid", knownMap.maxToken);
  const cc = raw("cc");
  dic.loadConnectionCosts(
    new Int16Array(cc.buffer, cc.byteOffset, cc.byteLength / 2),
  );
  const unknownMap = packedMap(raw("unk_map"));
  unknown.loadTargetMap = () => {
    unknown.target_map = unknownMap.map;
    return unknown;
  };
  const compat = raw("unk_compat");
  dic.loadUnknownDictionaries(
    new Uint8Array(),
    new Uint8Array(),
    new Uint8Array(),
    raw("unk_char"),
    new Uint32Array(compat.buffer, compat.byteOffset, compat.byteLength / 4),
    raw("unk_invoke"),
  );
  unknown.dictionary = records("unk", unknownMap.maxToken);
  return dic;
}
