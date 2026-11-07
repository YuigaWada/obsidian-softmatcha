# Privacy and data flow

## Local search

The plugin reads Markdown files through Obsidian's vault APIs, including text,
relative paths, modification times, and file sizes. A Worker performs local
matching/index construction. Vault-wide search requires enumerating Markdown
notes to build the index. Paths inside hidden directories are excluded. It makes no requests to an external AI provider
and contains no telemetry, analytics, advertising, or payment flow.

The index/checkpoints contain note text, token offsets, paths, and corpus-derived
statistics in IndexedDB. They are private vault-derived data, not anonymous
metrics. The OS/app can clear this cache, causing reconstruction. Model weights,
dictionary files, and settings are stored inside the plugin configuration
folder. On iOS, derived vector pages are also cached in IndexedDB, alongside
bounded index sections. No local search operation sends note contents over the network.

Enabled language models are downloaded automatically after startup if missing,
unless **Download models automatically** is disabled. A manual ZIP import is
also available. Only known data
entries with matching sizes and SHA-256 hashes are accepted. No script or
native library is loaded from the ZIP. Updates to plugin code use Obsidian's
normal update mechanism. The optional models can be disabled independently.

The installed plugin normally accesses only the active vault/configuration
directory. Importing models reads the ZIP file you explicitly select through
the system file picker, which may be outside the vault. It does not scan
external directories or read arbitrary filesystem paths.
It does not rewrite notes during search. Explicit Alt+Enter link insertion
edits the active editor at the user's request.

## Network use

- Automatic model setup makes HTTPS GET requests to language-pack URLs under
  `github.com/YuigaWada/obsidian-softmatcha/releases/download/models-<version>/`.
  GitHub may redirect downloads to its release-asset CDN. Only the plugin version
  and model language are part of the request; notes and queries are never sent.
  GitHub receives normal connection metadata such as the client's IP address.
- Automatic download is on by default and can be disabled in settings. Disabled
  languages are not downloaded. Only missing model data is fetched, with a
  five-minute retry delay after failure; plugin code is not downloaded or updated.
- Opening the releases link in settings uses the system/browser's GitHub connection.
- Development/release scripts fetch public model vectors from
  `dl.fbaipublicfiles.com` and packages from standard registries. Those scripts
  have no reason to receive or upload vault notes.

## Sync, sharing, and reports

Your sync/backup tools determine whether plugin settings and model
files are copied. IndexedDB is
app/device storage and is not managed as a note in the vault.

Do not upload real notes, access tokens, complete indices, or personal screenshots
to public issues. Use invented text and the smallest reproduction possible.
