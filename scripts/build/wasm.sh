#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export CARGO_TARGET_DIR="$PWD/build/rust"
SM_RUST_SEPARATOR=$'\x1f'
SM_REMAP_FLAGS="--remap-path-prefix=$HOME=/user${SM_RUST_SEPARATOR}--remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo${SM_RUST_SEPARATOR}--remap-path-prefix=$PWD=/softmatcha"
export CARGO_ENCODED_RUSTFLAGS="${CARGO_ENCODED_RUSTFLAGS:+${CARGO_ENCODED_RUSTFLAGS}${SM_RUST_SEPARATOR}}${SM_REMAP_FLAGS}"
if command -v lld >/dev/null || command -v wasm-ld >/dev/null; then
  wasm-pack build src/rust/wasm --target web --out-dir ../../../build/wasm --release
elif command -v nix >/dev/null; then
  nix shell nixpkgs#lld --command wasm-pack build src/rust/wasm --target web --out-dir ../../../build/wasm --release
else
  wasm-pack build src/rust/wasm --target web --out-dir ../../../build/wasm --release
fi

mkdir -p resources/wasm
cp build/wasm/softmatcha_wasm.js build/wasm/softmatcha_wasm.d.ts build/wasm/softmatcha_wasm_bg.wasm resources/wasm/
cp src/rust/core/LICENSE src/rust/core/NOTICE resources/wasm/

python3 scripts/build/record-wasm.py
