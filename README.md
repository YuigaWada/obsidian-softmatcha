# SoftMatcha-Search

A fast and powerful search plugin for Obsidian, powered by [SoftMatcha 2](https://github.com/softmatcha/softmatcha2).

SoftMatcha-Search combines exact matching with word-similarity search to help you find notes even when your queries don't use the exact words in your vault. It supports both English and Japanese, with no external API or server required.

## Installation

Download `main.js`, `manifest.json`, and `styles.css` from [GitHub Releases](https://github.com/YuigaWada/obsidian-softmatcha/releases). Place them in `<vault-config>/plugins/softmatcha-search/` (normally `.obsidian/plugins/softmatcha-search/`) and enable **SoftMatcha Search** in Obsidian.

Community directory submission is pending. Once approved, the plugin will be available as **SoftMatcha Search** through Obsidian’s Community plugins settings.

Open **SoftMatcha Search: Search vault** from the command palette. Assign `Cmd + Shift + O` on macOS or `Ctrl + Shift + O` elsewhere in **Settings → Hotkeys** if available.

For semantic search, download `models-en-<version>.zip` and/or `models-ja-<version>.zip` from the same release and select **Import model pack** in the plugin settings on each device. Both models and the Japanese dictionary occupy about 135 MiB unpacked, plus RAM during use. First-time indexing can take over a minute. See the [usage guide](docs/USAGE.md) and [privacy details](docs/PRIVACY.md).

## Features

- **Fast search:** Search filenames and note contents without installing a model.
- **Word-similarity search:** Find related words in English or Japanese using [SoftMatcha 2](https://github.com/softmatcha/softmatcha2).
- **Highlighted results:** Preview matching excerpts and jump directly to the relevant line.
- **Keyboard navigation:** Navigate results, open notes in a separate tab, or insert links to notes.
- **Multilingual interface:** Choose English or Japanese for the interface independently of the search models.
- **Flexible memory usage:** Enable or disable English and Japanese models independently. Exact matching remains available even when both models are disabled.

## License

The original plugin code and project documentation are licensed under the [MIT License](LICENSE).

Third-party components retain their respective licenses:

- **SoftMatcha 2 port:** Apache-2.0 with attributed MIT-licensed portions.
- **fastText models:** CC BY-SA 3.0.
- **Japanese dictionary:** Original upstream license terms.

See [Third-Party Notices](licenses/THIRD_PARTY_NOTICES.md) and [licenses](licenses/) for attribution and complete license texts.
