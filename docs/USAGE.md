# Search and settings

[Overview](../README.md) · [日本語](README.ja.md) · [Privacy](PRIVACY.md)

## Start a search

Run **SoftMatcha Search: Search vault** from the command palette or select the
ribbon's search icon. Configure your own shortcut in **Settings → Hotkeys**.
Type a query, select a result with the arrow keys, and press Enter to open it
at the original matching line. Cmd/Ctrl+Enter opens a new tab; Alt+Enter inserts
a Markdown link into the active editor.

Results highlight matched text and omit blank or whitespace-only lines in the
preview. This display formatting preserves the original note and line numbers.

## Exact and semantic matches

Filename and case-insensitive body matches work without model data. Semantic
search additionally finds passages containing similar words in the installed
language model's vocabulary. It uses word vectors and SoftMatcha 2 matching,
rather than translating a query or generating an answer.

Queries containing Japanese characters use the Japanese model; other queries
use the English model. The models do not share a cross-language vector space.
Mixed-language and out-of-vocabulary queries can still produce exact matches.
Use at most 12 semantic tokens per query; the engine also bounds candidate
counts and search time. PDF/image extraction, an in-file search mode, and
Omnisearch's filters/operators are not implemented.

## Settings

| Setting | Purpose |
| --- | --- |
| UI language | Follow Obsidian automatically, or choose English or Japanese. |
| Import model pack | Select a data-only ZIP for the installed plugin version. |
| Japanese semantic search | Load and use the Japanese model and tokenizer. |
| English semantic search | Load and use the English model. |
| Minimum similarity | Raise to require closer word matches; lower to allow broader matches. |

Disable either language to prevent its model from loading. With both disabled,
exact matches remain available. UI language and search language are independent.
Search is local; there is no service URL, API token, or external search setup.

## Model packs and preparation

Download language packs from the plugin's matching GitHub release and import
them through settings. The plugin validates entry names, sizes, and SHA-256
hashes before saving files; imported packs contain data, not executable code.
Import packs on each device. Sync products may not transfer additional files
inside plugin folders.

The supplied subsets contain 50,000 fastText words per language. Together with
the Japanese dictionary, the unpacked data occupies about 135 MiB; RAM use is
additional. Models are not downloaded automatically.

When semantic search is enabled and model data is present, the plugin prepares
models and index shards in the background after Obsidian starts. A large vault's
first preparation may take over a minute. Later sessions reuse local index
checkpoints, while loading models and dictionaries into memory again. Clearing
or losing the app's IndexedDB requires rebuilding those checkpoints.

On a device with limited memory, use one language or exact search alone.
If a model cannot be used, check the search status and try a model pack made
for your installed plugin version. See [privacy](PRIVACY.md) for storage details.
