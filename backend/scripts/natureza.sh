#!/usr/bin/env bash
# natureza.sh — o portao de NATUREZA POR USO (`ADR-016/D4`, `T-03.12`).
#
# `boundaries.sh` guarda DIRECAO de import (grafo, granularidade de modulo). Este guarda
# NATUREZA: a distincao capacidade x valor que `ADR-016/D1` fixa nao e expressavel no grafo
# de `import-linter` (`datetime.date` nao e submodulo de `datetime`), entao ela mora aqui, em
# `ast`, na MESMA fronteira estrutural que `ADR-011/D3a` ja escolheu para `boundaries.sh`
# (`ADR-012/D4`: o que morde e nao e motor do `harness` mora no `make`).
#
# Mesmo commit em que este arquivo nasce, `backend/pyproject.toml` estreita o contrato 3 de
# `["socket", "ssl", "time", "datetime"]` para `["socket", "ssl"]` — `ADR-016/D5` exige os
# dois no MESMO commit: estreitar antes abriria janela sem portao nenhum sobre `datetime`/
# `time` em `domain`/`use_cases` (E2 da ADR: `ignore_imports` sai verde com `datetime.now()`
# dentro de `domain/`).
#
# A logica de AST mora em `natureza.py`, promovido (copiado e endurecido, NAO movido — a
# bancada permanece reproduzivel a partir do texto da ADR, DoD-11) de
# `docs/adr/bancadas/ADR-016-natureza.py`.
#
# MESMO ASSERT DE VENV E VERSAO que `boundaries.sh`/`lint.sh`/`bootstrap.sh` — a duplicacao e
# deliberada pelo mesmo motivo que eles ja registram: centraliza-la exigiria um script de
# biblioteca que `ADR-011/D2` nao autoriza.
set -euo pipefail

PY_ALVO="3.13"   # ADR-011/D5

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PY="$BACKEND/.venv/bin/python"
SCANNER="$BACKEND/scripts/natureza.py"

if [ ! -x "$PY" ]; then
    echo "RECUSA: $PY nao existe. Rode 'make setup' (precisa de rede)." >&2
    exit 3
fi

if ! "$PY" -c "import sys; raise SystemExit(0 if '.'.join(map(str, sys.version_info[:2])) == '$PY_ALVO' else 1)"; then
    echo "RECUSA: o venv em $BACKEND/.venv e $("$PY" -V 2>&1), e ADR-011/D5 declara Python $PY_ALVO." >&2
    echo "        Um scanner de AST montado por um interpretador que o repositorio nao" >&2
    echo "        declarou nao e o scanner do repositorio. Refaca o ambiente: 'make setup'." >&2
    exit 3
fi

# ── ESCOPO (`ADR-016/D4`): backend/src/modules/*/domain/ e backend/src/modules/*/use_cases/ ──
#
# `infra/` fica FORA de proposito — e la que o relogio DEVE morar. O glob e sobre `*` porque
# o vocabulario fechado de componentes (`harness policy --key components`) tem mais de um
# contexto de codigo Python (`sentimento`, `charts`, `convergencia`, `backtest`), e o portao
# nao deve precisar de edicao quando o segundo nascer.
DIRS=()
for d in "$BACKEND"/src/modules/*/domain "$BACKEND"/src/modules/*/use_cases; do
    [ -d "$d" ] && DIRS+=("$d")
done

if [ "${#DIRS[@]}" -eq 0 ]; then
    echo "RECUSA: nenhum diretorio domain/ ou use_cases/ encontrado sob $BACKEND/src/modules." >&2
    echo "        universo vazio nao e prova (ADR-012) — o portao nao roda sobre nada." >&2
    exit 3
fi

exec "$PY" "$SCANNER" "${DIRS[@]}"
