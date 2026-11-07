import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
const { outputFiles } = await build({
  stdin: {
    contents: `export {boundedWasm,mobileWasmBytes} from './src/infrastructure/worker/mobile/wasm-memory'; export {initSync} from './resources/wasm/softmatcha_wasm';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
});
const { boundedWasm, mobileWasmBytes, initSync } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);
test("iOS WASM cannot grow past 32 MiB and the desktop binary stays unchanged", () => {
  const bytes = new Uint8Array(
    fs.readFileSync("resources/wasm/softmatcha_wasm_bg.wasm"),
  );
  const original = bytes.slice();
  const exports = initSync({ module: boundedWasm(bytes) });
  assert.deepEqual(bytes, original);
  const memory = exports.memory;
  memory.grow(mobileWasmBytes / 65536 - memory.buffer.byteLength / 65536);
  assert.equal(memory.buffer.byteLength, mobileWasmBytes);
  assert.throws(() => memory.grow(1), RangeError);
});
