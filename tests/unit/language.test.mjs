import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
async function moduleFor(file) {
  const { outputFiles } = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(outputFiles[0].text).toString("base64")
  );
}
const { messages, resolveLocale, errorText } = await moduleFor(
  "src/presentation/i18n.ts",
);
const { WasmSearchEngine } = await moduleFor(
  "src/infrastructure/wasm-search-engine.ts",
);
test("UI follows Obsidian or an explicit Japanese/English override", () => {
  assert.equal(resolveLocale("auto", "ja"), "ja");
  assert.equal(resolveLocale("auto", "en-US"), "en");
  assert.equal(resolveLocale("ja", "en"), "ja");
  assert.equal(resolveLocale("en", "ja"), "en");
  assert.equal(messages("en").open, "Open");
  assert.equal(messages("ja").open, "開く");
  assert.equal(
    errorText({ code: "tooManyTokens" }, "en"),
    "Use at most 12 tokens per query.",
  );
});
test("semantic language opt-out prevents model/dictionary loading and repeated preparation reuses the worker", async () => {
  for (const languages of [["ja"], ["en"], []]) {
    const reads = [];
    const calls = [];
    let worker;
    const metadata = {
      dictionaries: ["base"],
      models: {
        ja: { path: "", dimensions: 2, version: "ja" },
        en: { path: "en", dimensions: 2, version: "en" },
      },
    };
    const resources = {
      vaultId: "fixture",
      text: async (path) => {
        reads.push(path);
        return path === "manifest.json" ? JSON.stringify(metadata) : "{}";
      },
      binary: async (path) => {
        reads.push(path);
        return new ArrayBuffer(8);
      },
      list: () => [],
      read: async () => "",
    };
    const engine = new WasmSearchEngine(
      resources,
      () =>
        (worker = {
          postMessage(message) {
            calls.push(message);
            queueMicrotask(() =>
              worker.onmessage({ data: { id: message.id, value: true } }),
            );
          },
          terminate() {},
        }),
    );
    const config = { searchLanguages: languages };
    await Promise.all([engine.prepare(config), engine.prepare(config)]);
    await engine.prepare(config);
    assert.deepEqual(
      calls[0].payload.models.map((m) => m.language),
      languages,
    );
    assert.equal(calls.filter((m) => m.type === "init").length, 1);
    assert.equal(calls.filter((m) => m.type === "sync").length, 1);
    assert.equal(reads.includes("vectors.f32"), languages.includes("ja"));
    assert.equal(reads.includes("en/vectors.f32"), languages.includes("en"));
    assert.equal(reads.includes("dict/base.dat.gz"), languages.includes("ja"));
    engine.dispose();
  }
});

test("a fresh three-file installation prepares exact search without reading model binaries", async () => {
  const calls = [];
  let worker;
  const resources = {
    vaultId: "fresh",
    text: async () => {
      throw Error("File not found");
    },
    binary: async () => {
      throw Error("No model binary should be read");
    },
    exists: async () => false,
    list: () => [{ path: "note.md", mtime: 1, size: 5 }],
    read: async () => "hello",
  };
  const engine = new WasmSearchEngine(
    resources,
    () =>
      (worker = {
        postMessage(message) {
          calls.push(message);
          queueMicrotask(() =>
            worker.onmessage({
              data: {
                id: message.id,
                value:
                  message.type === "search"
                    ? { results: [], mode: "wasm", literalOnly: "disabled" }
                    : true,
              },
            }),
          );
        },
        terminate() {},
      }),
  );
  const config = { searchLanguages: ["ja", "en"] };
  assert.equal(await engine.prepare(config), true);
  assert.deepEqual(calls[0].payload.models, []);
  assert.deepEqual(calls[0].payload.dictionaries, {});
  assert.equal(
    (await engine.search("hello", config)).literalOnly,
    "unavailable",
  );
  engine.dispose();
});

test("persisted settings migrate without trusting malformed JSON types", async () => {
  const { loadSearchConfig } = await moduleFor("src/domain/search.ts");
  const config = loadSearchConfig({
    engine: "invalid",
    uiLanguage: "xx",
    searchLanguages: ["en", "en", "invalid"],
    limit: NaN,
    similarity: 2,
    token: 42,
  });
  assert.equal("engine" in config, false);
  assert.equal(config.uiLanguage, "auto");
  assert.deepEqual(config.searchLanguages, ["en"]);
  assert.equal(config.limit, 50);
  assert.equal(config.similarity, 0.45);
  assert.equal("token" in config, false);
  assert.equal("endpoint" in config, false);
  assert.deepEqual(
    loadSearchConfig({ searchLanguages: [] }).searchLanguages,
    [],
  );
});
