#!/usr/bin/env bash
# verify.sh — os portões numa chamada só, e a saída bruta FORA do contexto do agente.
#
# ── POR QUE ESTE ARQUIVO EXISTE, com o número que o produziu ───────────────────────────
#
# `[MEDIDO 2026-08-29 sobre 105 transcripts de subagente deste projeto, n=1.320 chamadas]`:
# os comandos de verificação despejaram **~397 mil tokens de saída bruta** no contexto dos
# agentes — `git diff` 277 chamadas / ~201k tokens · `harness rules` 332 / ~66k ·
# `make lint` 221 / ~43k · `make test` 263 / ~41k · `git status` 158 / ~35k ·
# `make boundaries` 69 / ~10k.
#
# E o custo não é pago uma vez. O maior `/build` da sessão leu **93,5M de contexto** para
# produzir **72,7k de conteúdo único** — cada token que entra no contexto é relido, em média,
# centenas de vezes até o agente morrer `[MEDIDO 2026-08-29: 93.561.215 / 72.756 = 1.286×]`.
#
# Este script não mede nada de novo e não decide nada: ele chama EXATAMENTE os mesmos
# portões (os SEIS: lint-backend, lint-frontend, test, boundaries, regras, política) e
# devolve o veredito em ~12 linhas, deixando a saída bruta em disco.
#
# ── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────────────────
#
# NÃO inventa número. Quando o padrão de extração não casa, ele imprime `(número não
# extraído)` e o `rc` — nunca um valor plausível. Um resumo que chuta é pior que a saída
# bruta, porque parece medição.
#
# NÃO substitui o portão de push nem o `gate-record`. É superfície de LEITURA.
#
# ── SEMÂNTICA DE SAÍDA, herdada dos scripts do backend ─────────────────────────────────
#
#   0 = todos os portões mediram e passaram
#   1 = algum portão MEDIU e REPROVOU
#   3 = algum portão RECUSOU medir (ambiente ausente) — distinto de reprovar
#
# `make` colapsa tudo em 2 e por isso este script chama os `.sh` direto, exatamente como o
# cabeçalho do `Makefile` já declara para os comandos de DoD.
#
# Sem `set -e`: preciso do `rc` de CADA portão. Morrer no primeiro esconderia os outros —
# o mesmo argumento que o `pre-push` do plugin já faz.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 3
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="${VERIFY_LOG_DIR:-${TMPDIR:-/tmp}}/verify-$(basename "$ROOT")-$TS.log"
: > "$LOG" || { echo "RECUSA: não consegui escrever em $LOG" >&2; exit 3; }

PIOR=0
falhou() { # eleva o veredito sem nunca rebaixá-lo: 3 (não mediu) manda sobre 1
    [ "$1" -eq 3 ] && PIOR=3
    [ "$1" -ne 0 ] && [ "$PIOR" -ne 3 ] && PIOR=1
    return 0
}
rotulo() { case "$1" in 0) echo "OK  ";; 3) echo "NÃO MEDIU";; *) echo "FALHA";; esac; }

# Roda um portão, manda tudo para o log, devolve o rc. A saída bruta NUNCA vai para stdout.
portao() { # portao <nome> <comando...>
    local nome="$1"; shift
    { echo; echo "########## $nome :: $* ##########"; } >> "$LOG"
    "$@" >> "$LOG" 2>&1
    return $?
}

# Extrai um número do log DESTE portão. Devolve vazio quando não casa — quem imprime decide.
extrai() { grep -aoE "$1" "$LOG" | tail -1; }

echo "=== verify · $(basename "$ROOT") · $TS (UTC) ==="

# ── 1. lint ────────────────────────────────────────────────────────────────────────────
portao "lint-backend" bash backend/scripts/lint.sh; RC_LB=$?; falhou $RC_LB
N_LB="$(extrai '[0-9]+ source files')"
printf '[%-9s] lint-backend    rc=%s  %s\n' "$(rotulo $RC_LB)" "$RC_LB" "${N_LB:-(número não extraído)}"

# ── 1b. lint do frontend ───────────────────────────────────────────────────────────────
# NÃO é opcional e NÃO pode ser esquecido: `ADR-011/D4` o declara portão, e a primeira versão
# deste script chamava só `backend/scripts/lint.sh` — omitindo-o EM SILÊNCIO, que é o defeito
# "parecendo coberto" que este repositório nomeia. Sem `node_modules/` a resposta é rc=3
# ("não mediu"), nunca verde: `node_modules/` é gitignored, então clone limpo não o tem.
#
# DUAS chamadas, ESLint e `tsc --noEmit --strict`, espelhando EXATAMENTE o alvo `lint-frontend`
# do Makefile (`ADR-018`) — não `make lint-frontend` direto, porque `make` colapsa qualquer
# falha em rc=2 (ver cabeçalho do `Makefile`), o que apagaria a distinção rc=1 (reprovou) vs
# rc=3 (recusou por ambiente ausente) que este script promete. `[QA T-05.11 rodada 1, BLOCKER]`:
# antes desta forma, só o ESLint rodava aqui — um erro de `tsc` plantado passava `[OK] rc=0`
# neste portão mesmo com `make lint-frontend`/pre-push reprovando-o corretamente.
if [ -d frontend/node_modules ]; then
    portao "lint-frontend" npm --prefix frontend run lint; RC_LF=$?
    if [ "$RC_LF" -eq 0 ]; then
        portao "lint-frontend-typecheck" npm --prefix frontend run typecheck; RC_LF=$?
    fi
else
    { echo; echo "########## lint-frontend :: RECUSA (frontend/node_modules ausente) ##########"; } >> "$LOG"
    RC_LF=3
fi
falhou $RC_LF
[ "$RC_LF" -eq 3 ] && DET_LF="frontend/node_modules ausente — rode 'make setup'" || DET_LF="ESLint + tsc --noEmit --strict do projeto sobre frontend/src"
printf '[%-9s] lint-frontend   rc=%s  %s\n' "$(rotulo $RC_LF)" "$RC_LF" "$DET_LF"

# ── 2. suíte + piso de cobertura por camada ────────────────────────────────────────────
portao "test" bash backend/scripts/test.sh; RC_T=$?; falhou $RC_T
N_T="$(extrai '[0-9]+ (passed|failed)')"
N_C="$(extrai 'Total coverage: [0-9.]+%')"
printf '[%-9s] test            rc=%s  %s · %s\n' "$(rotulo $RC_T)" "$RC_T" "${N_T:-(n não extraído)}" "${N_C:-(cobertura não extraída)}"

# ── 3. fronteira de módulo ─────────────────────────────────────────────────────────────
portao "boundaries" bash backend/scripts/boundaries.sh; RC_B=$?; falhou $RC_B
N_B="$(extrai '[0-9]+ kept, [0-9]+ broken')"
printf '[%-9s] boundaries      rc=%s  %s\n' "$(rotulo $RC_B)" "$RC_B" "${N_B:-(número não extraído)}"

# ── 4. regras em vigor, na mesma superfície do git-hook ────────────────────────────────
# `--surface git-hook` e não o default: é a superfície que o `pre-push` usa, e medir noutra
# responderia uma pergunta diferente daquela que vai reprovar o push.
portao "regras" bash .harness/mechanism rules --mode sweep --surface git-hook; RC_R=$?; falhou $RC_R
# Conta DENTRO da seção de regras, nunca no log inteiro: `[AVISO]`/`[BLOQUEIO]` numa saída
# anterior (pytest, eslint) inflaria o número, e este script existe para não mentir número.
secao() { awk -v m="########## $1 ::" 'index($0,m){f=1;next} /^########## /{f=0} f' "$LOG"; }
N_BLQ="$(secao regras | grep -ac '\[BLOQUEIO\]' || true)"
N_AVI="$(secao regras | grep -ac '\[AVISO\]' || true)"
printf '[%-9s] regras          rc=%s  %s bloqueio(s), %s aviso(s)\n' "$(rotulo $RC_R)" "$RC_R" "${N_BLQ:-?}" "${N_AVI:-?}"

# ── 5. política e instalação ───────────────────────────────────────────────────────────
portao "validate" bash .harness/mechanism validate --strict; RC_V=$?; falhou $RC_V
printf '[%-9s] política        rc=%s\n' "$(rotulo $RC_V)" "$RC_V"

# ── 6. o diff, como FORMA e não como conteúdo ──────────────────────────────────────────
# `git diff` sozinho custou ~201k tokens nos 105 subagentes medidos, e quase sempre a
# pergunta era "o que mudou", não "mostre cada linha". `--stat` responde a primeira; quem
# precisar da segunda abre o log.
portao "diff" git --no-pager diff --stat HEAD; RC_D=$?
portao "diff-completo" git --no-pager diff HEAD; :
D_STAT="$(git --no-pager diff --shortstat HEAD 2>/dev/null)"
printf '[%-9s] diff            %s\n' "----" "${D_STAT:-sem mudança não-commitada}"

case "$PIOR" in
    0) echo "veredito: VERDE — 6 portões mediram e passaram";;
    1) echo "veredito: VERMELHO — algum portão mediu e REPROVOU";;
    3) echo "veredito: INDETERMINADO — algum portão RECUSOU medir (rc=3). Não é o mesmo que passar.";;
esac
printf 'saída completa: %s (%s)\n' "$LOG" "$(du -h "$LOG" 2>/dev/null | cut -f1)"
echo 'NÃO leia o log inteiro: grep o que precisar. Ele existe para ficar FORA do contexto.'
exit "$PIOR"
