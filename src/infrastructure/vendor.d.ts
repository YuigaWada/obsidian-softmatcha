declare module "kuromoji/src/dict/DynamicDictionaries" {
  export default class DynamicDictionaries {
    loadTrie(base: Int32Array, check: Int32Array): void;
    loadTokenInfoDictionaries(
      tid: Uint8Array,
      pos: Uint8Array,
      map: Uint8Array,
    ): void;
    loadConnectionCosts(costs: Int16Array): void;
    loadUnknownDictionaries(
      unk: Uint8Array,
      pos: Uint8Array,
      map: Uint8Array,
      chars: Uint8Array,
      compat: Uint32Array,
      invoke: Uint8Array,
    ): void;
  }
}
declare module "kuromoji/src/Tokenizer" {
  import type DynamicDictionaries from "kuromoji/src/dict/DynamicDictionaries";
  export default class Tokenizer {
    constructor(dictionary: DynamicDictionaries);
    tokenize(text: string): { surface_form: string }[];
  }
}
declare module "*.wasm" {
  const bytes: Uint8Array;
  export default bytes;
}
declare module "softmatcha-worker-source" {
  const source: string;
  export default source;
}
