import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/infrastructure/worker/mobile/vectors.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2020",
});

const { DiskVectors } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
test("vector row cache retains requested rows across eviction", async () => {
  const values = new Map();
  const store = {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => values.set(key, structuredClone(value)),
    putMany: async (entries) => {
      for (const [key, value] of entries)
        values.set(key, structuredClone(value));
    },
    getMany: async (keys) =>
      keys.map((key) => structuredClone(values.get(key))),
  };
  const raw = new Float32Array(2050 * 2);
  for (let i = 0; i < 2050; i++) {
    raw[i * 2] = i / 1000;
    raw[i * 2 + 1] = 1;
  }
  const model = await DiskVectors.install(
    store,
    {
      language: "en",
      version: "eviction-test",
      dimensions: 2,
      vocabulary: "{}",
      vectors: raw.buffer.slice(0),
    },
    async () => {},
  );
  await model.compact(Array.from({ length: 1024 }, (_, i) => i + 1024));
  const ids = [
    ...Array.from({ length: 512 }, (_, i) => i),
    ...Array.from({ length: 512 }, (_, i) => i + 1024),
  ];
  const data = await model.compact(ids);
  ids.forEach((id, i) => {
    assert.equal(data[i * 2], raw[id * 2]);
    assert.equal(data[i * 2 + 1], 1);
  });
});

test("existing vector pages migrate to blobs without changing their values", async () => {
  const prefix = "vectors-rows-v2:en:legacy";
  const original = new Float32Array([1, 2, 3, 4]);
  const values = new Map([
    [
      prefix,
      { dimensions: 2, size: 2, vocabulary: {}, lengths: new Float32Array(2) },
    ],
    [`${prefix}:0`, original],
  ]);
  let writes = 0;
  const store = {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => {
      values.set(key, structuredClone(value));
      writes++;
    },
  };
  assert.ok(await DiskVectors.open(store, "en", "legacy"));
  assert.deepEqual(
    new Float32Array(await values.get(`${prefix}:0`).arrayBuffer()),
    original,
  );
  assert.equal(values.get(prefix).blobPages, true);
  const migratedWrites = writes;
  await DiskVectors.open(store, "en", "legacy");
  assert.equal(writes, migratedWrites);
});
