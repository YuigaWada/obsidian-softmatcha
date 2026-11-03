import { existsSync, statSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function newest(dir) {
  return Math.max(
    ...readdirSync(dir, { withFileTypes: true }).map((e) =>
      e.isDirectory()
        ? newest(`${dir}/${e.name}`)
        : statSync(`${dir}/${e.name}`).mtimeMs,
    ),
  );
}
const artifact = "rust/pkg/softmatcha_wasm_bg.wasm";
if (
  !existsSync(artifact) ||
  newest("rust/core/src") > statSync(artifact).mtimeMs ||
  newest("rust/wasm/src") > statSync(artifact).mtimeMs
) {
  const r = spawnSync("bash", ["scripts/build-wasm.sh"], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
import { build } from "esbuild";
const worker = await build({
  entryPoints: ["src/infrastructure/worker/search-worker.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  loader: { ".wasm": "binary" },
  define: { "import.meta.url": '""' },
});
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  platform: "browser",
  target: "es2020",
  outfile: "main.js",
  plugins: [
    {
      name: "worker-source",
      setup(b) {
        b.onResolve({ filter: /^softmatcha-worker-source$/ }, () => ({
          path: "worker-source",
          namespace: "inline",
        }));
        b.onLoad({ filter: /.*/, namespace: "inline" }, () => ({
          contents: `export default ${JSON.stringify(worker.outputFiles[0].text)}`,
          loader: "js",
        }));
      },
    },
  ],
});
