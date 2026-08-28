#!/usr/bin/env bash
# bootstrap.sh — cria `backend/.venv` e instala as dependencias FIXADAS de desenvolvimento.
#
# E o UNICO passo do backend que precisa de rede. O `test_cmd` declarado
# (`backend/scripts/test.sh`) roda offline sobre o ambiente que este script deixa pronto,
# e RECUSA se ele nao existir — nunca cai para o interpretador do PATH.
#
# Interpretador: preferencia declarada, e a versao efetiva sai impressa. `ADR-009/D4` decide
# Python 3.12; a remocao do `.python-version` = 3.13.13 da raiz e a task `T-01.4`. Enquanto
# ela nao roda, um shell sob `pyenv` resolve 3.13 e este script preferiria 3.13 se nao
# nomeasse `python3.12` primeiro.
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$BACKEND/.venv"

escolher_interpretador() {
    for candidato in python3.12 python3 python3.13; do
        if command -v -- "$candidato" >/dev/null 2>&1; then
            printf '%s\n' "$candidato"
            return 0
        fi
    done
    echo "RECUSA: nenhum interpretador Python encontrado no PATH" >&2
    exit 3
}

PY_BOOTSTRAP="$(escolher_interpretador)"

if command -v uv >/dev/null 2>&1; then
    uv venv --python "$PY_BOOTSTRAP" "$VENV"
    uv pip install --python "$VENV/bin/python" -r "$BACKEND/requirements-dev.txt"
else
    "$PY_BOOTSTRAP" -m venv "$VENV"
    "$VENV/bin/python" -m pip install --upgrade pip
    "$VENV/bin/python" -m pip install -r "$BACKEND/requirements-dev.txt"
fi

echo "ambiente pronto: $("$VENV/bin/python" -V) em $VENV"
