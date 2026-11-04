# Repository layout

```text
SoftMatcha-for-Obsidian/
├── src/                     Production implementations
│   ├── domain/              Domain types and rules
│   ├── application/         Search use cases and ports
│   ├── infrastructure/      Obsidian/storage/Worker adapters
│   ├── presentation/        UI, translations and stylesheet
│   ├── composition/         Application wiring
│   ├── main.ts              Obsidian plugin entry point
│   └── rust/                Cargo workspace and lockfile
│       ├── core/            Portable Rust search engine
│       └── wasm/            wasm-bindgen entry point
├── config/                  ESLint, TypeScript and Python tool configuration
├── resources/
│   ├── wasm/                Versioned runtime WASM/bindings and build provenance
│   └── model-catalog.json   Expected model-data names, sizes and hashes
├── dev/native-reference/    Standalone Python/native reference, not plugin runtime
├── scripts/
│   ├── build/               Plugin bundling and WASM regeneration
│   ├── models/              Public model preparation, export and catalog
│   ├── release/             Packaging, version updates and release validation
│   ├── maintenance/         Third-party license collection
│   └── test/                Plugin and optional native test entry points
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

`src/rust/Cargo.toml` and `src/rust/Cargo.lock` define the Rust workspace. Obsidian's
manifest and versions file stay at the root, along with
npm metadata, README and LICENSE. Styles live in
`src/presentation/styles.css`; Python tooling configuration lives with the
other tool settings in `config/python/pyproject.toml`. Community
guides live in `.github/`, and the changelog lives in `docs/`. `npm run build` writes the installation
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

## Placement rules

- `src/` contains production implementations, including Rust in `src/rust/`; test fixtures and
  developer tools do not belong there.
- `resources/` contains checked-in inputs required by the plugin build.
  `build/` and `dist/` contain disposable outputs, never source files.
- `config/` holds development-tool configuration. Package scripts supply explicit
  paths so contributors use the same commands from the repository root.
- `scripts/` contains task entry points grouped by purpose; `dev/` contains the
  optional standalone reference implementation.
- `docs/` contains detailed project documentation. GitHub community documents
  belong in `.github/`; third-party legal material belongs in `licenses/`.
- Root files are limited to project entry points and metadata: npm manifest/lockfile, Obsidian manifest/version metadata, README, and LICENSE. Hidden root configuration remains only where tools discover it there.

Add files to the existing owner directory rather than creating another root
utility file. See `docs/DEVELOPMENT.md` for build and verification commands.

The six non-hidden root files are `README.md`, `LICENSE`, `manifest.json`,
`versions.json`, `package.json`, and `package-lock.json`. Obsidian requires the
root manifest for submission and reads root version metadata for compatibility;
keeping npm metadata here preserves the ordinary build/review entry point.
Japanese documentation lives in `docs/README.ja.md`; third-party notices live
in `licenses/THIRD_PARTY_NOTICES.md`.

`.cargo/` is optional machine-local configuration and is ignored by Git.
`npm run build:wasm` and `npm run test:rust` select `build/rust/` explicitly,
so a checkout does not require a local Cargo configuration file.
