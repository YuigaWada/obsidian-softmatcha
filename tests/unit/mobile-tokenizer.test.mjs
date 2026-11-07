import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/infrastructure/worker/tokenizer.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2020",
});
const { japaneseTokenizer } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
test("iOS surface-only dictionary preserves Japanese token boundaries and byte offsets", () => {
  const files = Object.fromEntries(
    fs
      .readdirSync("node_modules/kuromoji/dict")
      .filter((n) => n.endsWith(".gz"))
      .map((n) => {
        const b = fs.readFileSync("node_modules/kuromoji/dict/" + n);
        return [
          n.replace(".dat.gz", ""),
          b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        ];
      }),
  );
  const normal = japaneseTokenizer(files);
  const slim = japaneseTokenizer(
    Object.fromEntries(
      Object.entries(files).filter(
        ([n]) => !["tid_pos", "unk_pos"].includes(n),
      ),
    ),
    true,
  );
  const texts = [
    "😀日本語の先頭行\n金メダルを受賞した選手です。",
    "東京都に住んでいます。今日は晴れ、明日は雨。",
    "1,000円と3,000ドル、a,b, c。",
    "AIとLLMのテストです。123.45％",
    "全角ＡＢＣ、半角ABCとカタカナ。",
    "すもももももももものうち",
    "空白 と\tタブ\r\n改行\0区切り",
    "研究者が国際化を進める。".repeat(20),
    "𠮷野家と🍵、絵文字も。",
    "",
    "。、。",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(19),
    "ＡＢＣ１２３".repeat(80),
    "😀😀😀 abcABCabc!".repeat(20),
  ];
  let seed = 1729;
  const pieces = [
    "研究",
    "学習",
    "未知語",
    "カタカナ",
    "に",
    " ",
    "123",
    "abc",
    "😀",
    "𠮷",
    "。",
    "、",
  ];
  for (let i = 0; i < 60; i++) {
    let text = "";
    for (let j = 0; j < 30; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      text += pieces[seed % pieces.length];
    }
    texts.push(text);
  }
  for (const text of texts)
    assert.deepEqual(slim(text, {}, 0), normal(text, {}, 0), text.slice(0, 30));
});
