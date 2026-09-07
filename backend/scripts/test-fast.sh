#!/usr/bin/env bash
# test-fast.sh — o LACO DE DESENVOLVIMENTO. NAO e portao, e nao substitui `test.sh`.
#
# POR QUE EXISTE, com o numero que o produziu `[MEDIDO 2026-09-07 sobre 543 transcripts JSONL,
# n=34.763 chamadas de ferramenta]`: a suite INTEIRA foi rodada 1.138 vezes a 37,5s = 11,86h,
# 22% de todo o wall-clock de ferramenta medido (53,33h). As 641 execucoes ALVO custaram 6,2s
# cada. O caminho barato ja existia (`test.sh -k nome --no-cov`); o que faltava era ele ser tao
# facil de digitar quanto o caro — o principio de R7 em `docs/protocolo-de-despacho.md`.
#
# ⛔ O QUE ESTE SCRIPT NAO FAZ, e a omissao e o ponto: nao mede cobertura e NAO chama
# `check-coverage-layers.sh`. As duas recusas rc=3 daquele script ("relatorio AUSENTE" e
# "relatorio VELHO") sao o ativo mais caro desta trilha e continuam existindo — em `test.sh`,
# onde o portao mora. Verde AQUI nao e verde de portao.
#
# POR QUE UM `.sh` E NAO UMA RECEITA NO MAKEFILE: `ADR-011/D2` — uma linha, um comando, e um
# `.sh` do outro lado. Um `cd backend && .venv/bin/python` embutido no Makefile recriaria a
# quinta via de resolucao de interpretador que `T-01.6` eliminou. A resolucao de interpretador
# deste repositorio mora em UM lugar por arquivo, e este arquivo espelha a de `test.sh`.
#
# POR QUE NAO APAGA O `coverage.xml`: `test.sh` o apaga porque ELE gera um novo e um relatorio
# velho viraria falso-verde. Este script nao escreve relatorio nenhum, e a segunda metade da
# guarda ja cobre o caso — `check-coverage-layers.sh` exige o XML mais novo que o `.py` mais
# novo de `src/`. Apagar aqui so obrigaria a re-rodar a suite inteira sem ganhar guarda.
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PY="$BACKEND/.venv/bin/python"

if [ ! -x "$PY" ]; then
    echo "RECUSA: $PY nao existe. Rode 'bash backend/scripts/bootstrap.sh' (precisa de rede)." >&2
    echo "        Cair para o 'python3' do PATH seria rodar num ambiente que o repositorio" >&2
    echo "        nao declarou — e e exatamente o que esta recusa impede." >&2
    exit 3
fi

# Sem filtro isto seria a suite inteira sem cobertura e sem piso: o comando CARO vestido com o
# nome do barato. A recusa e rc=3 pela mesma semantica dos outros scripts desta pasta —
# "nao mediu" tem de ser distinguivel de "mediu e passou".
# O segundo teste nao e redundante com o primeiro: `-k ""` (filtro VAZIO) casa com a suite
# inteira no pytest, entao ele passa por `$# -eq 0` e seria o pior caso — a suite completa, sem
# cobertura, sem piso, anunciada como execucao alvo.
if [ "$#" -eq 0 ] || [ "$*" = "-k " ] || [ "$#" -eq 2 -a "$1" = "-k" -a -z "${2:-}" ]; then
    echo "RECUSA: test-fast.sh exige um filtro de pytest." >&2
    echo "        Uso: bash backend/scripts/test-fast.sh -k nome_do_teste" >&2
    echo "        Ou pelo Makefile: make test-fast K=nome_do_teste" >&2
    echo "        Para a suite completa COM portao, rode 'make test' ou 'make verify'." >&2
    exit 3
fi

cd "$BACKEND"
exec "$PY" -m pytest --no-cov "$@"
