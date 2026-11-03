import { readFileSync, readdirSync } from "node:fs";
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
  banner: {
    js:
      "/*\n" +
      readFileSync("THIRD_PARTY_NOTICES.md", "utf8").replaceAll("*/", "* /") +
      "\n" +
      readdirSync("licenses")
        .filter((n) => !n.endsWith(".json"))
        .sort()
        .map(
          (n) =>
            "\n--- " +
            n +
            " ---\n" +
            readFileSync("licenses/" + n, "utf8").replaceAll("*/", "* /"),
        )
        .join("\n") +
      "\n*/",
  },
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
