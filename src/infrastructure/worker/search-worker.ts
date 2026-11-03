import init, { SearchEngine } from "../../../rust/pkg/softmatcha_wasm.js";
import bytes from "../../../rust/pkg/softmatcha_wasm_bg.wasm";
import { japaneseTokenizer } from "./tokenizer";
import { IndexCache } from "./cache";
import type { SearchConfig, SearchResult, Hit } from "../../domain/search";
interface Note {
  path: string;
  text: string;
}
let engine: SearchEngine;
let tokenize: ReturnType<typeof japaneseTokenizer>;
let vocabulary: Record<string, number>;
let unknown: number;
let modelVersion: string;
let cache: IndexCache;
let keys = new Set<string>();
let notes: Note[] = [];
async function digest(value: string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
async function execute(type: string, payload: any): Promise<unknown> {
  if (type === "init") {
    engine?.free();
    cache?.close();
    keys = new Set();
    notes = [];
    await init({ module_or_path: bytes });
    vocabulary = JSON.parse(payload.vocabulary);
    unknown = Object.keys(vocabulary).length;
    tokenize = japaneseTokenizer(payload.dictionaries);
    modelVersion = payload.version;
    engine = new SearchEngine(
      new Float32Array(payload.vectors),
      payload.dimensions,
    );
    cache = new IndexCache(`softmatcha:${payload.vault}`);
    return true;
  }
  if (type === "sync") {
    const next: Note[] = payload;
    const buckets: Note[][] = Array.from({ length: 8 }, () => []);
    for (const note of next) {
      let hash = 2166136261;
      for (let i = 0; i < note.path.length; i++)
        hash = Math.imul(hash ^ note.path.charCodeAt(i), 16777619);
      buckets[(hash >>> 0) % 8].push(note);
    }
    const staged: string[] = [];
    let rebuilt = 0;
    let restored = 0;
    try {
      for (let i = 0; i < buckets.length; i++) {
        const bucket = buckets[i].sort((a, b) => a.path.localeCompare(b.path));
        if (!bucket.length) continue;
        const key = `${i}:${await digest(modelVersion + "\0" + JSON.stringify(bucket))}`;
        staged.push(key);
        if (keys.has(key)) continue;
        const stored = await cache.get(key);
        if (stored) {
          try {
            engine.restore_shard(key, stored);
            restored++;
            continue;
          } catch {
            /* Rebuild corrupted checkpoint. */
          }
        }
        rebuilt++;
        engine.replace_shard(
          key,
          JSON.stringify(
            bucket.map((n) => ({
              ...n,
              tokens: tokenize(n.text, vocabulary, unknown),
            })),
          ),
        );
        await cache.put(key, engine.export_shard(key));
      }
      for (const key of keys)
        if (!staged.includes(key)) engine.remove_shard(key);
      keys = new Set(staged);
      notes = next;
      await cache.retain(staged);
      return { rebuilt, restored };
    } catch (error) {
      for (const key of staged) if (!keys.has(key)) engine.remove_shard(key);
      throw error;
    }
  }
  if (type === "search") {
    const { query, config }: { query: string; config: SearchConfig } = payload;
    const title = notes
      .filter((n) =>
        n.path
          .replace(/\.md$/, "")
          .split("/")
          .slice(-1)[0]
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(query.normalize("NFKC").toLocaleLowerCase()),
      )
      .map(
        (n) =>
          ({
            path: n.path,
            line: 0,
            excerpt: "ファイル名の一致",
            score: 1.01,
          }) as Hit,
      );
    const tokens = tokenize(query, vocabulary, unknown);
    if (tokens.some((t) => t.id === unknown)) {
      if (title.length)
        return {
          results: title.slice(0, config.limit),
          message:
            "ファイル名の一致 · 本文検索にはモデル未登録語が含まれています",
        };
      throw Error(
        "モデルの語彙にない語があります。別の表現で検索してください。",
      );
    }
    const hits: Hit[] = tokens.length
      ? JSON.parse(
          engine.search(
            new Uint32Array(tokens.map((t) => t.id)),
            config.similarity,
            config.limit,
            1500,
          ),
        )
      : [];
    const unique = new Map<string, Hit>();
    for (const hit of [...title, ...hits]) {
      const key = `${hit.path}\0${hit.line}`;
      if (!unique.has(key) || unique.get(key)!.score < hit.score)
        unique.set(key, hit);
    }
    const results = [...unique.values()]
      .sort(
        (a, b) =>
          b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line,
      )
      .slice(0, config.limit);
    return {
      results,
      message: `${results.length}件 · SoftMatcha 2 WASM`,
    } satisfies SearchResult;
  }
  throw Error("Unknown worker request");
}
// Serialize mutations and queries; model and dictionary survive modal open/close.
let tail = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  const { id, type, payload } = event.data;
  tail = tail.then(async () => {
    try {
      self.postMessage({ id, value: await execute(type, payload) });
    } catch (error) {
      self.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });
};
