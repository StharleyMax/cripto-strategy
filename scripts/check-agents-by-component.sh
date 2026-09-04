#!/usr/bin/env bash
# check-agents-by-component.sh — a atribuicao de `agents.by_component` como PROPRIEDADE
# MEDIDA (plano `01` item `1.13`, DoD `D1.12`, `ADR-012/D5b`, `T-01.9`).
#
# ── POR QUE ESTE PORTAO EXISTE, com o numero que o produziu ────────────────────────────
#
# `docs/gate-de-design.md` §"O que a mutacao mostrou" `[MEDIDO 2026-08-28 por T-01.3, n=5
# mutacoes efemeras contra o `harness.toml`]`: de cinco mutacoes, o mecanismo do `harness`
# so REPROVA UMA — componente fora do vocabulario fechado (`V-16`). As outras quatro passam
# em `rc=0`, silencio total, em `validate --strict`, `policy`, `doctor`, `sweep` e
# `tasks validate`:
#
#   - `design_gate` APAGADO das duas entradas  -> rc=0, e a autonomia delegada some
#   - donos TROCADOS (`charts` <-> `web`)      -> rc=0, e a atribuicao do owner fica invertida
#   - `[agents.by_component.charts]` VAZIA     -> rc=0, e `policy` publica `"charts": {}`
#   - ponteiro para caminho inexistente        -> rc=0 com `[aviso]`, que nao reprova
#
# ⛔ E O DEFEITO QUE ESTE ARQUIVO NAO PODE REPETIR e o do proprio `D1.2`: um comando que so
# confere PRESENCA DE CHAVE ("a saida contem `charts` e `web`") e satisfeito por
# `{"charts": {}}` — ele testa presenca de chave, nao presenca de DONO. Por isso a comparacao
# em `check_agents_by_component.py` e sobre o MAPA INTEIRO: componentes, papeis e o valor de
# cada papel. Componente a MAIS tambem diverge — e assim a AUSENCIA de `docs` em
# `agents.by_component` fica congelada tambem `[MEDIDO 2026-09-03: `components` tem 7 entradas
# e `agents.by_component` tem 6; `docs` nao esta la]`.
#
# ── O QUE ELE NAO E ────────────────────────────────────────────────────────────────────
#
# NAO e roteamento: `ADR-012/D5a` recusa, e rotear e do `harness-plugin`. Este portao faz uma
# coisa so — DESFAZER a decisao do owner passa a custar editar DUAS superficies, `harness.toml`
# e o arquivo dourado, e a segunda aparece no diff da revisao.
#
# NAO e substituto de `harness validate --strict`: aquele reprova componente fora do enum, que
# e o unico erro que o mecanismo ja fecha. Os dois se somam.
#
# ── COMO A MUTACAO SE PROVA, sem tocar no `harness.toml` real ──────────────────────────
#
# O dourado e resolvido pelo diretorio DESTE script; a politica e lida do diretorio CORRENTE.
# Entao a bancada de mutacao e um `harness.toml` mutado numa copia, em outro diretorio:
#
#   mkdir /tmp/bench && cp harness.toml /tmp/bench/ && <edite /tmp/bench/harness.toml>
#   cd /tmp/bench && bash "$OLDPWD/scripts/check-agents-by-component.sh"   # rc=1, nomeando a chave
#
# ── SEMANTICA DE SAIDA, a mesma dos outros portoes (`ADR-011/D2`) ──────────────────────
#
#   0 = mediu e bate      1 = MEDIU E DIVERGIU      3 = RECUSOU medir (ambiente/dourado)
#
# `make` colapsa 1 e 3 em 2; para LER a causa, chame este script direto.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
DOURADO="$AQUI/agents-by-component.golden.json"
COMPARADOR="$AQUI/check_agents_by_component.py"

if ! command -v harness > /dev/null 2>&1; then
    echo "RECUSA: 'harness' nao esta no PATH — sem ele nao ha politica a medir." >&2
    echo "        Instalacao: 'harness doctor' no repositorio onde ele existe." >&2
    exit 3
fi

if ! command -v python3 > /dev/null 2>&1; then
    echo "RECUSA: 'python3' nao esta no PATH — o comparador e stdlib, mas precisa do interpretador." >&2
    exit 3
fi

# ⚠️ O comparador NAO usa `backend/.venv` de proposito, e a excecao e deliberada: ele so faz
# `json.load`, e amarrar o portao da POLITICA (componente `docs`) ao venv do BACKEND o faria
# recusar num clone sem `make setup` — recusa por motivo que nao tem nada a ver com o que ele
# mede. `natureza.sh`/`boundaries.sh` exigem o venv porque analisam o codigo do backend.

for arquivo in "$DOURADO" "$COMPARADOR"; do
    if [ ! -f "$arquivo" ]; then
        echo "RECUSA: $arquivo nao existe. O portao nao roda sobre nada." >&2
        exit 3
    fi
done

# `harness policy` numa VARIAVEL, nunca num pipe: com `|` o `rc` do `harness` seria o do
# `python3` e uma falha do harness viraria "divergencia", que e numero de universo errado.
# `set -e` nao alcanca uma atribuicao com substituicao de comando, entao o `rc` e conferido
# a mao. E o stderr vai para ARQUIVO, nunca para `2>&1`: um aviso do harness misturado ao
# stdout quebraria o `json.load` e viraria RECUSA — falso rc=3 com causa errada.
ERRO="$(mktemp)"
trap 'rm -f "$ERRO"' EXIT

set +e
POLITICA="$(harness policy --key agents.by_component 2> "$ERRO")"
RC_POLITICA=$?
set -e

if [ "$RC_POLITICA" -ne 0 ]; then
    echo "RECUSA: 'harness policy --key agents.by_component' saiu com rc=$RC_POLITICA." >&2
    echo "        Nao mediu — isto NAO e o mesmo que a atribuicao ter divergido." >&2
    cat "$ERRO" >&2
    exit 3
fi

printf '%s' "$POLITICA" | python3 "$COMPARADOR" "$DOURADO"
