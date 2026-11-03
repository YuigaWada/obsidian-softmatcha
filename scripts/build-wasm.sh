#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v lld >/dev/null || command -v wasm-ld >/dev/null; then
  exec wasm-pack build rust/wasm --target web --out-dir ../pkg --release
elif command -v nix >/dev/null; then
  exec nix shell nixpkgs#lld --command wasm-pack build rust/wasm --target web --out-dir ../pkg --release
else
  exec wasm-pack build rust/wasm --target web --out-dir ../pkg --release
fi
