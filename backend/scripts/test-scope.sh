#!/usr/bin/env bash
# test-scope.sh — the pytest of `make verify-scope` (`T-06.2`). NOT a gate, and it does not replace
# `test.sh`.
#
# `[DECISÃO-OWNER: 2026-10-02, escolha entre alternativas apresentadas]` (`docs/context/paineis-de-fluxo/
# handoff/T-06.3-desenho.md`, "Verificação por escopo"): the builder runs only the pytest of the
# component its diff touches; "a suíte inteira com cobertura e piso por camada continua portão da wave".
# The targets come from `scripts/scope-resolve.sh` (derived from the diff), never from a hand-typed list.
#
# WHAT IT KEEPS FROM `test.sh`: the amputated socket (`scripts/nonet/sitecustomize.py`). A scoped run
# that could reach the network would be measuring a different suite from the one the wave gate runs.
# `test-fast.sh` does not set it — that is the development loop; this one stands in for a gate, so it
# keeps the gate's environment.
#
# WHAT IT DROPS, and the omission is the point: coverage and the per-layer floor
# (`check-coverage-layers.sh`). A floor measured over a subset of the suite is a floor of nothing —
# `domain` would be "covered" by whatever subset happened to run. Green here is NOT gate green.
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PY="$BACKEND/.venv/bin/python"

if [ ! -x "$PY" ]; then
    echo "RECUSA: $PY nao existe. Rode 'bash backend/scripts/bootstrap.sh' (precisa de rede)." >&2
    exit 3
fi

# Without a target this would be the whole suite without coverage and without the floor: the gate's
# cost dressed as the scope's name. Same refusal, same rc, as `test-fast.sh` without a filter.
has_target=0
for arg in "$@"; do
    case "$arg" in tests/*) has_target=1 ;; esac
done
if [ "$has_target" -eq 0 ]; then
    echo "RECUSA: test-scope.sh exige ao menos um alvo sob tests/ (derivado por scripts/scope-resolve.sh)." >&2
    echo "        A suite completa COM portao e 'make test' ou 'make verify'." >&2
    exit 3
fi

cd "$BACKEND"
export PYTHONPATH="$BACKEND/scripts/nonet${PYTHONPATH:+:$PYTHONPATH}"
exec "$PY" -m pytest --no-cov "$@"
