# SoftMatcha-Search

A fast and powerful search plugin for Obsidian, powered by [SoftMatcha 2](https://github.com/softmatcha/softmatcha2).

SoftMatcha-Search combines exact matching with word-similarity search to help you find notes even when your queries don't use the exact words in your vault. It supports both English and Japanese, with no external API or server required.

## Installation

Install **SoftMatcha-Search** from the [official Obsidian Community Plugins directory](https://obsidian.md/plugins?search=SoftMatcha-Search).

Press `Cmd + Shift + O` to open the search panel.

## Features

- **Fast search:** Search filenames and note contents without installing a model.
- **Word-similarity search:** Find related words in English or Japanese using [SoftMatcha 2](https://github.com/softmatcha/softmatcha2).
- **Highlighted results:** Preview matching excerpts and jump directly to the relevant line.
- **Keyboard navigation:** Navigate results, open notes in a separate tab, or insert links to notes.
- **Multilingual interface:** Choose English or Japanese for the interface independently of the search models.
- **Flexible memory usage:** Enable or disable English and Japanese models independently. Exact matching remains available even when both models are disabled.

Missing models for enabled languages download automatically from GitHub Releases in the background. Disable automatic downloads in settings to opt out. Notes and search queries are never uploaded.

## License

The original plugin code and project documentation are licensed under the [MIT License](LICENSE).

Third-party components retain their respective licenses:

- **SoftMatcha 2 port:** Apache-2.0 with attributed MIT-licensed portions.
- **fastText models:** CC BY-SA 3.0.
- **Japanese dictionary:** Original upstream license terms.

See [Third-Party Notices](licenses/THIRD_PARTY_NOTICES.md) and [licenses](licenses/) for attribution and complete license texts.
