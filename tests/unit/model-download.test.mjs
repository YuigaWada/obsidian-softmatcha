import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";
async function moduleFor(path) {
  const { outputFiles } = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    plugins: [
      {
        name: "obsidian",
        setup(b) {
          b.onResolve({ filter: /^obsidian$/ }, () => ({
            path: "obsidian",
            namespace: "fake",
          }));
          b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({
            contents:
              'export function requestUrl(){throw Error("Unexpected real request")}',
          }));
        },
      },
    ],
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(outputFiles[0].text).toString("base64")
  );
}
const { DownloadModel } = await moduleFor("src/application/model-download.ts");
const { AutomaticModels } = await moduleFor(
  "src/application/automatic-models.ts",
);
const { GithubModelSource } = await moduleFor(
  "src/infrastructure/github-model-source.ts",
);
const { InstalledModels } = await moduleFor(
  "src/infrastructure/installed-models.ts",
);
const { ModelPackInstaller } = await moduleFor(
  "src/infrastructure/model-pack-installer.ts",
);
const defaults = { autoDownloadModels: true, searchLanguages: ["ja", "en"] };

test("automatic setup downloads only missing enabled languages once, asynchronously", async () => {
  const calls = [],
    phases = [];
  const available = new Set(["ja"]);
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const setup = new AutomaticModels(
    { has: async (l) => available.has(l) },
    new DownloadModel(
      {
        fetch: async (v, l) => {
          calls.push([v, l]);
          await pending;
          return new ArrayBuffer(1);
        },
      },
      {
        install: async (data, l) => {
          calls.push(["install", l]);
          available.add(l);
        },
      },
    ),
  );
  const first = setup.ensure(
    "0.3.3",
    () => defaults,
    (...p) => phases.push(p),
    () => assert.fail(),
  );
  assert.equal(
    setup.ensure(
      "0.3.3",
      () => defaults,
      () => {},
      () => {},
    ),
    first,
  );
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, [["0.3.3", "en"]]);
  resolve();
  await first;
  assert.deepEqual(calls, [
    ["0.3.3", "en"],
    ["install", "en"],
  ]);
  assert.deepEqual(phases, [
    ["en", "downloading"],
    ["en", "installing"],
  ]);
  assert.equal(setup.active, false);
  await setup.ensure(
    "0.3.3",
    () => defaults,
    () => {},
    () => assert.fail(),
  );
  assert.equal(calls.length, 2);
});
test("automatic and per-language opt-outs prevent requests; mid-download opt-out prevents installation", async () => {
  const calls = [];
  const setup = new AutomaticModels(
    {
      has: async () => {
        calls.push("inventory");
        return false;
      },
    },
    new DownloadModel(
      {
        fetch: async () => {
          calls.push("request");
          return new ArrayBuffer(1);
        },
      },
      { install: async () => calls.push("install") },
    ),
  );
  for (const config of [
    { ...defaults, autoDownloadModels: false },
    { ...defaults, searchLanguages: [] },
  ])
    await setup.ensure(
      "0.3.3",
      () => config,
      () => {},
      () => assert.fail(),
    );
  assert.deepEqual(calls, []);
  const config = { ...defaults, searchLanguages: ["en"] };
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const active = new AutomaticModels(
    { has: async () => false },
    new DownloadModel(
      {
        fetch: async () => {
          await pending;
          return new ArrayBuffer(1);
        },
      },
      { install: async () => assert.fail("disabled model installed") },
    ),
  );
  const task = active.ensure(
    "0.3.3",
    () => config,
    () => {},
    () => assert.fail(),
  );
  await new Promise((r) => setTimeout(r, 0));
  config.autoDownloadModels = false;
  resolve();
  await task;
});
test("failed background downloads cool down and retry without blocking other languages", async () => {
  let now = 0;
  const requested = [],
    errors = [];
  const setup = new AutomaticModels(
    { has: async (l) => l === "en" },
    new DownloadModel(
      {
        fetch: async (v, l) => {
          requested.push(l);
          throw Error("offline");
        },
      },
      { install: async () => assert.fail() },
    ),
    () => now,
  );
  for (let n = 0; n < 2; n++)
    await setup.ensure(
      "0.3.3",
      () => defaults,
      () => {},
      (l) => errors.push(l),
    );
  assert.deepEqual(requested, ["ja"]);
  now = 300001;
  await setup.ensure(
    "0.3.3",
    () => defaults,
    () => {},
    () => {},
  );
  assert.deepEqual(requested, ["ja", "ja"]);
  assert.deepEqual(errors, ["ja"]);
});
test("GitHub data source fixes the host and asset path, and rejects failed/empty downloads", async () => {
  const urls = [];
  const source = new GithubModelSource(async (url) => {
    urls.push(url);
    return { status: 200, arrayBuffer: new ArrayBuffer(1) };
  });
  await source.fetch("0.3.3", "ja");
  assert.deepEqual(urls, [
    "https://github.com/YuigaWada/obsidian-softmatcha/releases/download/models-0.3.3/models-ja-0.3.3.zip",
  ]);
  await assert.rejects(source.fetch("../bad", "en"));
  assert.equal(urls.length, 1);
  for (const status of [404, 403, 500])
    await assert.rejects(
      new GithubModelSource(async () => ({
        status,
        arrayBuffer: new ArrayBuffer(1),
      })).fetch("0.3.3", "en"),
    );
  await assert.rejects(
    new GithubModelSource(async () => ({
      status: 200,
      arrayBuffer: new ArrayBuffer(0),
    })).fetch("0.3.3", "en"),
  );
  await assert.rejects(
    new GithubModelSource(async () => {
      throw Error("offline");
    }).fetch("0.3.3", "en"),
  );
});
test("a wrong-language or damaged download never writes, and installed inventory detects partial packs", async () => {
  const files = {
    "manifest.json": strToU8('{"models":{"en":{}}}'),
    "en/vocab.json": strToU8('{"word":0}'),
    "en/vectors.f32": new Uint8Array(4),
  };
  const catalog = {
    schema: 1,
    files: Object.fromEntries(
      Object.entries(files).map(([n, b]) => [
        n,
        {
          size: b.length,
          sha256: createHash("sha256").update(b).digest("hex"),
          language: n.startsWith("en/") ? "en" : "shared",
        },
      ]),
    ),
  };
  const data = new Uint8Array(
    zipSync({
      ...files,
      "pack.json": strToU8('{"schema":1,"languages":["en"]}'),
    }),
  ).buffer;
  const saved = new Map();
  const store = {
    exists: async (p) => saved.has(p),
    mkdir: async () => {},
    write: async (p, d) => saved.set(p, new Uint8Array(d)),
    text: async (p) => new TextDecoder().decode(saved.get(p)),
  };
  const target = new ModelPackInstaller(store, catalog);
  const source = { fetch: async () => data };
  await assert.rejects(
    new DownloadModel(source, target).execute("0.3.3", "ja"),
  );
  assert.equal(saved.size, 0);
  await assert.rejects(
    new DownloadModel(
      { fetch: async () => new ArrayBuffer(3) },
      target,
    ).execute("0.3.3", "en"),
  );
  assert.equal(saved.size, 0);
  const inventory = new InstalledModels(store, catalog);
  assert.equal(await inventory.has("en"), false);
  await new DownloadModel(source, target).execute("0.3.3", "en");
  assert.equal(await inventory.has("en"), true);
  saved.delete("en/vectors.f32");
  assert.equal(await inventory.has("en"), false);
});
