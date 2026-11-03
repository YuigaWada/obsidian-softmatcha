import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["src/infrastructure/model-pack-installer.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
});
const { validateModelPack, ModelPackInstaller } = await import(
  "data:text/javascript;base64," +
    Buffer.from(outputFiles[0].text).toString("base64")
);
function fixture() {
  const files = {
    "manifest.json": strToU8('{"models":{}}'),
    "en/vectors.f32": new Uint8Array(8),
    "en/vocab.json": strToU8('{"word":0}'),
    "LICENSES/NOTICE.txt": strToU8("public fixture notice"),
  };
  const catalog = {
    schema: 1,
    files: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        {
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          language: name.startsWith("en/") ? "en" : "shared",
        },
      ]),
    ),
  };
  const archive = (changes = {}) => {
    const output = {
      ...files,
      "pack.json": strToU8(JSON.stringify({ schema: 1, languages: ["en"] })),
      ...changes,
    };
    for (const name of Object.keys(output))
      if (output[name] === null) delete output[name];
    return new Uint8Array(zipSync(output)).buffer;
  };
  return { files, catalog, archive };
}
test("data-only import validates all hashes before writing and publishes the manifest last", async () => {
  const f = fixture();
  const writes = [];
  const directories = new Set();
  const store = {
    exists: async (path) => directories.has(path),
    mkdir: async (path) => {
      directories.add(path);
    },
    write: async (path, data) => {
      writes.push({ path, data });
    },
  };
  const installer = new ModelPackInstaller(store, f.catalog);
  assert.deepEqual(await installer.install(f.archive()), ["en"]);
  assert.equal(writes.at(-1).path, "manifest.json");
  assert.equal(writes.length, Object.keys(f.files).length);
  for (const changes of [
    { "main.js": strToU8("bad") },
    { "../main.js": strToU8("bad") },
    { "en/vocab.json": strToU8('{"word":1}') },
    { "en/vocab.json": null },
  ]) {
    const count = writes.length;
    await assert.rejects(installer.install(f.archive(changes)));
    assert.equal(writes.length, count);
  }
});
test("pack schema, complete language set, and malformed archives are rejected", async () => {
  const f = fixture();
  for (const languages of [[], ["de"], ["en", "en"], ["ja", "en"]])
    await assert.rejects(
      validateModelPack(
        f.archive({
          "pack.json": strToU8(JSON.stringify({ schema: 1, languages })),
        }),
        f.catalog,
      ),
    );
  await assert.rejects(
    validateModelPack(new Uint8Array([0, 1, 2]).buffer, f.catalog),
  );
});
