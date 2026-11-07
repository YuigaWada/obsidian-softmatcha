import { gzipSync, gunzipSync } from "fflate";
import { literalFilter, mayContain } from "./literal-filter";
import {
  initSync,
  MobileShard,
} from "../../../../resources/wasm/softmatcha_wasm.js";
import wasm from "../../../../resources/wasm/softmatcha_wasm_bg.wasm";
import { japaneseTokenizer } from "../tokenizer";
import { englishTokenizer } from "../english-tokenizer";
import { literalSearch, type Note } from "../literal-search";
import type {
  Hit,
  SearchConfig,
  SearchLanguage,
  SearchResult,
} from "../../../domain/search";
import { SearchFault } from "../../../domain/search";
import type { DocumentVersion } from "../../wasm-search-engine";
import type { WorkerRequest, WorkerReply } from "../protocol";
import { MobileStore } from "./store";
import { DiskVectors } from "./vectors";
import { releaseBuffer } from "./buffers";
interface Part {
  key: string;
  line: number;
  ids: Uint32Array;
  language: SearchLanguage;
}
interface RecordEntry {
  version: string;
  parts: Part[];
  filter?: Uint8Array;
}
const channel = new MessageChannel(),
  turns: (() => void)[] = [];
channel.port1.onmessage = () => turns.shift()?.();
const sleep = () =>
  new Promise<void>((resolve) => {
    turns.push(resolve);
    channel.port2.postMessage(0);
  });
/** iOS disk-backed search. Background work yields to the latest search at checkpoints. */
export class MobileRuntime {
  private store!: MobileStore;
  private models = new Map<SearchLanguage, DiskVectors>();
  private documents = new Map<string, RecordEntry>();
  private japanese: ReturnType<typeof japaneseTokenizer> | undefined;
  private queue: WorkerRequest[] = [];
  private busy = false;
  private searching = false;
  private latest = 0;
  private nextPart = 0;
  private lastYield = 0;
  private active = true;
  private indexing = true;
  private resumeWork: (() => void) | undefined;
  private reply(request: WorkerRequest, value: unknown, error?: unknown) {
    const message: WorkerReply = error
      ? {
          id: request.id,
          error:
            error instanceof Error ? error.message : "Mobile worker failed",
          code: error instanceof SearchFault ? error.code : undefined,
        }
      : { id: request.id, value };
    self.postMessage(message);
  }
  handle(request: WorkerRequest) {
    if (request.type === "visibility") {
      this.active = request.payload;
      if (this.active) {
        this.resumeWork?.();
        this.resumeWork = undefined;
      } else this.handle({ id: 0, type: "cancel" });
      return;
    }
    if (request.type === "cancel" || request.type === "search") {
      this.latest++;
      for (const older of this.queue.filter((r) => r.type === "search"))
        this.reply(older, { results: [] });
      this.queue = this.queue.filter((r) => r.type !== "search");
      if (request.type === "cancel") return;
      this.queue.unshift(request);
    } else this.queue.push(request);
    if (!this.busy) void this.drain();
  }
  private async process(request: WorkerRequest) {
    try {
      this.reply(request, await this.execute(request));
    } catch (error) {
      this.reply(request, undefined, error);
    }
  }
  private async drain() {
    this.busy = true;
    try {
      while (this.queue.length) await this.process(this.queue.shift()!);
    } finally {
      this.busy = false;
    }
  }
  private yieldWork = async () => {
    if (!this.active)
      await new Promise<void>((resolve) => {
        this.resumeWork = resolve;
      });
    if (performance.now() - this.lastYield < 8) return;
    await sleep();
    this.lastYield = performance.now();
    if (!this.searching)
      if (this.queue[0]?.type === "search")
        await this.process(this.queue.shift()!);
  };
  private signature(file: DocumentVersion) {
    return JSON.stringify([
      file.mtime,
      file.size,
      [...this.models.values()].map((m) => m.prefix),
      "chunks-v3",
    ]);
  }
  close() {
    this.latest++;
    this.store?.close();
    this.models.clear();
  }
  private async execute(request: WorkerRequest): Promise<unknown> {
    switch (request.type) {
      case "init": {
        initSync({ module: new Uint8Array(wasm).buffer });
        this.store = new MobileStore(request.payload.vault);
        for (const path of (await this.store.get<string[]>("paths")) ?? []) {
          const record = await this.store.get<RecordEntry>(`record:${path}`);
          if (record) this.documents.set(path, record);
        }
        return true;
      }
      case "model-check": {
        const { language, version } = request.payload;
        const model = await DiskVectors.open(
          this.store,
          language,
          version,
          this.yieldWork,
        );
        if (model) this.models.set(language, model);
        return !!model;
      }
      case "model": {
        const spec = request.payload;
        this.models.set(
          spec.language,
          await DiskVectors.install(this.store, spec, this.yieldWork),
        );
        return true;
      }
      case "dictionary":
        try {
          this.japanese = japaneseTokenizer(request.payload, true);
        } finally {
          for (const buffer of Object.values(request.payload))
            releaseBuffer(buffer);
        }
        return true;
      case "sync-plan": {
        this.indexing = true;
        const needed: string[] = [];
        for (const file of request.payload) {
          const record =
            this.documents.get(file.path) ??
            (await this.store.get<RecordEntry>(`record:${file.path}`));
          if (record) this.documents.set(file.path, record);
          if (record?.version !== this.signature(file)) needed.push(file.path);
          await this.yieldWork();
        }
        return needed;
      }
      case "sync-note":
        return this.indexNote(request.payload.file, request.payload.text);
      case "sync-commit": {
        const keep = new Set(request.payload);
        for (const [path, record] of this.documents)
          if (!keep.has(path)) {
            await this.store.remove([
              `note:${path}`,
              `record:${path}`,
              ...record.parts.map((p) => p.key),
            ]);
            this.documents.delete(path);
          }
        await this.store.put("paths", [...this.documents.keys()]);
        this.indexing = false;
        return true;
      }
      case "search":
        return this.search(
          request.payload.query,
          request.payload.config,
          request.id,
        );
      default:
        throw Error("Unsupported mobile request");
    }
  }
  private async tokens(
    text: string,
    model: DiskVectors,
    language: SearchLanguage,
  ) {
    const tokenize = language === "ja" ? this.japanese : englishTokenizer;
    if (!tokenize) throw new SearchFault("modelMissing");
    const tokens: { id: number; start: number; end: number }[] = [];
    let offset = 0,
      bytes = 0;
    const encoder = new TextEncoder();
    while (offset < text.length) {
      let end = Math.min(offset + 512, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      const part = text.slice(offset, end);
      for (const t of tokenize(
        part,
        model.meta.vocabulary,
        model.meta.size - 1,
      ))
        tokens.push({ ...t, start: t.start + bytes, end: t.end + bytes });
      bytes += encoder.encode(part).length;
      offset = end;
      await this.yieldWork();
    }
    return tokens;
  }
  private async indexNote(file: DocumentVersion, text: string) {
    const previous = this.documents.get(file.path),
      parts: Part[] = [];
    const token = Date.now().toString(36) + ":" + this.nextPart++;
    try {
      for (const [language, model] of this.models) {
        for (let start = 0, line = 0; start < text.length;) {
          let end = start,
            bytes = 0;
          const tokens: { id: number; start: number; end: number }[] = [];
          const distinct = new Set([0, model.meta.size - 1]);
          const encoder = new TextEncoder();
          // Fill one bounded section incrementally instead of tokenizing an
          // oversized section repeatedly while halving it to fit the model.
          while (end < text.length && end - start < 8192) {
            let next = Math.min(text.length, end + 512, start + 8192);
            if (next < text.length && /[\uD800-\uDBFF]/.test(text[next - 1]))
              next--;
            const slice = text.slice(end, next);
            const added = await this.tokens(slice, model, language);
            const combined = new Set([...distinct, ...added.map((t) => t.id)]);
            if (combined.size > 514 && end > start) break;
            for (const t of added)
              tokens.push({ ...t, start: t.start + bytes, end: t.end + bytes });
            for (const id of combined) distinct.add(id);
            bytes += encoder.encode(slice).length;
            end = next;
          }
          const part = text.slice(start, end);
          const ids = [...distinct].sort((a, b) => a - b);
          const compact = await model.compact(ids);
          const key = `shard:${token}:${language}:${start}`;
          let encoded: Uint8Array;
          try {
            encoded = MobileShard.build(
              JSON.stringify([{ path: file.path, text: part, tokens }]),
              model.meta.size,
              model.meta.dimensions,
              new Uint32Array(ids),
              compact,
            );
          } finally {
            releaseBuffer(compact);
          }
          const length = encoded.byteLength;
          let compressed: Uint8Array;
          try {
            compressed = gzipSync(encoded, { level: 1 });
          } finally {
            releaseBuffer(encoded);
          }
          try {
            await this.store.put(key, { bytes: compressed, length });
          } finally {
            releaseBuffer(compressed);
          }
          parts.push({
            key,
            line,
            ids: new Uint32Array([
              ...new Set(
                tokens
                  .filter((t) => t.id !== model.meta.size - 1)
                  .map((t) => t.id),
              ),
            ]),
            language,
          });
          if (end === text.length) break;
          let next = end - Math.min(512, Math.floor((end - start) / 4));
          if (next > 0 && /[\uDC00-\uDFFF]/.test(text[next])) next--;
          for (let i = start; i < next; i++)
            if (text.charCodeAt(i) === 10) line++;
          start = next;
          await this.yieldWork();
        }
      }
      await this.store.put(`note:${file.path}`, {
        path: file.path,
        text,
      } satisfies Note);
      const record = {
        version: this.signature(file),
        parts,
        filter: literalFilter(text),
      };
      await this.store.put(`record:${file.path}`, record);
      this.documents.set(file.path, record);
      if (previous) await this.store.remove(previous.parts.map((p) => p.key));
      return true;
    } catch (error) {
      await this.store.remove(parts.map((p) => p.key));
      throw error;
    }
  }
  private ranked(hits: Hit[], limit: number): Hit[] {
    const unique = new Map<string, Hit>();
    for (const hit of hits) {
      const key = `${hit.path}\0${hit.line}`;
      if (!unique.has(key) || unique.get(key)!.score < hit.score)
        unique.set(key, hit);
    }
    return [...unique.values()]
      .sort(
        (a, b) =>
          b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line,
      )
      .slice(0, limit);
  }
  private async search(
    query: string,
    config: SearchConfig,
    requestId: number,
  ): Promise<SearchResult> {
    this.searching = true;
    const generation = this.latest,
      current = () => generation === this.latest;
    try {
      const hits: Hit[] = [],
        literalLimit = config.limit * 4;
      let literalCount = 0;
      const normalized = query.normalize("NFKC").toLowerCase();
      for (const path of this.documents.keys()) {
        if (!current()) return { results: [] };
        if (
          path
            .replace(/\.md$/, "")
            .split("/")
            .pop()!
            .normalize("NFKC")
            .toLowerCase()
            .includes(normalized) &&
          hits.length < literalLimit
        )
          hits.push({ path, line: 0, excerpt: "", kind: "title", score: 1.01 });
        if (
          literalCount < literalLimit &&
          mayContain(this.documents.get(path)?.filter, query)
        ) {
          const note = await this.store.get<Note>(`note:${path}`);
          if (note) {
            const found = literalSearch(
              [note],
              query,
              literalLimit - literalCount,
            );
            literalCount += found.length;
            hits.push(...found);
          }
        }
        await this.yieldWork();
      }
      const language =
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query)
          ? "ja"
          : "en";
      const model = config.searchLanguages.includes(language)
        ? this.models.get(language)
        : undefined;
      const exact = this.ranked(hits, config.limit);
      if (exact.length >= config.limit)
        return {
          results: exact,
          mode: "wasm",
          indexing: this.indexing,
          literalOnly: model ? undefined : "disabled",
        };
      if (current())
        self.postMessage({
          id: requestId,
          partial: true,
          value: {
            results: exact,
            mode: "wasm",
            indexing: this.indexing,
            pendingSemantic: true,
          },
        });
      let literalOnly: SearchResult["literalOnly"];
      if (!model) literalOnly = "disabled";
      else {
        const tokens = await this.tokens(query, model, language),
          ids = tokens.map((t) => t.id);
        if (ids.some((id) => id === model.meta.size - 1))
          literalOnly = "unknown";
        else if (ids.length > 12) {
          if (!hits.length) throw new SearchFault("tooManyTokens");
        } else if (ids.length) {
          const scores = await model.similarities(ids, current, this.yieldWork);
          if (!scores) return { results: [] };
          try {
            if (!current()) return { results: [] };
            const candidates = [...this.documents.values()]
              .flatMap((r) => r.parts)
              .filter((p) => p.language === language)
              .map((part) => {
                let rank = 0;
                for (let i = 0; i < ids.length; i++) {
                  let best = 0;
                  for (const id of part.ids)
                    best = Math.max(best, scores[i * model.meta.size + id]);
                  rank += best;
                }
                return { part, rank };
              })
              .sort((a, b) => b.rank - a.rank);
            const deadline = performance.now() + 750;
            for (const { part } of candidates) {
              if (!current()) return { results: [] };
              if (performance.now() >= deadline) break;
              const encoded = await this.store.get<{
                bytes: Uint8Array;
                length: number;
              }>(part.key);
              if (!encoded) continue;
              if (
                !Number.isInteger(encoded.length) ||
                encoded.length < 1 ||
                encoded.length > 4 * 1024 * 1024
              )
                throw Error("Invalid mobile index cache");
              let decoded: Uint8Array;
              try {
                decoded = gunzipSync(encoded.bytes, {
                  out: new Uint8Array(encoded.length),
                });
              } finally {
                releaseBuffer(encoded.bytes);
              }
              let shard: MobileShard;
              try {
                shard = new MobileShard(decoded, model.meta.size);
              } finally {
                releaseBuffer(decoded);
              }
              try {
                const found = JSON.parse(
                  shard.search(
                    new Uint32Array(ids),
                    scores,
                    config.similarity,
                    config.limit,
                    Math.min(15, Math.max(1, deadline - performance.now())),
                  ),
                ) as Hit[];
                for (const hit of found)
                  hits.push({ ...hit, line: hit.line + part.line });
              } finally {
                shard.free();
              }
              if (hits.length > literalLimit * 2)
                hits.sort((a, b) => b.score - a.score).splice(literalLimit * 2);
              await this.yieldWork();
            }
          } finally {
            releaseBuffer(scores);
          }
        }
      }
      if (!current()) return { results: [] };
      return {
        results: this.ranked(hits, config.limit),
        mode: "wasm",
        literalOnly,
        indexing: this.indexing,
      };
    } finally {
      this.searching = false;
    }
  }
}
