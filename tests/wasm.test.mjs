import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import fs from "node:fs";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/infrastructure/worker/search-worker.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  loader: { ".wasm": "binary" },
  define: { "import.meta.url": '""' },
});
function harness() {
  const code = `globalThis.self=globalThis;globalThis.crypto=require('node:crypto').webcrypto;globalThis.indexedDB=require('fake-indexeddb').indexedDB;const {parentPort}=require('node:worker_threads');self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',data=>self.onmessage({data}));\n${bundle.outputFiles[0].text}`;
  const w = new Worker(code, { eval: true });
  let id = 0;
  const pending = new Map();
  w.on("message", (m) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(Error(m.error)) : p.resolve(m.value);
  });
  w.on("error", (error) => {
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  });
  return {
    close: () => w.terminate(),
    call: (type, payload) =>
      new Promise((resolve, reject) => {
        const key = ++id;
        pending.set(key, { resolve, reject });
        w.postMessage({ id: key, type, payload });
      }),
  };
}
const dictionaries = Object.fromEntries(
  fs
    .readdirSync("node_modules/kuromoji/dict")
    .filter((f) => f.endsWith(".gz"))
    .map((name) => {
      const b = fs.readFileSync("node_modules/kuromoji/dict/" + name);
      return [
        name.replace(".dat.gz", ""),
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      ];
    }),
);
const config = { similarity: 0.7, limit: 50 };
const hasModelAssets = fs.existsSync("assets/manifest.json");
test(
  "real WASM Worker soft matches, highlights UTF-16, preserves generations and restores cached indices",
  { timeout: 60000 },
  async () => {
    const w = harness();
    try {
      const payload = {
        vectors: new Float32Array([1, 0, 0, 1, 0, 1, -1, 0, 0, 0]).buffer,
        dimensions: 2,
        vocabulary: JSON.stringify({
          gold: 0,
          winner: 1,
          medalist: 2,
          silver: 3,
        }),
        dictionaries,
        version: "test-index-v1",
        vault: "fixture",
      };
      await w.call("init", payload);
      const documents = [
        { path: "a.md", text: "😀\ngold medalist" },
        { path: "b.md", text: "silver" },
        { path: "nul.md", text: "gold\0medalist" },
      ];
      const built = await w.call("sync", documents);
      assert.ok(built.rebuilt > 0);
      let r = await w.call("search", { query: "gold winner", config });
      assert.ok(r.results.length > 0);
      const h = r.results.find((h) => h.path === "a.md");
      assert.ok(h);
      assert.equal(h.line, 1);
      assert.equal(h.excerpt.slice(...h.match_ranges[0]), "gold medalist");
      // Same model/dictionary initialized again models a process restart; IndexedDB persists.
      await w.call("init", payload);
      const cached = await w.call("sync", documents);
      assert.equal(cached.rebuilt, 0);
      assert.ok(cached.restored > 0);
      const again = await w.call("search", { query: "gold winner", config });
      assert.deepEqual(again.results, r.results);
      await w.call("sync", [{ path: "renamed.md", text: "gold medalist" }]);
      r = await w.call("search", { query: "gold winner", config });
      assert.ok(r.results.every((h) => h.path === "renamed.md"));
      const missing = await w.call("search", { query: "missingword", config });
      assert.deepEqual(missing.results, []);
      assert.equal(missing.literalOnly, "unknown");
      r = await w.call("search", { query: "renamed", config });
      assert.equal(r.results[0].path, "renamed.md");
      await w.call("sync", []);
      r = await w.call("search", { query: "gold winner", config });
      assert.deepEqual(r.results, []);
    } finally {
      await w.close();
    }
  },
);
test(
  "actual Japanese model and IPADIC tokenize/search/highlight without Python",
  { timeout: 60000, skip: !hasModelAssets },
  async () => {
    const w = harness();
    try {
      const b = fs.readFileSync("assets/vectors.f32");
      const metadata = JSON.parse(
        fs.readFileSync("assets/manifest.json", "utf8"),
      );
      await w.call("init", {
        vectors: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        dimensions: metadata.dimensions,
        vocabulary: fs.readFileSync("assets/vocab.json", "utf8"),
        dictionaries,
        version: metadata.version,
        vault: "japanese-fixture",
      });
      await w.call("sync", [
        {
          path: "競技.md",
          text: "😀日本語の先頭行\n金メダルを受賞した選手です。",
        },
      ]);
      const result = await w.call("search", {
        query: "金メダル",
        config: { ...config, similarity: 0.9 },
      });
      assert.ok(result.results.length, result.message);
      const hit = result.results[0];
      assert.equal(hit.path, "競技.md");
      assert.equal(hit.line, 1);
      assert.equal(hit.excerpt.slice(...hit.match_ranges[0]), "金メダル");
    } finally {
      await w.close();
    }
  },
);

test(
  "English/Japanese models, case-insensitive exact matches, mixed notes and complete opt-out",
  { timeout: 60000, skip: !hasModelAssets },
  async () => {
    const w = harness();
    try {
      const metadata = JSON.parse(
        fs.readFileSync("assets/manifest.json", "utf8"),
      );
      const models = ["ja", "en"].map((language) => {
        const spec = metadata.models[language];
        const prefix = spec.path ? `assets/${spec.path}/` : "assets/";
        const b = fs.readFileSync(prefix + "vectors.f32");
        return {
          ...spec,
          language,
          vectors: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
          vocabulary: fs.readFileSync(prefix + "vocab.json", "utf8"),
        };
      });
      const init = { models, dictionaries, vault: "bilingual-fixture" };
      await w.call("init", init);
      const documents = [
        {
          path: "english.md",
          text: "😀\nA car is parked here.\nMACHINE learning and neural networks.",
        },
        { path: "日本語.md", text: "機械学習の研究と金メダル。" },
        {
          path: "mixed.md",
          text: "機械学習と machine learning を研究する。\nUniqueSoftMatchaWord",
        },
      ];
      await w.call("sync", documents);
      const config = {
        similarity: 0.4,
        limit: 50,
        searchLanguages: ["ja", "en"],
      };
      let result = await w.call("search", { query: "automobile", config });
      assert.ok(
        result.results.some(
          (h) =>
            h.path === "english.md" &&
            h.excerpt.slice(...h.match_ranges[0]).toLowerCase() === "car",
        ),
      );
      result = await w.call("search", { query: "machine learning", config });
      assert.ok(
        result.results.some(
          (h) =>
            h.path === "english.md" &&
            h.excerpt.slice(...h.match_ranges[0]) === "MACHINE learning",
        ),
      );
      result = await w.call("search", { query: "金メダル", config });
      assert.ok(result.results.some((h) => h.path === "日本語.md"));
      result = await w.call("search", {
        query: "uniquesoftmatchaword",
        config,
      });
      assert.ok(result.results.some((h) => h.path === "mixed.md"));
      assert.equal(result.literalOnly, "unknown");
      await w.call("init", {
        models: [],
        dictionaries: {},
        vault: "bilingual-fixture",
      });
      const sync = await w.call("sync", documents);
      assert.equal(sync.rebuilt, 0);
      result = await w.call("search", {
        query: "automobile",
        config: { ...config, searchLanguages: [] },
      });
      assert.deepEqual(result.results, []);
      assert.equal(result.literalOnly, "disabled");
      result = await w.call("search", {
        query: "MACHINE learning",
        config: { ...config, searchLanguages: [] },
      });
      assert.ok(result.results.some((h) => h.path === "english.md"));
      result = await w.call("search", {
        query: "機械学習",
        config: { ...config, searchLanguages: [] },
      });
      assert.ok(result.results.some((h) => h.path === "日本語.md"));
    } finally {
      await w.close();
    }
  },
);

test(
  "standard installation needs no model/dictionary and English tokenization has no prototype-key crashes",
  { timeout: 60000 },
  async () => {
    const w = harness();
    try {
      const documents = [
        {
          path: "note.md",
          text: "Hello WORLD\n日本語の検索\ntoString constructor",
        },
      ];
      await w.call("init", {
        models: [],
        dictionaries: {},
        vault: "fresh-worker",
      });
      await w.call("sync", documents);
      let result = await w.call("search", {
        query: "hello world",
        config: { ...config, searchLanguages: ["ja", "en"] },
      });
      assert.equal(
        result.results[0].excerpt.slice(...result.results[0].match_ranges[0]),
        "Hello WORLD",
      );
      result = await w.call("search", {
        query: "日本語",
        config: { ...config, searchLanguages: ["ja", "en"] },
      });
      assert.equal(result.results[0].line, 1);
      await w.call("init", {
        models: [
          {
            language: "en",
            vectors: new Float32Array([1, 0, 0, 1, 0, 1, -1, 0, 0, 0]).buffer,
            dimensions: 2,
            vocabulary: JSON.stringify({
              gold: 0,
              winner: 1,
              medalist: 2,
              silver: 3,
            }),
            version: "synthetic-english-v1",
          },
        ],
        dictionaries: {},
        vault: "english-worker",
      });
      await w.call("sync", [
        ...documents,
        { path: "award.md", text: "GOLD medalist" },
      ]);
      result = await w.call("search", {
        query: "gold winner",
        config: { ...config, searchLanguages: ["en"] },
      });
      assert.ok(
        result.results.some(
          (h) =>
            h.path === "award.md" &&
            h.excerpt.slice(...h.match_ranges[0]) === "GOLD medalist",
        ),
      );
    } finally {
      await w.close();
    }
  },
);
