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
# portões (os OITO: lint-backend, lint-frontend, test, test-frontend, boundaries, regras,
# política, e2e) e devolve o veredito em ~14 linhas, deixando a saída bruta em disco.
#
# ── POR QUE OITO E NÃO SEIS, e as duas razões são achados MEDIDOS ──────────────────────
#
# `test-frontend` (`C1`) — `grep -rn 'node --test' scripts/verify.sh Makefile .git/hooks/pre-push`
# devolvia **0 linha** `[MEDIDO 2026-09-03, reconfirmado 2026-09-12]`: as quatro suítes do
# front (`test:app` 181 · `test:charts` 195 · `test:s1` 105 · `test:s3` 111, n=592 testes)
# **não estavam em portão nenhum** e só protegiam quem lembrasse de rodá-las. Dois agentes
# levantaram isso em ciclos diferentes antes de alguém pagar.
#
# `e2e` (`DR-11`) — o design-review de `c7e17fc` demonstrou o vão, não o supôs: ele replantou
# `#FFFFFF` no `<canvas>` por uma porta que os DOIS portões de fonte sancionavam, e
# `color-contrast.test.ts` (pass 16 · fail 0) e `chart-construction.test.ts` (pass 7 · fail 0)
# ficaram **verdes com o defeito na tela**. Só `e2e/11-canvas-fundo.spec.ts` — que lê o PIXEL —
# reprovou (`Expected: "#131722"` · `Received: "#ffffff"`, n=12 canvases). Ele estava FORA
# daqui, por custo. Um instrumento que é o único capaz de ver a classe inteira de defeito, e
# que roda só por lembrança, não é portão — é hábito. Custo medido de trazê-lo:
# `[MEDIDO 2026-09-12: make e2e → rc=0, 49 s de relógio, 27 specs]`.
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

# ── 1c. suítes do frontend (`node --test`) ─────────────────────────────────────────────
# `C1`. As quatro suítes que `frontend/package.json` declara, todas, sem lista de exclusão.
#
# ⚠️ A PRECONDIÇÃO É VERIFICADA ANTES, E A RECUSA É rc=3 — NÃO rc=1. Nove arquivos de teste
# leem o corpus NÃO-VERSIONADO de `data/` (`grep -rln 'data/binance\|data/snapshots' frontend/src
# --include='*.test.ts'` → 9), que é gitignored por desenho (`CLAUDE.md` §"Dado bruto não é
# versionado"). Sem ele, `test:charts` reprova 16 e `test:app` 1, **por ambiente**. Promover
# uma suíte que já reprova por ambiente é o defeito `C5`: um portão vermelho por motivo
# conhecido, atrás do qual uma regressão de verdade fica escondida — e `ADR-012` já nomeia
# esse sinal indistinguível. Aqui a ausência do corpus diz "NÃO MEDIU", que não é passar.
#
# ⛔ `test:s1` NÃO é excluída, e a exclusão foi considerada e RECUSADA. Ela dava 97/105 por
# `store_parent_missing`: `create_app` exige DOIS diretórios-pai e a fixture pinava só um
# (`INGEST_HEALTH_STORE_PATH`), deixando `QUARANTINE_STORE_PATH` no default `data/md/` — que
# não existe em checkout nenhum. Consertado na fixture (`ingest-health-query-http.test.ts`),
# não contornado aqui: `[MEDIDO 2026-09-12: 97/105 antes → 105/105 depois]`. Exclusão teria
# congelado o defeito com um motivo escrito ao lado.
FRONTEND_FIXTURE_ROOTS="data/binance data/snapshots"
FRONTEND_SUITES="app charts s1 s3"
if [ ! -d frontend/node_modules ]; then
    { echo; echo "########## test-frontend :: RECUSA (frontend/node_modules ausente) ##########"; } >> "$LOG"
    RC_TF=3; DET_TF="frontend/node_modules ausente — rode 'make setup'"
else
    FALTANDO=""
    for raiz in $FRONTEND_FIXTURE_ROOTS; do
        [ -d "$raiz" ] || FALTANDO="$FALTANDO $raiz"
    done
    if [ -n "$FALTANDO" ]; then
        { echo; echo "########## test-frontend :: RECUSA (corpus ausente:$FALTANDO) ##########"; } >> "$LOG"
        RC_TF=3; DET_TF="corpus não-versionado ausente:$FALTANDO — ver data/MANIFEST.md"
    else
        RC_TF=0
        for suite in $FRONTEND_SUITES; do
            portao "test-frontend-$suite" npm --prefix frontend run "test:$suite"; RC_SUITE=$?
            [ "$RC_SUITE" -ne 0 ] && RC_TF=1
        done
        # Soma pass/fail SÓ dentro das seções `test-frontend-*` — um `pass`/`fail` do ESLint ou
        # do pytest noutra seção inflaria o número, e este script existe para não mentir número.
        # ⚠️ O padrão NÃO ancora o prefixo: `node --test` escreve `ℹ pass 181`, e o `ℹ` é
        # multibyte — um `^.?` casa UM byte e falha em silêncio, imprimindo `0 pass, 0 fail`
        # (medido na primeira versão deste bloco, com as suítes REPROVANDO ao lado).
        DET_TF="$(awk '/^########## test-frontend-/{f=1;next} /^########## /{f=0}
                       f && / pass [0-9]+$/{p+=$NF}
                       f && / fail [0-9]+$/{q+=$NF}
                       END{printf "%d pass, %d fail em 4 suítes (app/charts/s1/s3)", p, q}' "$LOG")"
    fi
fi
falhou $RC_TF
printf '[%-9s] test-frontend   rc=%s  %s\n' "$(rotulo $RC_TF)" "$RC_TF" "$DET_TF"

# ── 2. suíte + piso de cobertura por camada ────────────────────────────────────────────
# `R-G` (`docs/plans/SPEC-004-captura-em-producao/index.md`): "verificação é `make verify`
# … testes de processo real declarados por fase fora de `verify` até o owner decidir". O
# `-m 'not process_real'` abaixo É essa exclusão — sem ela o teste marcado roda dentro deste
# portão por padrão, que foi o `[BLOCKER]` que o `/review` de `T-01.7` achou (a alegação de
# "fora de verify" no plano/commit não tinha mecanismo real). Reverter (trazer para dentro do
# portão) custa a linha abaixo (`tasks_review.md` §8) — ato do owner: apague o `-m …`.
portao "test" bash backend/scripts/test.sh -m "not process_real"; RC_T=$?; falhou $RC_T
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

# ── 6. e2e: o único portão que mede o que foi PINTADO ──────────────────────────────────
# `DR-11`. Os outros sete portões leem TEXTO-FONTE ou rodam lógica sem tela; este abre um
# browser de verdade contra a app de verdade e lê os pixels do `<canvas>`. A diferença não é
# de grau: o design-review de `c7e17fc` replantou `#FFFFFF` no fundo do gráfico por uma porta
# que os dois portões de fonte sancionavam, e **os dois ficaram verdes**. Só
# `e2e/11-canvas-fundo.spec.ts` reprovou.
#
# CHAMA `make e2e` E NÃO O `playwright` DIRETO, de propósito: o setup/teardown (seed do store
# efêmero, `next build`, `next start`, API de teste, e derrubar tudo) mora em
# `scripts/e2e-env.sh` orquestrado pela receita, e duplicá-lo aqui criaria uma segunda verdade
# sobre como o e2e sobe. O `make` colapsa qualquer falha em rc=2 — por isso o rc é traduzido
# logo abaixo, e a tradução é CONSERVADORA: rc≠0 que não seja a recusa de ambiente vira 1
# ("mediu e reprovou"), nunca 3.
#
# ⚠️ O CUSTO ESTÁ DECLARADO, PORQUE ELE É O ARGUMENTO QUE MANTINHA ISTO FORA:
# `[MEDIDO 2026-09-12: make e2e → rc=0, 49 s de relógio, 27 specs, 12 canvases]`. O comentário
# do alvo `e2e` no `Makefile` dizia "+~35 s por verify"; o número real é ~49 s, e ele é o preço
# de o portão de pixel deixar de depender de alguém lembrar.
#
# ⛔ SEM VARIÁVEL DE PULO. "Entrada de allowlist é indistinguível de bypass" (`CLAUDE.md`), e um
# `SKIP_E2E=1` seria exatamente a porta que `DR-11` acabou de fechar, reaberta no nível do
# portão. Ambiente ausente responde rc=3 ("NÃO MEDIU"), que não é passar.
if [ ! -d frontend/node_modules ] || [ ! -x backend/.venv/bin/python ]; then
    { echo; echo "########## e2e :: RECUSA (frontend/node_modules ou backend/.venv ausente) ##########"; } >> "$LOG"
    RC_E=3; DET_E="frontend/node_modules ou backend/.venv ausente — rode 'make setup'"
else
    portao "e2e" make e2e; RC_MAKE_E2E=$?
    # `e2e-env.sh` imprime `RECUSA:` e devolve 3 quando o ambiente não permite medir (porta
    # ocupada, `next build` que não roda, venv incompleta). Isso NÃO é o Playwright reprovando,
    # e colapsar os dois em "FALHA" perderia a distinção que este script promete — ainda mais
    # aqui, onde o `make` já apagou o rc original transformando tudo em 2.
    N_RECUSA_E2E="$(awk '/^########## e2e ::/{f=1;next} /^########## /{f=0} f' "$LOG" | grep -ac '^RECUSA:' || true)"
    if [ "$RC_MAKE_E2E" -eq 0 ]; then
        RC_E=0
    elif [ "${N_RECUSA_E2E:-0}" -gt 0 ]; then
        RC_E=3
    else
        RC_E=1
    fi
    # O `passed` do Playwright vem com o tempo entre parênteses (`26 passed (33.2s)`) e o
    # `failed` vem sozinho (`1 failed`) — os DOIS são impressos, porque "26 passed" ao lado de
    # um `[FALHA]` é exatamente o resumo que faz alguém ler verde num portão vermelho.
    N_E_PASS="$(awk '/^########## e2e ::/{f=1;next} /^########## /{f=0} f' "$LOG" \
                  | grep -aoE '[0-9]+ passed \([0-9.]+m?s\)' | tail -1)"
    N_E_FAIL="$(awk '/^########## e2e ::/{f=1;next} /^########## /{f=0} f' "$LOG" \
                  | grep -aoE '^ *[0-9]+ failed' | tail -1 | tr -s ' ')"
    DET_E="${N_E_PASS:-(número não extraído)}${N_E_FAIL:+, $N_E_FAIL}"
    [ "$RC_E" -eq 3 ] && DET_E="ambiente recusou medir — grep '^RECUSA:' no log"
fi
falhou $RC_E
printf '[%-9s] e2e             rc=%s  %s\n' "$(rotulo $RC_E)" "$RC_E" "$DET_E"

# ── 7. o diff, como FORMA e não como conteúdo ──────────────────────────────────────────
# `git diff` sozinho custou ~201k tokens nos 105 subagentes medidos, e quase sempre a
# pergunta era "o que mudou", não "mostre cada linha". `--stat` responde a primeira; quem
# precisar da segunda abre o log.
portao "diff" git --no-pager diff --stat HEAD; RC_D=$?
portao "diff-completo" git --no-pager diff HEAD; :
D_STAT="$(git --no-pager diff --shortstat HEAD 2>/dev/null)"
printf '[%-9s] diff            %s\n' "----" "${D_STAT:-sem mudança não-commitada}"

# O número de portões é CONTADO, não escrito: a versão anterior dizia "6" numa string literal e
# continuaria dizendo 6 depois de `test-frontend` e `e2e` entrarem — um veredito que mente sobre
# quantas coisas ele cobre é a forma mais barata de esconder um portão que caiu.
N_PORTOES=8
case "$PIOR" in
    0) echo "veredito: VERDE — $N_PORTOES portões mediram e passaram";;
    1) echo "veredito: VERMELHO — algum portão mediu e REPROVOU";;
    3) echo "veredito: INDETERMINADO — algum portão RECUSOU medir (rc=3). Não é o mesmo que passar.";;
esac
printf 'saída completa: %s (%s)\n' "$LOG" "$(du -h "$LOG" 2>/dev/null | cut -f1)"
echo 'NÃO leia o log inteiro: grep o que precisar. Ele existe para ficar FORA do contexto.'
exit "$PIOR"
