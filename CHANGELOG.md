# Changelog

## 0.3.0 — 2026-11-04

Prepared for the first public release (not yet submitted or published).

- Support the community directory's three-file installation without models.
- Split models into manually importable, hash-checked, data-only language packs.
- Preserve exact matching when models are absent or disabled.
- Add English/Japanese semantic search and UI language controls.
- Omit blank excerpt lines while preserving match offsets and source positions.
- Add CI, release metadata validation, draft releases, documentation, and notices.
- Include source and generated WASM so a normal Node build needs no Rust setup.
- Remove the experimental remote-service adapter and URL/token/corpus settings.
- Remove default hotkeys; existing user-configured hotkeys remain applicable.

## Earlier development versions

0.1.x used a private native SoftMatcha 2 service. 0.2.x introduced the portable
Rust/WASM engine, cached local indices, DDD/Clean Architecture boundaries,
English/Japanese support, and excerpt display fixes. These were local
development versions rather than community-directory releases.
