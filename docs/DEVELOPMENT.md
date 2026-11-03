# Development

## Plugin build (no Rust or model download)

Use Node.js 22+ and a standard npm installation:

```sh
npm ci
npm run check
npm run package
```

`npm run check` runs the official Obsidian ESLint rules, TypeScript/browser
build, synthetic Worker tests, and release metadata validation. Real-model
tests run only if `assets/manifest.json` exists. No test downloads a model.
`main.js` is generated and excluded from source control; release attachments
are the distribution mechanism.

The ordinary build consumes the included `vendor/softmatcha-wasm/` artifact.
Its complete source and locked Rust dependency graph are under `rust/`.
Generated bindings and WASM are included so Obsidian's Node build verifier
and contributors do not need to install another toolchain to build the plugin.
The artifact contains no model data, corpus, credentials, or native OS library.

## Rebuild WASM

Install Rust with the `wasm32-unknown-unknown` target, a WASM linker, and
wasm-pack 0.15.0:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
cargo test --locked --manifest-path rust/Cargo.toml -p softmatcha-core
npm run build:wasm
npm run check
```

The wrapper script uses the available linker; on the maintainer's Nix setup
it can use `nix shell nixpkgs#lld`. `npm run build:wasm` updates the generated
files in `vendor/softmatcha-wasm/`. Commit regenerated artifacts with changes
to the Rust port and preserve the upstream Apache/MIT notices. The Rust CI job
rebuilds from source and runs the Worker integration tests on that build.

## Prepare model data (maintainers only)

This operation downloads public fastText text-vector streams and stops after
50,000 entries per language. It does not read a vault. Python and NumPy are
needed; the native search service is not:

```sh
python3 -m venv .release-venv
.release-venv/bin/pip install numpy==2.2.6
.release-venv/bin/python scripts/prepare-models.py
.release-venv/bin/python scripts/export-assets.py
```

The source models are saved under ignored `server/state/models/`. The generated
raw float32 vectors and dictionaries are under ignored `assets/`.
The model catalog in `src/infrastructure/model-catalog.json` pins names, sizes,
and SHA-256 hashes. To intentionally change model data or model notices:

```sh
npm run assets:catalog
npm run check
npm run package:models
```

Review the catalog diff: no absolute paths or note content should appear.
`package:models` fails if regenerated assets don't match that catalog. Packs
are named by plugin version and contain only data and notices. Never add model
binaries, indices, or a personal vault to Git.

## Tests and performance

`npm test` includes controlled soft-substitution vectors, actual WASM in a
Node Worker, optional IndexedDB caching, Japanese/English routing, exact-only
setup, model opt-out, model ZIP validation, and excerpt range mapping. CI's
Node Worker tests are not Obsidian or mobile-device tests.

For the optional Python service, see [SERVER.md](SERVER.md). With its venv
installed, `server/.venv/bin/python -m pytest tests -q` tests that path.

`node scripts/benchmark-wasm.mjs /absolute/path/to/test-vault` prints only counts
and timings. It reads the specified vault locally. Its fake IndexedDB is
process-local and is not representative of all browser storage costs. Prefer
a synthetic test vault when sharing results. Existing `tests/performance-*.json`
records are anonymized local samples, not guarantees for other hardware.

## Local plugin refresh

Copy the three plugin files into the test vault's plugin folder. Keep its
`data.json` private. Reload only this plugin after changes. Imported model data
can be preserved because it is separate from the three code/update files.
