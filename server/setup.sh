#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SM_REV=b37e104741465a31425db5f07202d8065af7d571
mkdir -p vendor
if [ ! -d vendor/softmatcha2/.git ]; then git clone https://github.com/softmatcha/softmatcha2.git vendor/softmatcha2; fi
git -C vendor/softmatcha2 checkout "$SM_REV"
if git -C vendor/softmatcha2 apply --check ../../compat.patch 2>/dev/null; then git -C vendor/softmatcha2 apply ../../compat.patch; else git -C vendor/softmatcha2 apply --reverse --check ../../compat.patch; fi
SM_PYTHON="${SOFTMATCHA_PYTHON:-3.12}"
if [ "$(uname -m)" = arm64 ] && [ -x /opt/homebrew/bin/python3.12 ]; then SM_PYTHON=/opt/homebrew/bin/python3.12; fi
if [ -d /opt/homebrew/opt/icu4c@77/lib/pkgconfig ]; then export PKG_CONFIG_PATH="/opt/homebrew/opt/icu4c@77/lib/pkgconfig:${PKG_CONFIG_PATH:-}"; fi
if [ ! -x .venv/bin/python ]; then uv venv --python "$SM_PYTHON" .venv; fi
uv pip install --python .venv/bin/python ./vendor/softmatcha2 maturin -r requirements.txt
VIRTUAL_ENV="$PWD/.venv" .venv/bin/python -m maturin develop --release --manifest-path vendor/softmatcha2/rust/Cargo.toml
