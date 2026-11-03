declare module "kuromoji/src/dict/DynamicDictionaries" {
  const Constructor: any;
  export default Constructor;
}
declare module "kuromoji/src/Tokenizer" {
  const Constructor: any;
  export default Constructor;
}
declare module "*softmatcha_wasm.js" {
  export default function init(input: unknown): Promise<unknown>;
  export class SearchEngine {
    constructor(vectors: Float32Array, dimensions: number);
    replace_shard(id: string, documents: string): void;
    restore_shard(id: string, bytes: Uint8Array): void;
    export_shard(id: string): Uint8Array;
    remove_shard(id: string): void;
    search(
      query: Uint32Array,
      minimum: number,
      limit: number,
      budget: number,
    ): string;
    free(): void;
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
