#!/usr/bin/env bash
set -euo pipefail
SM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$SM_ROOT/.local/venv/bin/python" - <<'PY'
from huggingface_hub import hf_hub_download
path=hf_hub_download('facebook/fasttext-ja-vectors', filename='model.bin')
print('DOWNLOAD_COMPLETE',path,flush=True)
PY
