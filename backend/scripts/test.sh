#!/usr/bin/env bash
# test.sh — o `[test_cmd.sentimento] test` declarado em `harness.toml`.
#
# Roda a suite com cobertura e, DEPOIS, o piso POR CAMADA. As duas metades sao obrigatorias:
# um piso global sobe na camada barata (`infra`) enquanto `domain` fica descoberto, e e em
# `domain` que as invariantes vivem (`ADR-009/D1`).
#
# ZERO REDE: nenhum teste desta suite chama Binance, Bybit ou Coinalyze. `Q1` e `Q15` estao
# ABERTAS e coletor nao roda em portao. A evidencia disso NAO e o grep desta frase (que e prosa
# e o grep pega a si mesmo — ver `backend/README.md`, "Zero rede, zero chave"): e rodar a suite
# com `socket` amputado por um `sitecustomize.py`, que alcanca tambem o subprocesso do driver.
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PY="$BACKEND/.venv/bin/python"

if [ ! -x "$PY" ]; then
    echo "RECUSA: $PY nao existe. Rode 'bash backend/scripts/bootstrap.sh' (precisa de rede)." >&2
    echo "        Cair para o 'python3' do PATH seria rodar o portao num ambiente que o" >&2
    echo "        repositorio nao declarou — e e exatamente o que esta recusa impede." >&2
    exit 3
fi

cd "$BACKEND"
"$PY" -m pytest --cov=src --cov-report=xml:coverage.xml --cov-report=term-missing "$@"
bash "$BACKEND/scripts/check-coverage-layers.sh"
