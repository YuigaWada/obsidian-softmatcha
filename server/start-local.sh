#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SM_VAULT="$(cd ../../.. && pwd)"
exec ./run.sh --vault "$SM_VAULT" --state "$PWD/state" --exclude tools --exclude output --exclude 96config --token-file "$SM_VAULT/.obsidian/plugins/softmatcha-search/data.json"
