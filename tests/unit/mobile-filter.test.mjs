import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/infrastructure/worker/mobile/literal-filter.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2020",
});
const { literalFilter, mayContain } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
test("mobile negative filter preserves exact matches across Unicode, case and whitespace", () => {
  const texts = [
    "研究のテストと日本語。",
    "Gold\n\nMedalist",
    "Kevin and ſchool",
    "😀前文\n金メダル",
    "ΑΒΓ Ελληνικά",
    "Straße and İSTANBUL",
  ];
  const queries = [
    "研究",
    "テスト",
    "日本語",
    "gold medalist",
    "GOLD",
    "Kevin",
    "school",
    "金メダル",
    "😀",
    "Ελληνικά",
    "Straße",
    "İSTANBUL",
    "x",
  ];
  for (const text of texts) {
    const bits = literalFilter(text);
    assert.equal(bits.byteLength, 1024);
    for (const query of queries) {
      const pattern = new RegExp(
        query
          .trim()
          .split(/\s+/)
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("\\s+"),
        "iu",
      );
      if (pattern.test(text))
        assert.equal(mayContain(bits, query), true, query);
    }
  }
  assert.equal(mayContain(literalFilter("silver"), "gold medalist"), false);
  assert.equal(mayContain(undefined, "gold"), true);
});
