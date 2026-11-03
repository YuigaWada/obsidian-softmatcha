# Native reference service (development only)

The published plugin has no remote-service adapter or server settings. This
directory is retained only as a standalone reference for engine comparisons
and development. It is not part of plugin installation or runtime.

## Setup

The upstream dependency uses Python/Rust and native tooling. See
`server/setup.sh`; it checks out the pinned SoftMatcha 2 source and applies the
included compatibility patch. A Python 3.12 environment, Rust, C/C++ tooling,
ICU/pkg-config, and `uv` are needed. Dependency support varies by OS/architecture.
A Dockerfile is also provided with the server directory as the build context.

```sh
bash server/setup.sh
# Generate your own random token with at least 24 characters.
export SOFTMATCHA_TOKEN='replace-with-your-random-token'
bash server/run.sh --vault /absolute/path/to/vault --state /absolute/path/to/state --exclude tools
```

The default backend uses the compact Japanese model. A full model and other
upstream backends can be configured with server flags. Do not assume that the
local plugin's English/Japanese model setup changes this server configuration.
It scans every 60 seconds, partitions notes into immutable content-addressed
shards, and warms models/indices after startup or generation changes. Failed
index construction preserves the previous generation. The native cache,
execution limits, and stale on-disk generations still need capacity planning.

## Standalone API

This reference exposes authenticated status, warmup, and search endpoints. Use
an API client with the token you configured through the environment; the public
plugin does not connect to it. The service reads the operator-specified vault
and writes indices/model data under the specified state directory. It does not
update original notes. Never include credentials or real vault excerpts in
public reports.
