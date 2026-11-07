import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
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
  const worker = new Worker(
    `globalThis.self=globalThis;globalThis.crypto=require('node:crypto').webcrypto;globalThis.indexedDB=require('fake-indexeddb').indexedDB;const {parentPort}=require('node:worker_threads');self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',data=>self.onmessage({data}));\n${bundle.outputFiles[0].text}`,
    { eval: true },
  );
  let id = 0;
  const pending = new Map();
  const partials = [];
  worker.on("message", (m) => {
    const p = pending.get(m.id);
    if (m.partial) {
      partials.push(m);
      return;
    }
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(Error(m.error)) : p.resolve(m.value);
  });
  worker.on("error", (e) => {
    for (const p of pending.values()) p.reject(e);
    pending.clear();
  });
  return {
    worker,
    partials,
    close: () => worker.terminate(),
    call: (type, payload) =>
      new Promise((resolve, reject) => {
        const key = ++id;
        pending.set(key, { resolve, reject });
        worker.postMessage({ id: key, type, payload });
      }),
  };
}
const model = () => ({
  language: "en",
  vectors: new Float32Array([1, 0, 0, 1, 0, 1, -1, 0, 0, 0]).buffer,
  dimensions: 2,
  vocabulary: JSON.stringify({ gold: 0, winner: 1, medalist: 2, silver: 3 }),
  version: "fixture-v1",
});
const config = { searchLanguages: ["en"], similarity: 0.7, limit: 50 };
const files = [
  { path: "a.md", mtime: 1, size: 18 },
  { path: "b.md", mtime: 1, size: 6 },
];
test(
  "iOS paged vectors preserve soft matching and update only changed notes",
  { timeout: 30000 },
  async () => {
    const w = harness();
    try {
      await w.call("init", {
        mobile: true,
        models: [],
        dictionaries: {},
        vault: "mobile-fixture",
      });
      assert.equal(
        await w.call("model-check", { language: "en", version: "fixture-v1" }),
        false,
      );
      await w.call("model", model());
      assert.deepEqual(await w.call("sync-plan", files), ["a.md", "b.md"]);
      await w.call("sync-note", { file: files[0], text: "😀\ngold medalist" });
      await w.call("sync-note", { file: files[1], text: "silver" });
      await w.call(
        "sync-commit",
        files.map((f) => f.path),
      );
      const r = await w.call("search", { query: "gold winner", config });
      const hit = r.results.find((h) => h.path === "a.md");
      assert.ok(hit);
      assert.ok(w.partials.length > 0);
      assert.equal(w.partials.at(-1).value.pendingSemantic, true);
      assert.equal(r.pendingSemantic, undefined);
      assert.equal(hit.line, 1);
      assert.equal(hit.excerpt.slice(...hit.match_ranges[0]), "gold medalist");
      for (let i = 0; i < 12; i++) {
        const repeated = await w.call("search", {
          query: "gold winner",
          config,
        });
        assert.deepEqual(repeated.results, r.results);
      }
      assert.deepEqual(await w.call("sync-plan", files), []);
      const changed = [{ ...files[0], mtime: 2 }, files[1]];
      assert.deepEqual(await w.call("sync-plan", changed), ["a.md"]);
      await w.call("sync-note", { file: changed[0], text: "silver" });
      assert.equal(
        (await w.call("search", { query: "gold winner", config })).results
          .length,
        0,
      );
      await w.call("init", {
        mobile: true,
        models: [],
        dictionaries: {},
        vault: "mobile-fixture",
      });
      assert.equal(
        await w.call("model-check", { language: "en", version: "fixture-v1" }),
        true,
      );
      assert.deepEqual(await w.call("sync-plan", changed), []);
      await w.call("sync-commit", []);
      assert.deepEqual(
        (await w.call("search", { query: "silver", config })).results,
        [],
      );
    } finally {
      await w.close();
    }
  },
);
test(
  "iOS queued stale queries are cancelled without leaving pending requests",
  { timeout: 10000 },
  async () => {
    const w = harness();
    try {
      await w.call("init", {
        mobile: true,
        models: [],
        dictionaries: {},
        vault: "cancel-fixture",
      });
      const searches = Array.from({ length: 30 }, (_, i) =>
        w.call("search", { query: "old" + i, config }),
      );
      w.worker.postMessage({ id: 0, type: "cancel" });
      await Promise.all(searches);
      assert.deepEqual(
        (await w.call("search", { query: "new", config })).results,
        [],
      );
    } finally {
      await w.close();
    }
  },
);

test(
  "iOS background indexing pauses while hidden and resumes without losing work",
  { timeout: 10000 },
  async () => {
    const w = harness();
    try {
      await w.call("init", {
        mobile: true,
        models: [],
        dictionaries: {},
        vault: "pause-fixture",
      });
      w.worker.postMessage({ id: 0, type: "visibility", payload: false });
      let finished = false;
      const work = w.call("sync-plan", files).then((value) => {
        finished = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(finished, false);
      w.worker.postMessage({ id: 0, type: "visibility", payload: true });
      assert.deepEqual(await work, ["a.md", "b.md"]);
    } finally {
      await w.close();
    }
  },
);

test(
  "mobile chunk boundaries preserve source lines and UTF-16 highlight ranges",
  { timeout: 10000 },
  async () => {
    const w = harness();
    try {
      await w.call("init", {
        mobile: true,
        models: [],
        dictionaries: {},
        vault: "boundary-fixture",
      });
      await w.call("model", model());
      const text = "😀".repeat(4100) + "\ngold medalist";
      await w.call("sync-note", {
        file: { path: "unicode.md", mtime: 1, size: text.length },
        text,
      });
      await w.call("sync-commit", ["unicode.md"]);
      const r = await w.call("search", { query: "gold winner", config });
      const h = r.results.find((h) => h.path === "unicode.md");
      assert.ok(h);
      assert.equal(h.line, 1);
      assert.equal(h.excerpt.slice(...h.match_ranges[0]), "gold medalist");
    } finally {
      await w.close();
    }
  },
);

test(
  "high-diversity mobile notes keep matches after an incremental section boundary",
  { timeout: 10000 },
  async () => {
    const w = harness();
    try {
      await w.call("init", {
        mobile: true,
        models: [],
        dictionaries: {},
        vault: "diversity-fixture",
      });
      const vocabulary = Object.fromEntries(
        Array.from({ length: 600 }, (_, i) => [String(i), i]),
      );
      Object.assign(vocabulary, { gold: 600, winner: 601, medalist: 602 });
      const vectors = new Float32Array(604 * 2);
      for (let i = 0; i < 600; i++) vectors[i * 2] = -1;
      vectors[600 * 2] = 1;
      vectors[601 * 2 + 1] = vectors[602 * 2 + 1] = 1;
      await w.call("model", {
        language: "en",
        dimensions: 2,
        vectors: vectors.buffer,
        vocabulary: JSON.stringify(vocabulary),
        version: "diversity",
      });
      const text =
        Array.from({ length: 600 }, (_, i) => String(i)).join(" ") +
        "\n😀 gold medalist";
      await w.call("sync-note", {
        file: { path: "diverse.md", mtime: 1, size: text.length },
        text,
      });
      await w.call("sync-commit", ["diverse.md"]);
      const r = await w.call("search", { query: "gold winner", config });
      const hit = r.results.find((h) => h.path === "diverse.md");
      assert.ok(hit);
      assert.equal(hit.line, 1);
      assert.equal(hit.excerpt.slice(...hit.match_ranges[0]), "gold medalist");
    } finally {
      await w.close();
    }
  },
);
