// Local benchmark. Reads the specified vault; prints only counts and timings.
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { build } from "esbuild";
const root = path.resolve(process.argv[2] ?? "../..");
const { outputFiles } = await build({
  entryPoints: ["src/infrastructure/worker/search-worker.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  loader: { ".wasm": "binary" },
  define: { "import.meta.url": '""' },
});
const worker = new Worker(
  `globalThis.self=globalThis;globalThis.crypto=require('node:crypto').webcrypto;globalThis.indexedDB=require('fake-indexeddb').indexedDB;const {parentPort}=require('node:worker_threads');self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',data=>self.onmessage({data}));\n${outputFiles[0].text}`,
  { eval: true },
);
let id = 0;
const pending = new Map();
worker.on("message", (m) => {
  const p = pending.get(m.id);
  if (p) {
    pending.delete(m.id);
    m.error ? p.reject(Error(m.stack ?? m.error)) : p.resolve(m.value);
  }
});
worker.on("error", (e) => {
  for (const p of pending.values()) p.reject(e);
});
const call = (type, payload) =>
  new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    worker.postMessage({ id: key, type, payload });
  });
const binary = (file) => {
  const b = fs.readFileSync(file);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const manifest = JSON.parse(fs.readFileSync("assets/manifest.json", "utf8"));
const payload = {
 models:Object.entries(manifest.models??{ja:manifest}).map(([language,spec])=>{
  const prefix=spec.path?`assets/${spec.path}/`:'assets/';return {...spec,language,vectors:binary(prefix+'vectors.f32'),vocabulary:fs.readFileSync(prefix+'vocab.json','utf8')};
 }),
 dictionaries:Object.fromEntries(manifest.dictionaries.map(n=>[n,binary(`assets/dict/${n}.dat.gz`)])),vault:'benchmark'
};

function notes(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".") || e.isSymbolicLink()) return [];
    const file = path.join(dir, e.name);
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    if (/^(tools|output|96config)(\/|$)/.test(relative)) return [];
    if (e.isDirectory()) return notes(file);
    return file.endsWith(".md")
      ? [{ path: relative, text: fs.readFileSync(file, "utf8") }]
      : [];
  });
}
try {
  let start = performance.now();
  await call("init", payload);
  console.log(
    JSON.stringify({
      model_and_dictionary_ms: Math.round(performance.now() - start),
    }),
  );
  const documents = notes(root);
  start = performance.now();
  await call("sync", documents);
  console.log(
    JSON.stringify({
      notes: documents.length,
      index_build_ms: Math.round(performance.now() - start),
    }),
  );
  for (const query of ["検索", "機械学習", "artificial intelligence", "machine learning"]) {
    start = performance.now();
    const r = await call("search", {
      query,
      config: { similarity: 0.45, limit: 50,searchLanguages:["ja","en"] },
    });
    console.log(
      JSON.stringify({
        query,
        search_ms: Math.round(performance.now() - start),
        results: r.results.length,
      }),
    );
  }
  await call("init", payload);
  start = performance.now();
  const restored = await call("sync", documents);
  console.log(
    JSON.stringify({
      restore_ms: Math.round(performance.now() - start),
      ...restored,
    }),
  );
} finally {
  await worker.terminate();
}
