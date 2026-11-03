#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Hugging Face keeps resumable downloads in its model cache.
exec .venv/bin/python - <<'PY'
from huggingface_hub import hf_hub_download
path=hf_hub_download('facebook/fasttext-ja-vectors', filename='model.bin')
print('DOWNLOAD_COMPLETE',path,flush=True)
PY
