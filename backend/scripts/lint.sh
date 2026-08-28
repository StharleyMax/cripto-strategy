#!/usr/bin/env bash
# lint.sh — o `[test_cmd.sentimento] lint` declarado em `harness.toml`: `ruff` + `mypy --strict`.
#
# Chamado por `make lint-backend` (que `make lint` agrega junto com o ESLint do frontend).
#
# ── A ASSERCAO DE VERSAO EFETIVA ENTROU AQUI EM 2026-08-28 (`T-01.6`), e o motivo e um achado ──
#
# O `/review` mediu: NENHUM PORTAO CHAMAVA `bootstrap.sh`. Nao ha CI (`ls .github` ->
# inexistente), o `pre-push` gerado roda `require-push` + `rules --mode sweep` e nao chama
# `make`, e as tres mencoes a `bootstrap.sh` neste arquivo, em `test.sh` e em
# `check-coverage-layers.sh` eram TEXTO DE MENSAGEM DE ERRO, nao chamada. Logo o unico assert da
# versao EFETIVA do interpretador — o de `bootstrap.sh` — nao era executado por ninguem.
#
# `T-01.6` tinha duas saidas e escolheu as DUAS, porque uma so deixaria o achado aberto com
# aparencia de fechado:
#   (a) `make setup` passa a chamar `bootstrap.sh` — mas `make setup` e comando de HUMANO, e um
#       humano que nao o rodar continua com o venv errado e sem ninguem conferindo;
#   (b) a assercao entra AQUI, que e alcancavel por portao: `make lint` e o que
#       `scripts/hooks/pre-push.pre-harness` (`ADR-011/D3b`, `T-01.5`) vai rodar no `pre-push`.
#
# O QUE ESTA RECUSA NAO E: substituto de `mypy python_version` nem de `ruff target-version`.
# Aqueles declaram ALVO — um venv 3.12 passaria o lint igual, e foi essa a lacuna medida. Este
# assert confere o interpretador que de fato RODA o portao.
#
# A expressao e a MESMA de `backend/scripts/bootstrap.sh` (mesma comparacao de major.minor,
# mesmo `PY_ALVO`). Duplicacao deliberada e nomeada: centraliza-la exigiria um quinto script
# que `ADR-011/D2` nao autoriza esta task a criar. Se `PY_ALVO` mudar, mudam os DOIS — e o
# `grep -n 'PY_ALVO' backend/scripts/*.sh` do DoD `D1.9` os encontra juntos.
set -euo pipefail

PY_ALVO="3.13"   # ADR-011/D5 (supersede ADR-009/D4, que dizia 3.12)

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PY="$BACKEND/.venv/bin/python"

if [ ! -x "$PY" ]; then
    echo "RECUSA: $PY nao existe. Rode 'make setup' (precisa de rede)." >&2
    exit 3
fi

if ! "$PY" -c "import sys; raise SystemExit(0 if '.'.join(map(str, sys.version_info[:2])) == '$PY_ALVO' else 1)"; then
    echo "RECUSA: o venv em $BACKEND/.venv e $("$PY" -V 2>&1), e ADR-011/D5 declara Python $PY_ALVO." >&2
    echo "        Rodar o portao num interpretador que o repositorio nao declarou mede outra" >&2
    echo "        coisa: 'ruff target-version = py313' e 'mypy python_version = 3.13' declaram" >&2
    echo "        ALVO, nao o interpretador — um venv 3.12 passaria os dois em silencio." >&2
    echo "        Refaca o ambiente: 'make setup' (ADR-011/D1 usa Poetry; o venv converge)." >&2
    exit 3
fi

cd "$BACKEND"
"$PY" -m ruff check src tests
"$PY" -m ruff format --check src tests
"$PY" -m mypy src tests
