#!/usr/bin/env bash
set -euo pipefail
SM_HERE="$(cd "$(dirname "$0")" && pwd)"
SM_ROOT="$(cd "$SM_HERE/../.." && pwd)"
SM_UPSTREAM="$SM_ROOT/.local/native/upstream/softmatcha2"
SM_VENV="$SM_ROOT/.local/venv"
SM_REV=b37e104741465a31425db5f07202d8065af7d571
mkdir -p "$(dirname "$SM_UPSTREAM")"
if [ ! -d "$SM_UPSTREAM/.git" ]; then git clone https://github.com/softmatcha/softmatcha2.git "$SM_UPSTREAM"; fi
git -C "$SM_UPSTREAM" checkout "$SM_REV"
if git -C "$SM_UPSTREAM" apply --check "$SM_HERE/compat.patch" 2>/dev/null; then git -C "$SM_UPSTREAM" apply "$SM_HERE/compat.patch"; else git -C "$SM_UPSTREAM" apply --reverse --check "$SM_HERE/compat.patch"; fi
SM_PYTHON="${SOFTMATCHA_PYTHON:-3.12}"
if [ "$(uname -m)" = arm64 ] && [ -x /opt/homebrew/bin/python3.12 ]; then SM_PYTHON=/opt/homebrew/bin/python3.12; fi
if [ -d /opt/homebrew/opt/icu4c@77/lib/pkgconfig ]; then export PKG_CONFIG_PATH="/opt/homebrew/opt/icu4c@77/lib/pkgconfig:${PKG_CONFIG_PATH:-}"; fi
if [ ! -x "$SM_VENV/bin/python" ]; then uv venv --python "$SM_PYTHON" "$SM_VENV"; fi
uv pip install --python "$SM_VENV/bin/python" "$SM_UPSTREAM" maturin -r "$SM_HERE/requirements.txt"
VIRTUAL_ENV="$SM_VENV" "$SM_VENV/bin/python" -m maturin develop --release --manifest-path "$SM_UPSTREAM/rust/Cargo.toml"
