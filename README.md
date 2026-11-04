# SoftMatcha for Obsidian

Find the passage you remember—even when you remember different words.

**SoftMatcha Search** brings local English and Japanese search to Obsidian.
Search filenames and note text immediately, or add language models to find
passages containing semantically similar words with
[SoftMatcha 2](https://github.com/softmatcha/softmatcha2).

[日本語](docs/README.ja.md) · [Documentation](docs/USAGE.md) · [Changelog](docs/CHANGELOG.md)

## Documentation

- [Search, settings, and model setup](docs/USAGE.md)
- [Privacy and local storage](docs/PRIVACY.md)
- [Development](docs/DEVELOPMENT.md) · [Architecture](docs/ARCHITECTURE.md)

## Installation

The plugin has not yet been listed in the Obsidian Community directory.

For a manual installation, download `main.js`, `manifest.json`, and `styles.css`
from a [release](https://github.com/YuigaWada/SoftMatcha-for-Obsidian/releases),
when one is available. Put all three files in
`<vault-config>/plugins/softmatcha-search/`, then enable **SoftMatcha Search** in
Obsidian. The default vault configuration directory is `.obsidian`.
The release ZIP, `softmatcha-for-obsidian.zip`, can also be extracted there.

To build from source, see the [development guide](docs/DEVELOPMENT.md).
Filename and exact text search work without downloading a model.

### Enable semantic search

1. Download `models-en-<version>.zip` and/or `models-ja-<version>.zip` from the
   same release as your plugin.
2. Open **Settings → SoftMatcha Search → Import model pack** and choose the ZIP.
3. Enable the languages you want to search with in the same settings page.

Models are optional, imported manually, and stored on your device. Search needs
no account, subscription, API key, or service URL. Import packs on each device;
additional plugin files may not be transferred by your sync service.

## Features

- **Search your Markdown notes** by filename, exact text, or similar words.
- **English and Japanese support**, with a separate semantic-search switch for
  each language. Disabled models are not loaded.
- **Highlighted passages** showing the actual matching text, with compact
  previews that omit empty lines.
- **Keyboard navigation** to select results, open notes at the matching line,
  open another tab, or insert a Markdown link.
- **Background preparation** when Obsidian starts, with persistent local index
  checkpoints for subsequent sessions.
- **On-device search** through a Rust/WebAssembly engine running in a Worker.
- **English and Japanese interface**, following Obsidian or your chosen setting.

## Usage

Open **SoftMatcha Search: Search vault** from the command palette, or select the
search ribbon icon. In **Settings → Hotkeys**, assign **Cmd+Shift+O** on macOS or
**Ctrl+Shift+O** elsewhere if available. The plugin does not assign a default.

| Shortcut | Action |
| --- | --- |
| ↑ / ↓ | Select a result |
| Enter | Open the note at the matching line |
| Cmd/Ctrl+Enter | Open in a new tab |
| Alt+Enter | Insert a Markdown link into the active editor |

Search leaves your notes unchanged. Link insertion writes only when you choose
that action.

## Compatibility and limits

Requires **Obsidian 1.8.7 or newer**. Search and settings have been manually
tested on macOS with Obsidian 1.15.0. iOS, Android, Windows, and Linux app testing
is still pending; CI tests do not establish device compatibility.

Both models and the Japanese dictionary use about **135 MiB of disk space**
when unpacked and require additional RAM. First-time indexing of a large vault
can take over a minute. Later sessions restore checkpoints, but still load the
models into memory. You can enable one language or use exact search alone.

Semantic search uses word similarity within each language, rather than
translation or document-level question answering. Queries are limited to 12
semantic tokens. PDF/image OCR and Omnisearch's query syntax are not supported.
See the [usage guide](docs/USAGE.md) for routing and fallback behavior.

## Privacy

Search runs locally without uploading notes or sending telemetry. Imported
models live in the plugin configuration folder. Index checkpoints include note
text and positions and are stored in the app's IndexedDB. Read the
[privacy guide](docs/PRIVACY.md) for storage and data flow details.

## License

Original code is licensed under [MIT](LICENSE). The SoftMatcha 2 port retains
Apache-2.0 and attributed MIT portions. fastText models use CC BY-SA 3.0;
Japanese dictionary data retains its upstream terms. Full texts and attribution
are in [third-party notices](licenses/THIRD_PARTY_NOTICES.md) and [licenses](licenses/).

## Acknowledgments

Built on [SoftMatcha 2](https://github.com/softmatcha/softmatcha2),
[fastText](https://fasttext.cc/), and [kuromoji.js](https://github.com/takuyaa/kuromoji.js).
The README's organization takes inspiration from
[Omnisearch](https://github.com/scambier/obsidian-omnisearch).
This is an independent community integration.
