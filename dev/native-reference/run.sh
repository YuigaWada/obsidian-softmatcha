#!/usr/bin/env bash
set -euo pipefail
SM_HERE="$(cd "$(dirname "$0")" && pwd)"
SM_ROOT="$(cd "$SM_HERE/../.." && pwd)"
cd "$SM_HERE"
exec "$SM_ROOT/.local/venv/bin/python" service.py "$@"
