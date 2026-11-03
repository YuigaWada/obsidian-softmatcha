import {
  initSync,
  SearchEngine,
} from "../../../vendor/softmatcha-wasm/softmatcha_wasm.js";
import bytes from "../../../vendor/softmatcha-wasm/softmatcha_wasm_bg.wasm";
import { japaneseTokenizer } from "./tokenizer";
import { englishTokenizer } from "./english-tokenizer";
import { literalSearch, type Note } from "./literal-search";
import { IndexCache } from "./cache";
import {
  SearchFault,
  type SearchLanguage,
  type SearchConfig,
  type SearchResult,
  type Hit,
} from "../../domain/search";
import type { WorkerRequest, ModelInput } from "./protocol";
interface Runtime {
  language: SearchLanguage;
  engine: SearchEngine;
  tokenize: ReturnType<typeof japaneseTokenizer>;
  vocabulary: Record<string, number>;
  unknown: number;
  version: string;
  keys: Set<string>;
}
let models: Runtime[] = [];
let cache: IndexCache;
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
async function execute(request: WorkerRequest): Promise<unknown> {
  if (request.type === "init") {
    const payload = request.payload;
    for (const model of models) model.engine.free();
    models = [];
    cache?.close();
    notes = [];
    const specs: ModelInput[] = payload.models ?? [
      { ...payload, language: "ja" },
    ];
    if (specs.length) initSync({ module: new Uint8Array(bytes).buffer });
    const japanese = specs.some((s) => s.language === "ja")
      ? japaneseTokenizer(payload.dictionaries)
      : undefined;
    try {
      for (const spec of specs) {
        const vocabulary = JSON.parse(spec.vocabulary) as Record<
          string,
          number
        >;
        models.push({
          language: spec.language,
          engine: new SearchEngine(
            new Float32Array(spec.vectors),
            spec.dimensions,
          ),
          tokenize: spec.language === "ja" ? japanese! : englishTokenizer,
          vocabulary,
          unknown: Object.keys(vocabulary).length,
          version: spec.version,
          keys: new Set(),
        });
      }
    } catch (error) {
      for (const model of models) model.engine.free();
      models = [];
      throw error;
    }
    cache = new IndexCache(`softmatcha:${payload.vault}`);
    return true;
  }
  if (request.type === "sync") {
    const payload = request.payload;
    const next: Note[] = payload;
    const buckets: Note[][] = Array.from({ length: 8 }, () => []);
    for (const note of next) {
      let hash = 2166136261;
      for (let i = 0; i < note.path.length; i++)
        hash = Math.imul(hash ^ note.path.charCodeAt(i), 16777619);
      buckets[(hash >>> 0) % 8].push(note);
    }
    const staged = new Map<Runtime, string[]>();
    let rebuilt = 0;
    let restored = 0;
    try {
      for (const model of models) {
        const keys: string[] = [];
        staged.set(model, keys);
        for (let i = 0; i < buckets.length; i++) {
          const bucket = buckets[i].sort((a, b) =>
            a.path.localeCompare(b.path),
          );
          if (!bucket.length) continue;
          const key = `${model.language === "ja" ? "" : "en:"}${i}:${await digest(model.version + "\0" + JSON.stringify(bucket))}`;
          keys.push(key);
          if (model.keys.has(key)) continue;
          const stored = await cache.get(key);
          if (stored) {
            try {
              model.engine.restore_shard(key, stored);
              restored++;
              continue;
            } catch {
              /* Rebuild bad checkpoints. */
            }
          }
          model.engine.replace_shard(
            key,
            JSON.stringify(
              bucket.map((n) => ({
                ...n,
                tokens: model.tokenize(n.text, model.vocabulary, model.unknown),
              })),
            ),
          );
          rebuilt++;
          await cache.put(key, model.engine.export_shard(key));
        }
      }
      for (const [model, keys] of staged) {
        for (const key of model.keys)
          if (!keys.includes(key)) model.engine.remove_shard(key);
        model.keys = new Set(keys);
      }
      notes = [...next].sort((a, b) => a.path.localeCompare(b.path));
      await cache.retain([...staged.values()].flat());
      return { rebuilt, restored };
    } catch (error) {
      for (const [model, keys] of staged)
        for (const key of keys)
          if (!model.keys.has(key)) model.engine.remove_shard(key);
      throw error;
    }
  }
  if (request.type === "search") {
    const payload = request.payload;
    const { query, config }: { query: string; config: SearchConfig } = payload;
    const title: Hit[] = notes
      .filter((n) =>
        n.path
          .replace(/\.md$/, "")
          .split("/")
          .slice(-1)[0]
          .normalize("NFKC")
          .toLowerCase()
          .includes(query.normalize("NFKC").toLowerCase()),
      )
      .map((n) => ({
        path: n.path,
        line: 0,
        excerpt: "",
        kind: "title",
        score: 1.01,
      }));
    const literal = literalSearch(notes, query, config.limit * 4);
    const language: SearchLanguage =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query)
        ? "ja"
        : "en";
    // Older single-model clients use their explicitly loaded engine.
    const enabled = config.searchLanguages ?? models.map((m) => m.language);
    const model =
      models.find(
        (m) => m.language === language && enabled.includes(m.language),
      ) ??
      (config.searchLanguages === undefined && models.length === 1
        ? models[0]
        : undefined);
    const tokens =
      model?.tokenize(query, model.vocabulary, model.unknown) ?? [];
    let literalOnly: SearchResult["literalOnly"];
    let hits: Hit[] = [];
    if (!model) literalOnly = "disabled";
    else if (tokens.some((t) => t.id === model.unknown))
      literalOnly = "unknown";
    else if (tokens.length > 12) {
      if (!literal.length && !title.length)
        throw new SearchFault("tooManyTokens");
    } else if (tokens.length)
      hits = JSON.parse(
        model.engine.search(
          new Uint32Array(tokens.map((t) => t.id)),
          config.similarity,
          config.limit,
          1500,
        ),
      ) as Hit[];
    const unique = new Map<string, Hit>();
    for (const hit of [...title, ...literal, ...hits]) {
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
    return { results, mode: "wasm", literalOnly } satisfies SearchResult;
  }
  throw Error("Unknown worker request");
}
let tail = Promise.resolve();
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data;
  tail = tail.then(async () => {
    try {
      self.postMessage({ id, value: await execute(event.data) });
    } catch (error) {
      self.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
        code: error instanceof SearchFault ? error.code : undefined,
      });
    }
  });
};
