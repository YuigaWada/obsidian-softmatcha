# Contributing

Use Node.js 22 or newer and `npm ci`. Run `npm run check` before submitting a
change. The normal plugin build uses the included WASM artifact and requires no
Rust installation or model download. `npm run build:wasm` regenerates that
artifact from the complete Rust source in `src/rust/`.

Use synthetic notes in tests and screenshots. Never attach a real vault,
credentials, cached indices, or local machine paths. Report the plugin version,
Obsidian version, OS, enabled language models, and a small reproduction.

Keep the domain and application layers independent of Obsidian, HTTP, and
Worker APIs. Preserve the upstream
notices when changing the Rust port, and refresh model catalogs only from the
public preparation scripts. Contributions to original code are under MIT;
existing third-party files retain their documented licenses.
