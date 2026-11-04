# SoftMatcha Search for Obsidian

![GitHub release (latest by date and asset)](https://img.shields.io/github/downloads/YuigaWada/obsidian-softmatcha/latest/main.js)
![GitHub release (latest by date including pre-releases)](https://img.shields.io/github/v/release/YuigaWada/obsidian-softmatcha)

---

**SoftMatcha Search** is a search engine that "_just works_".
It shows matching passages with highlighted text, with optional semantic matching for English and Japanese.

Under the hood, it uses the excellent [SoftMatcha 2](https://github.com/softmatcha/softmatcha2) engine, ported to Rust/WebAssembly. Search runs on your device.

## Documentation

[Usage and settings](docs/USAGE.md) · [日本語](docs/README.ja.md) · [Privacy](docs/PRIVACY.md)

## Installation

- SoftMatcha Search can be built from source using the [development guide](docs/DEVELOPMENT.md). Copy `main.js`, `manifest.json`, and `styles.css` from `dist/` into `<vault-config>/plugins/softmatcha-search/`, then enable the plugin. The default vault configuration directory is `.obsidian`.
- Release builds, when available, can be installed from [GitHub Releases](https://github.com/YuigaWada/obsidian-softmatcha/releases). The plugin is not yet listed in the official Community directory.
- Optional English and Japanese model packs can be imported through the plugin settings. Use packs from the same plugin release. Nothing is downloaded automatically.

You can check the [CHANGELOG](docs/CHANGELOG.md) for more information on the different versions.

## Features

> SoftMatcha Search's first goal is to _locate_ notes and matching passages. You can see it as a _Quick Switcher_ on steroids.

- Find your **📝Markdown notes** by filename, exact text, or semantically similar words
- Semantic passage matching using the [SoftMatcha 2 algorithm](https://github.com/softmatcha/softmatcha2)
  - English and Japanese models are optional and can be disabled independently; exact text search works without them
- Keyboard first: you never have to use your mouse
- Workflow similar to the "Quick Switcher" core plugin
- Local Rust/WebAssembly search, without a service URL or API key
- Highlighted matches and compact previews without blank lines
- Background index preparation when Obsidian starts and persistent local checkpoints
- Directly insert a Markdown link from the search results
- English and Japanese interface, following Obsidian or an explicit setting

**Note:** assign your shortcut in Obsidian's Hotkeys settings (suggested: Cmd/Ctrl+Shift+O). The two language models and Japanese dictionary occupy about 135 MiB unpacked, with additional RAM required. Initial indexing can take over a minute. Requires Obsidian 1.8.7+; macOS has been manually tested, while other app platforms remain unverified. PDF/image OCR, query operators, and cross-language translation search are not supported. See the [documentation](docs/USAGE.md) for details.

## Projects that use SoftMatcha Search

_Submit a PR to add your own project!_

## LICENSE

SoftMatcha Search's original code is licensed under [MIT](LICENSE). The SoftMatcha 2 port, dependencies, and model data retain their own licenses; see the [third-party notices](licenses/THIRD_PARTY_NOTICES.md).

This README is adapted from [Omnisearch's README](https://github.com/scambier/obsidian-omnisearch/blob/e4a51ab52a2cd3924367ea9cf0bb439f83e62318/README.md) by Simon Cambier and contributors, and is licensed under [GPL-3.0](docs/OMNISEARCH-LICENSE.txt). Modified by Yuiga Wada on 2026-11-04 to describe SoftMatcha Search's installation, features, and licensing. The README license does not replace the licenses of the separately licensed plugin code or models.

## Thanks

To the authors and contributors of [SoftMatcha 2](https://github.com/softmatcha/softmatcha2), [fastText](https://fasttext.cc/), [kuromoji.js](https://github.com/takuyaa/kuromoji.js), and [Omnisearch](https://github.com/scambier/obsidian-omnisearch) ❤
