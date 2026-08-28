#!/usr/bin/env bash
# lint.sh — o `[test_cmd.sentimento] lint` declarado em `harness.toml`: `ruff` + `mypy --strict`.
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PY="$BACKEND/.venv/bin/python"

if [ ! -x "$PY" ]; then
    echo "RECUSA: $PY nao existe. Rode 'bash backend/scripts/bootstrap.sh' (precisa de rede)." >&2
    exit 3
fi

cd "$BACKEND"
"$PY" -m ruff check src tests
"$PY" -m ruff format --check src tests
"$PY" -m mypy src tests
