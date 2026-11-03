#!/usr/bin/env bash
set -euo pipefail
SM_HERE="$(cd "$(dirname "$0")" && pwd)"
SM_ROOT="$(cd "$SM_HERE/../.." && pwd)"
SM_VAULT="${1:?Usage: start-local.sh /absolute/path/to/vault}"
: "${SOFTMATCHA_TOKEN:?Set SOFTMATCHA_TOKEN for the standalone reference service}"
exec "$SM_HERE/run.sh" --vault "$SM_VAULT" --state "$SM_ROOT/.local/native/state" --model "$SM_ROOT/.local/models/compact-ja"
