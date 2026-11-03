# Repository layout

```text
SoftMatcha-for-Obsidian/
├── src/                     Obsidian plugin (domain/application/adapters/UI)
├── crates/
│   ├── core/                Portable Rust search engine
│   └── wasm/                wasm-bindgen entry point
├── resources/
│   ├── wasm/                Versioned runtime WASM/bindings and build provenance
│   └── model-catalog.json   Expected model-data names, sizes and hashes
├── dev/native-reference/    Standalone Python/native reference, not plugin runtime
├── scripts/
│   ├── build/               Plugin bundling and WASM regeneration
│   ├── models/              Public model preparation, export and catalog
│   ├── release/             Packaging, version updates and release validation
│   └── maintenance/         Third-party license collection
├── tests/
│   ├── unit/                Use cases, UI behavior, settings and pack validation
│   ├── integration/         Actual WASM Worker tests
│   └── native/              Optional Python/native reference tests
├── benchmarks/
│   ├── wasm.mjs             Explicit-vault local benchmark runner
│   └── results/             Recorded, anonymized measurements
├── docs/                    Architecture, privacy, development and release guides
├── licenses/                Third-party legal texts
├── .local/                  Ignored machine-local data (see below)
├── build/                   Ignored compiler output
└── dist/                    Ignored final plugin files, ZIPs and checksums
```

`Cargo.toml` and `Cargo.lock` define the Rust workspace at the root. Obsidian's
manifest, stylesheet and versions file stay at the root, along with package
metadata and public project documents. `npm run build` writes the installation
files into `dist/`, not alongside the source.

## Local and generated data

```text
.local/
├── models/          Downloaded public vectors/vocabularies
├── assets/          Exported model/dictionary data ready for packaging
├── venv/            Optional Python tooling environment
├── native/
│   ├── upstream/    Upstream checkout for native comparison
│   └── state/       Native indices and corpus-derived state
├── backups/         Private local Obsidian configuration backups
├── cache/           Python/linter caches
└── archive/         Preserved superseded local build output

build/
├── rust/            Cargo target directory
└── wasm/            Temporary wasm-pack output
```

These directories are excluded from Git. Private note-derived native state and
configuration backups must never be copied into `resources/` or a release.
`resources/` contains only the small reviewed runtime artifact and public model
metadata required by a normal plugin build. Large model data stays in `.local/`
and is distributed through the explicit model-pack release step.

The installed plugin's own `assets/` directory is a separate runtime location
inside the vault configuration directory. Its import format and note paths do
not change when the source repository is rearranged.
