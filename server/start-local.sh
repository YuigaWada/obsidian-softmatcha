#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SM_VAULT="${1:?Usage: start-local.sh /absolute/path/to/vault}"
: "${SOFTMATCHA_TOKEN:?Set SOFTMATCHA_TOKEN for the standalone reference service}"
exec ./run.sh --vault "$SM_VAULT" --state "$PWD/state" --exclude tools --exclude output --exclude 96config
