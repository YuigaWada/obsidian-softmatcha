/* tslint:disable */
/* eslint-disable */

/**
 * A single bounded disk-backed shard; no resident vector model.
 */
export class MobileShard {
    free(): void;
    [Symbol.dispose](): void;
    static build(documents: string, size: number, dimensions: number, ids: Uint32Array | number[], vectors: Float32Array | number[]): Uint8Array;
    constructor(bytes: Uint8Array | number[], size: number);
    search(query: Uint32Array | number[], scores: Float32Array | number[], minimum: number, limit: number, budget_ms: number): string;
}

export class SearchEngine {
    free(): void;
    [Symbol.dispose](): void;
    export_shard(id: string): Uint8Array;
    constructor(vectors: Float32Array | number[], dimensions: number);
    remove_shard(id: string): void;
    replace_shard(id: string, documents: string): void;
    restore_shard(id: string, bytes: Uint8Array | number[]): void;
    search(query: Uint32Array | number[], minimum: number, limit: number, budget_ms: number): string;
}

export function vector_scores(vectors: Float32Array | number[], lengths: Float32Array | number[], queries: Float32Array | number[], query_lengths: Float32Array | number[], dimensions: number): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_mobileshard_free: (a: number, b: number) => void;
    readonly __wbg_searchengine_free: (a: number, b: number) => void;
    readonly mobileshard_build: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly mobileshard_new: (a: number, b: number, c: number) => [number, number, number];
    readonly mobileshard_search: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly searchengine_export_shard: (a: number, b: number, c: number) => [number, number, number, number];
    readonly searchengine_new: (a: number, b: number, c: number) => [number, number, number];
    readonly searchengine_remove_shard: (a: number, b: number, c: number) => void;
    readonly searchengine_replace_shard: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly searchengine_restore_shard: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly searchengine_search: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly vector_scores: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
