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
#
# ── O RELATORIO E INVALIDADO ANTES DE MEDIR (conserto do `/review` de 2026-08-28, item B) ──
#
# Este script repassa `"$@"` ao pytest, e portanto aceita `--no-cov`, `-k`, `--deselect`. Ate
# 2026-08-28 ele NAO apagava o `coverage.xml` antes de rodar: com `--no-cov`, o pytest nao
# escrevia relatorio nenhum e o piso por camada lia o XML da RODADA ANTERIOR, anunciando tres
# camadas `[OK]` tendo medido ZERO. Era a frase do cabecalho do `check-coverage-layers.sh`
# invertida — verde sem universo varrido. `[MEDIDO 2026-08-28: `test.sh --no-cov -k <1 teste>`
# -> `1 passed, 13 deselected`, tres `[OK]` 100%, rc=0, `coverage.xml` byte-identico
# (md5 73dbab8d…) ao de 3 h antes]`.
#
# O `rm -f` abaixo faz "relatorio velho" cair na recusa que ja existia para "relatorio
# ausente". E a segunda metade vive no `check-coverage-layers.sh`, que agora exige o XML mais
# novo que o `.py` mais novo de `src/` — porque este `rm` so protege quem entra por AQUI, e o
# piso tambem e chamavel direto.
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
rm -f "$BACKEND/coverage.xml"
"$PY" -m pytest --cov=src --cov-report=xml:coverage.xml --cov-report=term-missing "$@"
bash "$BACKEND/scripts/check-coverage-layers.sh"
