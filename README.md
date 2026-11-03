# SoftMatcha Search

Find English and Japanese passages in your Markdown notes. Search exact text
out of the box, or add optional local models to find semantically similar words
with the SoftMatcha 2 engine.

[日本語](docs/README.ja.md) · [Setup](#optional-semantic-search) · [Development](docs/DEVELOPMENT.md) · [Repository layout](docs/DIRECTORY_STRUCTURE.md) · [Privacy](docs/PRIVACY.md)

## Features

- Filename and case-insensitive body search without a model or account.
- Optional English and Japanese semantic search, using an embedded Rust/WASM
  port of [SoftMatcha 2](https://github.com/softmatcha/softmatcha2).
- Inline highlighting of the actual matched passage, including soft matches.
- Compact excerpts: blank lines are omitted without changing the source note.
- Open a result, open in a new tab, or insert a Markdown link.
- Background preparation and persistent local index checkpoints.
- Separate opt-outs for English and Japanese models. Disabled models are not
  loaded. Both may be disabled while exact text search remains available.
- English/Japanese UI, following Obsidian or an explicit language setting.

## Installation

**Community directory:** once the plugin has been approved and listed, search
for **SoftMatcha Search** in **Settings → Community plugins → Browse**. This
repository being available does not by itself mean the plugin has been approved.

**Manual installation:** download `main.js`, `manifest.json`, and `styles.css`
from a [GitHub release](https://github.com/YuigaWada/SoftMatcha-for-Obsidian/releases).
Place them in `<vault-config>/plugins/softmatcha-search/` and enable the plugin.
The default vault configuration directory is `.obsidian`; custom configuration
directories work too. Alternatively extract `softmatcha-for-obsidian.zip` into
that plugin directory.

No Python, Rust toolchain, search server, model download, or account is needed
for the installed plugin's exact search.

## Usage

Run **SoftMatcha Search: Search vault** from the command palette, or use the
search ribbon icon. Assign your preferred shortcut in **Settings → Hotkeys**;
`Cmd+Shift+O` on macOS or `Ctrl+Shift+O` elsewhere is a suggestion. No hotkey is
assigned automatically, so existing shortcuts are not overridden.

| Key | Action |
| --- | --- |
| Up / Down | Select a result |
| Enter | Open the note at the result's original line |
| Cmd/Ctrl+Enter | Open in a new tab |
| Alt+Enter | Insert a Markdown link into the active editor |

Search does not rewrite notes. Link insertion occurs only when you choose it.

## Optional semantic search

1. Download `models-en-<version>.zip` and/or `models-ja-<version>.zip` from the
   **same release** as the plugin.
2. Open **Settings → SoftMatcha Search → Import model pack** and select the ZIP.
3. Keep the desired **English semantic search** and **Japanese semantic search**
   switches enabled. Disable either to prevent its model being loaded.

Model packs contain data only. The plugin validates entry names, sizes, and
SHA-256 hashes against its bundled catalog before writing them inside its own
plugin directory. It never installs scripts or updates itself from a pack.
There are no automatic downloads. Import a pack on each device; do not assume
your sync provider transfers files inside plugin directories.

The packs use the first 50,000 vocabulary entries of the official fastText
English/Japanese models. Together their expanded data and Japanese dictionary
occupy about 135 MiB. Using a single language reduces memory needs. Initial
index construction can take a minute or longer for a larger vault; subsequent
starts restore cached indices. Model/dictionary expansion is still needed
on every application start. Cache removal by the OS causes a rebuild.

Queries containing Japanese script use the Japanese model; other queries use
the English model. Cross-language translation is not provided. Exact matches
remain available for unknown words, mixed-language queries, and missing models.
Semantic queries are limited to 12 tokens and have candidate/time limits.
PDF/OCR and full Omnisearch query-syntax compatibility are not provided.

## Platform support

The installed plugin uses Obsidian and Web APIs; it does not load Node.js,
Electron, Python, or OS-specific Rust libraries. Minimum Obsidian: **1.8.7**.

The implementation targets desktop and mobile. Search and setup UI have been
manually checked on **macOS / Obsidian 1.15.0**. iOS, Android, Windows, and Linux
Obsidian applications have **not** been manually verified. CI is configured to run the Node
build/tests on desktop OS runners; that is not a substitute for Obsidian or
mobile testing. Mobile memory limits may make exact-only or one-model search
preferable. Report issues with a synthetic reproduction.

## Network, storage, and privacy

- Local exact and model-based search make no network requests and upload no notes.
- No client telemetry, analytics, advertising, account, payment, or subscription.
- Models are downloaded manually by you from GitHub Releases. Release build
  scripts obtain public vectors from `dl.fbaipublicfiles.com`; they do not read
  your vault. Neither model download happens automatically inside the plugin.
- Local checkpoints include note text and token positions in the app's IndexedDB.
  Model files and settings live inside this plugin's vault configuration folder.
- Apart from the model ZIP you explicitly select through the file picker, the
  installed plugin does not read outside the vault or scan your filesystem.
  Search results never execute HTML from your notes.

Details: [privacy and data flow](docs/PRIVACY.md).

## Development and releases

```sh
npm ci
npm run check
npm run package
```

A normal build uses the included WASM artifact; no model or Rust download occurs.
The full Rust source is included, with regeneration and upstream attribution in
[development](docs/DEVELOPMENT.md). Actual-model tests run when local assets are
present; the ordinary tests use synthetic data and do not download anything.

[Release procedure](docs/RELEASING.md) · [Contributing](.github/CONTRIBUTING.md) ·
[Architecture](docs/ARCHITECTURE.md) · [Changelog](docs/CHANGELOG.md)

## License and acknowledgments

Original plugin/application code: [MIT](LICENSE). The included SoftMatcha 2 port
retains Apache-2.0 and attributed MIT portions. fastText vector subsets remain
CC BY-SA 3.0; the Japanese IPADIC dictionary retains its NAIST/ICOT notices.
See [third-party notices](licenses/THIRD_PARTY_NOTICES.md) and `licenses/` for the full
texts, upstream commit, authors, and changes. Model data is distributed
separately from the plugin code.

This is an independent community integration, not an official Obsidian or
SoftMatcha product. The repository name is **SoftMatcha-for-Obsidian**; the
community plugin display name is **SoftMatcha Search**.
