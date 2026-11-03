#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SM_RUST_SEPARATOR=$'\x1f'
SM_REMAP_FLAGS="--remap-path-prefix=$HOME=/user${SM_RUST_SEPARATOR}--remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo${SM_RUST_SEPARATOR}--remap-path-prefix=$PWD=/softmatcha"
export CARGO_ENCODED_RUSTFLAGS="${CARGO_ENCODED_RUSTFLAGS:+${CARGO_ENCODED_RUSTFLAGS}${SM_RUST_SEPARATOR}}${SM_REMAP_FLAGS}"
if command -v lld >/dev/null || command -v wasm-ld >/dev/null; then
  wasm-pack build rust/wasm --target web --out-dir ../pkg --release
elif command -v nix >/dev/null; then
  nix shell nixpkgs#lld --command wasm-pack build rust/wasm --target web --out-dir ../pkg --release
else
  wasm-pack build rust/wasm --target web --out-dir ../pkg --release
fi

mkdir -p vendor/softmatcha-wasm
cp rust/pkg/softmatcha_wasm.js rust/pkg/softmatcha_wasm.d.ts rust/pkg/softmatcha_wasm_bg.wasm vendor/softmatcha-wasm/
cp rust/LICENSE rust/NOTICE vendor/softmatcha-wasm/

python3 scripts/record-wasm.py
