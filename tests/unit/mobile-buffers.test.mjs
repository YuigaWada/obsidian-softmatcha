import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/infrastructure/worker/mobile/buffers.ts"],
  bundle: true,
  write: false,
  format: "esm",
});
const { releaseBuffer } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

test("consumed buffers detach without invalidating independent copies", () => {
  const original = new Float32Array([1, 2, 3]);
  const copy = original.slice();
  releaseBuffer(original);
  assert.equal(original.byteLength, 0);
  assert.deepEqual([...copy], [1, 2, 3]);
  releaseBuffer(original);
});

test("older engines and shared buffers keep the garbage-collected fallback", () => {
  const legacy = new ArrayBuffer(16);
  Object.defineProperty(legacy, "transfer", { value: undefined });
  releaseBuffer(legacy);
  assert.equal(legacy.byteLength, 16);
  const shared = new Uint8Array(new SharedArrayBuffer(16));
  releaseBuffer(shared);
  assert.equal(shared.byteLength, 16);
});
