# SoftMatcha Search

Search English and Japanese Markdown notes inside Obsidian. Start with filename
and text matching, then optionally install language models to find passages
whose words are similar in meaning to your query.

[日本語](docs/README.ja.md) · [User guide](docs/USAGE.md) · [Changes](docs/CHANGELOG.md)

## What you can do

- Search filenames and note contents without installing a model.
- Add English or Japanese word-similarity search powered by
  [SoftMatcha 2](https://github.com/softmatcha/softmatcha2).
- Read highlighted excerpts and jump directly to a matching line.
- Navigate results with the keyboard, open a separate tab, or insert a note link.
- Choose English or Japanese for the interface independently of search models.
- Disable either language model to reduce memory use; exact matching remains
  available when both are disabled.

The search engine runs in a local Worker using Rust and WebAssembly. With
models installed, preparation starts in the background when Obsidian opens.
Saved index checkpoints are reused between sessions.

## Set up the plugin

The plugin is not yet listed in the Obsidian Community directory. You can build
it with the [development instructions](docs/DEVELOPMENT.md). Copy the resulting
`dist/main.js`, `dist/manifest.json`, and `dist/styles.css` into
`<vault-config>/plugins/softmatcha-search/`, then enable **SoftMatcha Search**.
For most vaults, `<vault-config>` is `.obsidian`.

When published, installation files will also be available on the
[releases page](https://github.com/YuigaWada/obsidian-softmatcha/releases).
Model packs are separate downloads: choose an English or Japanese pack from
that same plugin release and import its ZIP through the plugin settings.
Models are not downloaded automatically, and should be imported on each device.

## Run your first search

Select **SoftMatcha Search: Search vault** in the command palette or click the
search icon in the ribbon. To open it from the keyboard, assign a hotkey in
Obsidian settings; Cmd+Shift+O on macOS or Ctrl+Shift+O elsewhere is suggested
if that combination is available.

| Key | Result |
| --- | --- |
| ↑ / ↓ | Move through the results |
| Enter | Open the selected note at its matching line |
| Cmd/Ctrl+Enter | Open the selection in a new tab |
| Alt+Enter | Add a Markdown link to the active editor |

Searching does not edit note contents. Choosing link insertion writes the link
to your editor.

## Models and device requirements

Obsidian **1.8.7 or newer** is required. Search and settings have been checked
manually on macOS with Obsidian 1.15.0. Testing inside Obsidian on iOS, Android,
Windows, and Linux is pending.

Installing both languages and the Japanese dictionary takes approximately
**135 MiB** of disk space, plus memory during use. A large vault may need more
than a minute for its initial index. Restoring a saved index reduces preparation
work, but models and dictionaries must still be loaded into memory each session.

Semantic matching works within each language and accepts up to 12 tokens per
query. It does not translate between languages or generate answers. The plugin
currently searches Markdown rather than extracting text from PDFs or images.
See the [user guide](docs/USAGE.md) for language routing, settings, and limits.

## Data stays on your device

Search does not upload notes or send telemetry. There is no required account,
API key, or search service URL. Imported models are stored in the plugin's
configuration directory; index checkpoints containing note text and positions
are stored in the app's IndexedDB. Storage details are documented in the
[privacy guide](docs/PRIVACY.md).

## Contributing and licensing

The [development guide](docs/DEVELOPMENT.md) covers builds and checks, and the
[contribution guide](.github/CONTRIBUTING.md) explains how to submit changes.
The implementation and directory layout are described in the
[architecture notes](docs/ARCHITECTURE.md).

Our original plugin code and project documentation, including this README,
are available under the [MIT license](LICENSE). Third-party components retain
their respective licenses: the SoftMatcha 2 port uses Apache-2.0 and attributed
MIT portions, fastText models use CC BY-SA 3.0, and the Japanese dictionary
retains its upstream terms. Attribution and complete license texts are in
[third-party notices](licenses/THIRD_PARTY_NOTICES.md) and [licenses](licenses/).

The search implementation builds on [SoftMatcha 2](https://github.com/softmatcha/softmatcha2),
[fastText](https://fasttext.cc/), and [kuromoji.js](https://github.com/takuyaa/kuromoji.js).
