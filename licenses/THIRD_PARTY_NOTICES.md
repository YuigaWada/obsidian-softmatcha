# Third-party notices

The plugin's original TypeScript and Python code is under the root MIT license.
The components below retain their own licenses. License texts are included in
`licenses/` and in the release JavaScript banner so the standard three-file
installation preserves attribution.

## SoftMatcha search engine

The portable search code in `src/rust/core/src/upstream/` and `helper.rs` derives from
[SoftMatcha 2](https://github.com/softmatcha/softmatcha2), by Masataka Yoneda,
commit `b37e104741465a31425db5f07202d8065af7d571`, under Apache-2.0, with earlier
MIT-licensed portions attributed in `licenses/SoftMatcha1-MIT.txt`.

Changes remove Python/NumPy and Unix file I/O, use ndarray and immutable byte
buffers, replace Rayon with sequential execution, adapt clocks and integer
widths for WebAssembly, and add small-vocabulary bounds checks. Portable index
construction and the application adapters are implemented in `src/rust/core/src/`.
See `src/rust/core/NOTICE`, `licenses/SoftMatcha2-Apache-2.0.txt`, and the upstream source.
This is an independent Obsidian integration, not an official SoftMatcha product.

## JavaScript and WebAssembly dependencies

- [kuromoji.js](https://github.com/takuyaa/kuromoji.js), Takuya Asano and Atilika
  contributors: Apache-2.0. The iOS surface lattice builder is adapted from
  kuromoji.js: it reuses Unicode positions and unknown-word grouping boundaries
  instead of rebuilding suffix position tables. Its source retains the original
  copyright and Apache-2.0 notice.
- [doublearray](https://github.com/takuyaa/doublearray), Takuya Asano: MIT.
- [fflate](https://github.com/101arrowz/fflate), Arjun Barrett: MIT.
- kuromoji's package dependencies async, lodash, and zlibjs retain their
  respective MIT licenses; their texts are also supplied. The browser build
  only includes modules reachable from the tokenizer and dictionary adapters.
- Rust dependency versions and license identifiers are recorded in
  `licenses/rust-dependencies.json`; their license texts are supplied alongside
  it. `resources/wasm/` contains generated bindings and WASM built from
  the included `src/rust/` source, not code downloaded or evaluated at runtime.

## Optional model packs (data, distributed separately)

The Japanese and English word vectors derive from the official fastText Common
Crawl/Wikipedia models by Edouard Grave, Piotr Bojanowski, Prakhar Gupta,
Armand Joulin, and Tomas Mikolov, described in *Learning Word Vectors for
157 Languages* (LREC 2018).

Source and attribution: https://fasttext.cc/docs/en/crawl-vectors.html

Sources: `cc.ja.300.vec.gz` and `cc.en.300.vec.gz` from
`https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/`.
The model data and our redistributed subsets remain **CC BY-SA 3.0**.
Changes: retain the first 50,000 distinct finite vectors; append an all-zero
unknown-word row; convert to little-endian float32; export a JSON vocabulary.
No translation alignment is added. The vectors are not embedded in the plugin.
The model packs include the source URLs, change description, and the full
CC BY-SA 3.0 text from `licenses/fastText-CC-BY-SA-3.0.txt`.

The Japanese pack also includes the kuromoji IPADIC dictionary derived from
mecab-ipadic-2.7.0-20070801. The NAIST/ICOT notices and conditions are preserved
in `licenses/kuromoji-NOTICE.md` and in each pack. See that file for the original
copyright holders and complete terms. These data licenses do not replace the
licenses of the separately distributed plugin code.
