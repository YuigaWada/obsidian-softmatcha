declare module "kuromoji/src/dict/DynamicDictionaries" {
  export default class DynamicDictionaries {
    constructor(
      trie?: unknown,
      tokenInfo?: unknown,
      costs?: unknown,
      unknownDictionary?: unknown,
    );
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
    getLattice(text: string): unknown;
    viterbi_searcher: { search(lattice: unknown): { surface_form: string }[] };
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

declare module "kuromoji/src/dict/TokenInfoDictionary" {
  export default class TokenInfoDictionary {}
}
declare module "kuromoji/src/dict/UnknownDictionary" {
  export default class UnknownDictionary {}
}
declare module "kuromoji/src/viterbi/ViterbiNode" {
  export default class ViterbiNode {
    name: number;
    cost: number;
    start_pos: number;
    length: number;
    type: string;
    left_id: number;
    right_id: number;
    surface_form: string;
    prev: ViterbiNode | null | undefined;
    shortest_cost: number;
    constructor(
      id: number,
      cost: number,
      start: number,
      length: number,
      type: string,
      left: number,
      right: number,
      surface: string,
    );
  }
}
declare module "kuromoji/src/viterbi/ViterbiLattice" {
  import ViterbiNode from "kuromoji/src/viterbi/ViterbiNode";
  export default class ViterbiLattice {
    append(node: ViterbiNode): void;
    appendEos(): void;
  }
}
declare module "kuromoji/src/util/SurrogateAwareString" {
  export default class SurrogateAwareString {
    constructor(text: string);
    length: number;
    slice(index: number): string;
    charAt(index: number): string;
  }
}
