import { createHash } from "node:crypto";
import fs from "node:fs";
import assert from "node:assert/strict";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const manifest = read("manifest.json");
const pkg = read("package.json");
const versions = read("versions.json");
assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/);
assert.ok(!manifest.id.includes("obsidian") && !manifest.id.endsWith("plugin"));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, manifest.version);
assert.equal(read("package-lock.json").version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.ok(!/obsidian|obsi-|sidian|\bplugin\b/i.test(manifest.name));
assert.match(manifest.name, /^[A-Za-z0-9 +()\-]+$/);
assert.ok(
  manifest.description.length <= 250 && manifest.description.endsWith("."),
);
assert.equal(manifest.isDesktopOnly, false);
for (const file of [
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "resources/wasm/softmatcha_wasm_bg.wasm",
])
  assert.ok(fs.existsSync(file), file + " is missing");
if (process.argv.includes("--built")) {
  assert.ok(
    fs.statSync("dist/main.js").size < 5 * 1024 * 1024,
    "Models must not be embedded in the plugin bundle.",
  );
  const source = fs.readFileSync("dist/main.js", "utf8");
  assert.doesNotMatch(
    source,
    /require\(["'](?:node:|fs["']|path["']|electron["'])/,
  );
  assert.ok(
    !/hotkeys\s*:/.test(fs.readFileSync("src/main.ts", "utf8")),
    "Users configure hotkeys.",
  );
}
const tag = process.env.RELEASE_TAG;
if (tag)
  assert.equal(
    tag,
    manifest.version,
    "The release tag must exactly match manifest.version.",
  );
console.log(`Release metadata valid: ${manifest.name} ${manifest.version}`);

const wasmPath = "resources/wasm/softmatcha_wasm_bg.wasm";
const wasm = fs.readFileSync(wasmPath);
assert.ok(
  !wasm.includes(Buffer.from("/Users/")),
  "WASM must not embed maintainer home paths.",
);
const wasmBuild = read("resources/wasm/BUILD.json");
assert.equal(
  createHash("sha256").update(wasm).digest("hex"),
  wasmBuild.artifactSha256,
);
const rustFiles = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? rustFiles(`${dir}/${e.name}`)
        : e.name.endsWith(".rs")
          ? [`${dir}/${e.name}`]
          : [],
    );
const sourceFiles = [
  "Cargo.toml",
  "Cargo.lock",
  "crates/core/Cargo.toml",
  "crates/wasm/Cargo.toml",
  ...rustFiles("crates/core/src"),
  ...rustFiles("crates/wasm/src"),
].sort();
const hash = createHash("sha256");
for (const file of sourceFiles)
  hash.update(file).update("\0").update(fs.readFileSync(file));
assert.equal(
  hash.digest("hex"),
  wasmBuild.sourceSha256,
  "Rust source changed: run npm run build:wasm.",
);

assert.doesNotMatch(
  fs.readFileSync("dist/main.js", "utf8"),
  /requestUrl|httpsRequired|\/v1\/search/,
  "No remote search adapter should ship in the local-only plugin.",
);
