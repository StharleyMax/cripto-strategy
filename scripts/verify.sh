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
# ── DOIS MODOS, e eles não se confundem (`T-06.2`, `SPEC-009` plano `06` item `6.2`) ─────────
#
#   bash scripts/verify.sh           o PORTÃO DA WAVE. Tudo, sempre: os oito portões inteiros, o
#                                    pytest com cobertura e piso por camada, e o e2e COMPLETO
#                                    (`E2E_SPECS=` vai na linha de comando do `make`, que vence o
#                                    ambiente). Veredito `VERDE — … e2e COMPLETO N/M specs`, e só
#                                    ele grava o cache da árvore.
#   bash scripts/verify.sh --scope   o LAÇO DO BUILDER (`make verify-scope`). `scripts/scope-resolve.sh`
#                                    lê o diff e decide: o pytest só do componente tocado (front não
#                                    roda pytest) — `[DECISÃO-OWNER: 2026-10-02, escolha entre
#                                    alternativas apresentadas]` —, e o e2e só dos specs que o diff
#                                    alcança, mais `e2e/11` (pixel) sempre e `E2E_EXTRA` (só soma).
#                                    lint ×2, test-frontend, boundaries, regras e validate rodam
#                                    inteiros. Veredito `VERDE-ESCOPO`, que NUNCA grava o cache:
#                                    sem isso, o `make verify` da wave sobre a mesma árvore limpa
#                                    responderia `VERDE (cache da árvore)` de uma rodada por escopo.
#                                    Escopo que resolve COMPLETO nos dois (e2e e pytest) É o completo:
#                                    imprime e grava como tal.
#
# ⛔ O escopo NÃO é `SKIP_E2E` (ver §6): o conjunto de e2e é sempre ⊇ {e2e/11}, e não existe variável
# que tire spec dele. O rc é 0/1/3 nos dois modos — a diferença mora na PALAVRA do veredito, no
# `N/M` e no cache, nunca no rc.
#
# Sem `set -e`: preciso do `rc` de CADA portão. Morrer no primeiro esconderia os outros —
# o mesmo argumento que o `pre-push` do plugin já faz.
set -uo pipefail

MODO=completo
case "${1:-}" in
    "") ;;
    --scope) MODO=escopo ;;
    *) echo "RECUSA: argumento desconhecido '$1' (uso: verify.sh [--scope])" >&2; exit 3 ;;
esac

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

# Segundos de relógio por portão (`T-06.2`, desenho §2.4 item 5): é o instrumento do DoD 2
# ("escopo ≤ 1/3 do completo"). Antes dele, o tempo de um verify só saía de `mtime − início`.
seg() { printf '%ss' "$(( SECONDS - $1 ))"; }

if [ "$MODO" = escopo ]; then
    echo "=== verify --scope · $(basename "$ROOT") · $TS (UTC) ==="
else
    echo "=== verify · $(basename "$ROOT") · $TS (UTC) ==="
fi

# ── 0. só mede o que precisa ser medido ───────────────────────────────────────────────
# Dois atalhos, e `VERIFY_FORCE=1` desliga os dois. `[MEDIDO 2026-09-26, sessão 6624939a]`: o
# mesmo verify rodava 3–4× por task (builder, integrador, QA, code-review) sobre a MESMA árvore,
# e também sobre diffs só de docs — a 8,5–15 min cada, acima do teto de 600 s do Bash.
#
# (a) CACHE POR ÁRVORE. Um verde completo sobre árvore limpa grava `HEAD^{tree}` no diretório
#     comum do git, que todas as worktrees compartilham. A mesma árvore limpa, depois, devolve
#     esse veredito sem medir de novo. Só VERDE entra: vermelho e "não mediu" sempre remedem.
# (b) DOCS-ONLY. Se TODO caminho alterado desde a base é documento, código nenhum mudou e os
#     portões de código mediriam a base de novo. Continuam rodando só os que LEEM documento:
#     `regras`, `validate` e a varredura da chave da Coinalyze, que percorre todo `git ls-files`
#     (`test_coinalyze_key_never_versioned.py`) — uma chave colada em `docs/` é exatamente o
#     vazamento que ela existe para pegar.
#     A allowlist é por caminho, não por `harness code-paths classify`: aquele classifica como
#     não-produção arquivos que quebram portão (`e2e/*.spec.ts`, `Makefile`, `package.json`,
#     `harness.toml`), e pular por ele seria pular o portão que eles alimentam.
VERIFY_CACHE_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/verify-cache"
TREE="$(git rev-parse 'HEAD^{tree}' 2>/dev/null)"
SUJO="$(git status --porcelain --untracked-files=normal 2>/dev/null)"
if [ "${VERIFY_FORCE:-0}" != 1 ]; then
    if [ -z "$SUJO" ] && [ -n "$TREE" ] && [ -f "$VERIFY_CACHE_DIR/$TREE" ]; then
        printf '[%-9s] árvore %s já mediu VERDE: %s\n' "CACHE" "${TREE:0:12}" "$(cat "$VERIFY_CACHE_DIR/$TREE")"
        echo "veredito: VERDE (cache da árvore) — VERIFY_FORCE=1 mede de novo"
        exit 0
    fi

    BASE="${VERIFY_BASE:-$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)}"
    git rev-parse --verify -q "${BASE:-x}^{commit}" >/dev/null || BASE=origin/master
    MB="$(git merge-base HEAD "$BASE" 2>/dev/null)"
    MUDOU="$( { [ -n "$MB" ] && git diff --name-only "$MB"; git ls-files -o --exclude-standard; } | sort -u)"
    NAO_DOC="$(printf '%s\n' "$MUDOU" | grep -v '^$' | grep -vE '^docs/' \
        | grep -vE '^[^/]+\.md$|^(corpus|data|\.claude)/.*\.md$' || true)"
    if [ -n "$MB" ] && [ -n "$MUDOU" ] && [ -z "$NAO_DOC" ]; then
        N_DOC="$(printf '%s\n' "$MUDOU" | grep -vc '^$')"
        printf '[%-9s] docs-only desde %s: %s arquivo(s) — portões de código não rodam\n' "PULADO" "$BASE" "$N_DOC"
        printf '%s\n' "$MUDOU" | head -10 | sed 's/^/            /'
        portao "regras" bash .harness/mechanism rules --mode sweep --surface git-hook; RC_R=$?; falhou $RC_R
        printf '[%-9s] regras          rc=%s\n' "$(rotulo $RC_R)" "$RC_R"
        portao "validate" bash .harness/mechanism validate --strict; RC_V=$?; falhou $RC_V
        printf '[%-9s] política        rc=%s\n' "$(rotulo $RC_V)" "$RC_V"
        portao "chave-coinalyze" bash backend/scripts/test-fast.sh -k coinalyze_key_never_versioned; RC_K=$?; falhou $RC_K
        printf '[%-9s] chave-coinalyze rc=%s  varredura de todo git ls-files\n' "$(rotulo $RC_K)" "$RC_K"
        case "$PIOR" in
            0) echo "veredito: VERDE (docs-only) — 3 portões de documento mediram e passaram";;
            1) echo "veredito: VERMELHO — algum portão de documento REPROVOU";;
            3) echo "veredito: INDETERMINADO — algum portão RECUSOU medir (rc=3).";;
        esac
        printf 'saída completa: %s\n' "$LOG"
        exit "$PIOR"
    fi
fi

# ── 0b. escopo: o diff decide o pytest e o e2e (só em --scope) ────────────────────────
# O completo NÃO chama o resolvedor: o portão da wave não depende de nenhuma regra de escopo.
# `COMPLETO_DE_FATO=1` quando o modo é completo OU quando o escopo resolveu COMPLETO nos dois —
# só então o veredito diz `VERDE —` e o cache é gravado.
COMPLETO_DE_FATO=1
ESC_E2E=COMPLETO; ESC_SPECS=""; ESC_ORIGEM=""; ESC_PYT=COMPLETO; ESC_ALVOS=""
if [ "$MODO" = escopo ]; then
    { echo; echo "########## escopo :: bash scripts/scope-resolve.sh ##########"; } >> "$LOG"
    ESC_OUT="$(bash scripts/scope-resolve.sh 2>&1)"; RC_ESC=$?
    printf '%s\n' "$ESC_OUT" >> "$LOG"
    if [ "$RC_ESC" -ne 0 ]; then
        printf '%s\n' "$ESC_OUT" | grep -a '^RECUSA' | head -3
        echo "veredito: INDETERMINADO (escopo) — o escopo RECUSOU resolver (rc=$RC_ESC). Não é o mesmo que passar."
        printf 'saída completa: %s\n' "$LOG"
        exit 3
    fi
    chave() { printf '%s\n' "$ESC_OUT" | grep -a "^$1=" | head -1 | cut -d= -f2-; }
    ESC_E2E="$(chave e2e)"; ESC_SPECS="$(chave e2e_specs)"; ESC_ORIGEM="$(chave e2e_origin)"
    ESC_PYT="$(chave pytest)"; ESC_ALVOS="$(chave pytest_targets)"
    case "$ESC_E2E:$ESC_PYT" in
        COMPLETO:COMPLETO) COMPLETO_DE_FATO=1 ;;
        ESCOPO:*|COMPLETO:ALVO|COMPLETO:PULADO) COMPLETO_DE_FATO=0 ;;
        *) echo "veredito: INDETERMINADO (escopo) — saída do resolvedor sem e2e=/pytest= reconhecíveis (e2e='$ESC_E2E' pytest='$ESC_PYT')"
           printf 'saída completa: %s\n' "$LOG"; exit 3 ;;
    esac
    printf '[%-9s] base %s · e2e %s%s · pytest %s%s\n' "ESCOPO" "$(chave base | cut -c1-40)" "$ESC_E2E" \
        "$([ "$ESC_E2E" = COMPLETO ] && printf ' (%s)' "$(chave e2e_reason | cut -c1-90)" || printf ' %s/%s specs' "$(printf '%s\n' $ESC_SPECS | grep -c .)" "$(chave e2e_total)")" \
        "$ESC_PYT" "$([ "$ESC_PYT" = ALVO ] && printf ' %s alvo(s)' "$(printf '%s\n' $ESC_ALVOS | grep -c .)" || { [ "$ESC_PYT" = COMPLETO ] && printf ' (%s)' "$(chave pytest_reason | cut -c1-70)"; })"
fi

# ── 1. lint ────────────────────────────────────────────────────────────────────────────
T0=$SECONDS
portao "lint-backend" bash backend/scripts/lint.sh; RC_LB=$?; falhou $RC_LB
N_LB="$(extrai '[0-9]+ source files')"
printf '[%-9s] lint-backend    rc=%s  %s · %s\n' "$(rotulo $RC_LB)" "$RC_LB" "${N_LB:-(número não extraído)}" "$(seg $T0)"

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
T0=$SECONDS
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
printf '[%-9s] lint-frontend   rc=%s  %s · %s\n' "$(rotulo $RC_LF)" "$RC_LF" "$DET_LF" "$(seg $T0)"

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
T0=$SECONDS
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
        #
        # ⚠️⚠️ E NÃO ANCORA O SUFIXO TAMPOUCO, pela MESMA classe de erro, encontrada de novo em
        # 2026-09-16: a linha do `node --test` termina no reset ANSI, não no dígito —
        # `\033[34mℹ pass 200\033[39m` — então `/ pass [0-9]+$/` NUNCA casa e o resumo imprime
        # `0 pass, 0 fail` com as suítes VERDES ao lado. `[MEDIDO 2026-09-16 sobre
        # verify-cripto-strategy-20260916T204716Z.log: padrão ancorado -> 0 pass; mesmo log
        # com o ANSI removido antes do casamento -> 689 pass, 0 fail]`. Consertar o prefixo e
        # deixar o sufixo é por que a classe voltou: o remédio é remover a decoração ANTES de
        # casar, não caçar um `$` de cada vez.
        #
        # E o resumo carrega o PRÓPRIO falsificador: `0 pass, 0 fail` com seção `test-frontend-*`
        # presente no log é indistinguível entre "nenhum teste" e "o awk cegou de novo"
        # (`ADR-012`), então essa combinação grita em vez de imprimir um zero silencioso.
        DET_TF="$(awk '/^########## test-frontend-/{f=1;seen=1;next} /^########## /{f=0}
                       f{ s=$0; gsub(/\033\[[0-9;]*m/,"",s)
                          if (s ~ / pass [0-9]+$/) { n=split(s,a," "); p+=a[n] }
                          if (s ~ / fail [0-9]+$/) { n=split(s,a," "); q+=a[n] } }
                       END{ if (seen && p==0 && q==0)
                                printf "⚠ RESUMO CEGO: 0 pass, 0 fail com seção test-frontend no log — número não confiável (rc acima é que vale)"
                            else
                                printf "%d pass, %d fail em 4 suítes (app/charts/s1/s3)", p, q }' "$LOG")"
    fi
fi
falhou $RC_TF
printf '[%-9s] test-frontend   rc=%s  %s · %s\n' "$(rotulo $RC_TF)" "$RC_TF" "$DET_TF" "$(seg $T0)"

# ── 2. suíte + piso de cobertura por camada ────────────────────────────────────────────
# `R-G` (`docs/plans/SPEC-004-captura-em-producao/index.md`): "verificação é `make verify`
# … testes de processo real declarados por fase fora de `verify` até o owner decidir". O
# `-m 'not process_real'` abaixo É essa exclusão — sem ela o teste marcado roda dentro deste
# portão por padrão, que foi o `[BLOCKER]` que o `/review` de `T-01.7` achou (a alegação de
# "fora de verify" no plano/commit não tinha mecanismo real). Reverter (trazer para dentro do
# portão) custa a linha abaixo (`tasks_review.md` §8) — ato do owner: apague o `-m …`.
#
# EM --scope (`T-06.2`, `[DECISÃO-OWNER: 2026-10-02]`): `ALVO` roda `backend/scripts/test-scope.sh`
# sobre os alvos que o resolvedor derivou — sem cobertura e sem piso, porque um piso medido sobre
# parte da suíte é piso de nada; `PULADO` (diff sem caminho que alcance o pytest) não roda nada.
# Nos dois, a varredura da chave da Coinalyze roda à parte, como no docs-only: ela percorre todo
# `git ls-files`, e o diff de QUALQUER componente pode colar a chave.
T0=$SECONDS
case "$ESC_PYT" in
    COMPLETO)
        portao "test" bash backend/scripts/test.sh -m "not process_real"; RC_T=$?; falhou $RC_T
        N_T="$(extrai '[0-9]+ (passed|failed)')"
        N_C="$(extrai 'Total coverage: [0-9.]+%')"
        printf '[%-9s] test            rc=%s  %s · %s · %s\n' "$(rotulo $RC_T)" "$RC_T" "${N_T:-(n não extraído)}" "${N_C:-(cobertura não extraída)}" "$(seg $T0)"
        ;;
    ALVO)
        # shellcheck disable=SC2086  # alvos derivados, um por palavra, sem espaço (caminhos de tests/)
        portao "test" bash backend/scripts/test-scope.sh -m "not process_real" $ESC_ALVOS; RC_T=$?
        # rc=5 do pytest = "nenhum teste coletado": os alvos existem e não têm teste fora de
        # `process_real`. Não há o que medir — e isso vai escrito, não vira FALHA nem OK mudo.
        DET_T5=""; [ "$RC_T" -eq 5 ] && { RC_T=0; DET_T5=" (nenhum teste coletado nos alvos)"; }
        falhou $RC_T
        N_T="$(extrai '[0-9]+ (passed|failed)')"
        printf '[%-9s] test            rc=%s  ALVO %s: %s%s · sem cobertura e sem piso (portão da wave) · %s\n' "$(rotulo $RC_T)" "$RC_T" \
            "$(printf '%s\n' $ESC_ALVOS | sed 's|^tests/||' | head -4 | tr '\n' ' ' | sed 's/ $//')$([ "$(printf '%s\n' $ESC_ALVOS | grep -c .)" -gt 4 ] && printf ' …')" \
            "${N_T:-(n não extraído)}" "$DET_T5" "$(seg $T0)"
        ;;
    PULADO)
        printf '[%-9s] test            nenhum caminho do diff alcança o pytest (diff de front) — DECISÃO-OWNER 2026-10-02\n' "PULADO"
        ;;
esac
if [ "$ESC_PYT" != COMPLETO ]; then
    T0=$SECONDS
    portao "chave-coinalyze" bash backend/scripts/test-fast.sh -k coinalyze_key_never_versioned; RC_K=$?; falhou $RC_K
    printf '[%-9s] chave-coinalyze rc=%s  varredura de todo git ls-files · %s\n' "$(rotulo $RC_K)" "$RC_K" "$(seg $T0)"
fi

# ── 3. fronteira de módulo ─────────────────────────────────────────────────────────────
T0=$SECONDS
portao "boundaries" bash backend/scripts/boundaries.sh; RC_B=$?; falhou $RC_B
N_B="$(extrai '[0-9]+ kept, [0-9]+ broken')"
printf '[%-9s] boundaries      rc=%s  %s · %s\n' "$(rotulo $RC_B)" "$RC_B" "${N_B:-(número não extraído)}" "$(seg $T0)"

# ── 4. regras em vigor, na mesma superfície do git-hook ────────────────────────────────
# `--surface git-hook` e não o default: é a superfície que o `pre-push` usa, e medir noutra
# responderia uma pergunta diferente daquela que vai reprovar o push.
T0=$SECONDS
portao "regras" bash .harness/mechanism rules --mode sweep --surface git-hook; RC_R=$?; falhou $RC_R
# Conta DENTRO da seção de regras, nunca no log inteiro: `[AVISO]`/`[BLOQUEIO]` numa saída
# anterior (pytest, eslint) inflaria o número, e este script existe para não mentir número.
secao() { awk -v m="########## $1 ::" 'index($0,m){f=1;next} /^########## /{f=0} f' "$LOG"; }
N_BLQ="$(secao regras | grep -ac '\[BLOQUEIO\]' || true)"
N_AVI="$(secao regras | grep -ac '\[AVISO\]' || true)"
printf '[%-9s] regras          rc=%s  %s bloqueio(s), %s aviso(s) · %s\n' "$(rotulo $RC_R)" "$RC_R" "${N_BLQ:-?}" "${N_AVI:-?}" "$(seg $T0)"

# ── 5. política e instalação ───────────────────────────────────────────────────────────
T0=$SECONDS
portao "validate" bash .harness/mechanism validate --strict; RC_V=$?; falhou $RC_V
printf '[%-9s] política        rc=%s · %s\n' "$(rotulo $RC_V)" "$RC_V" "$(seg $T0)"

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
#
# `T-06.2`: o completo passa `E2E_SPECS=` na LINHA DE COMANDO do `make` (vence o ambiente: um
# `E2E_SPECS` exportado no shell não encolhe o portão da wave), e conta os specs que o reporter
# NOMEOU contra `ls frontend/e2e/*.spec.ts`. `N < M` com Playwright verde NÃO é VERDE (rc=1): é a
# prova de que o completo rodou completo, e não só de que o que rodou passou. No escopo, a mesma
# conta é contra os specs selecionados.
E2E_M="$(ls frontend/e2e/*.spec.ts 2>/dev/null | wc -l)"
if [ "$ESC_E2E" = ESCOPO ]; then
    E2E_ESPERADO="$(printf '%s\n' $ESC_SPECS | grep -c .)"
else
    E2E_ESPERADO="$E2E_M"
fi
T0=$SECONDS
if [ ! -d frontend/node_modules ] || [ ! -x backend/.venv/bin/python ]; then
    { echo; echo "########## e2e :: RECUSA (frontend/node_modules ou backend/.venv ausente) ##########"; } >> "$LOG"
    RC_E=3; DET_E="frontend/node_modules ou backend/.venv ausente — rode 'make setup'"
else
    if [ "$ESC_E2E" = ESCOPO ]; then
        portao "e2e" make e2e E2E_SPECS="$ESC_SPECS"; RC_MAKE_E2E=$?
    else
        portao "e2e" make e2e E2E_SPECS=; RC_MAKE_E2E=$?
    fi
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
    # ⚠️ 2026-09-16 — TERCEIRA ocorrência da mesma classe neste arquivo (ver o bloco de
    # `test-frontend`): o Playwright escreve `40 passed\033[39m\033[2m (3.2s)`, com a decoração
    # ENTRE o `passed` e o parêntese, então o padrão acima nunca casava e o portão imprimia
    # `(número não extraído)` com 40 testes verdes no log. Honesto, mas cego — e um portão que
    # não sabe dizer quantos mediu é o `rc=0` indistinguível de `ADR-012`. Remover o ANSI ANTES
    # de casar é o remédio da classe inteira; caçar `$` e parêntese um a um é o que a repetiu 3×.
    # O `sed` vai INLINE nas duas, e não numa variável: comando guardado em variável depende de
    # word splitting, que o `bash` deste script faz e o `zsh` do operador NÃO — a versão em
    # variável passa aqui e morre na mão de quem copiar a linha para o terminal.
    N_E_PASS="$(awk '/^########## e2e ::/{f=1;next} /^########## /{f=0} f' "$LOG" \
                  | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g' \
                  | grep -aoE '[0-9]+ passed( \([0-9.]+m?s\))?' | tail -1)"
    N_E_FAIL="$(awk '/^########## e2e ::/{f=1;next} /^########## /{f=0} f' "$LOG" \
                  | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g' \
                  | grep -aoE '^ *[0-9]+ failed' | tail -1 | tr -s ' ')"
    DET_E="${N_E_PASS:-(número não extraído)}${N_E_FAIL:+, $N_E_FAIL}"
    # Specs que o reporter `list` NOMEOU (`[chromium] › frontend/e2e/NN-….spec.ts:…`), únicos.
    E2E_N="$(awk '/^########## e2e ::/{f=1;next} /^########## /{f=0} f' "$LOG" \
               | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g' \
               | grep -aoE '› (frontend/)?e2e/[0-9]+-[^ :]+\.spec\.ts' | sort -u | wc -l)"
    if [ "$ESC_E2E" = ESCOPO ]; then
        DET_E="$DET_E · ESCOPO $E2E_N/$E2E_M specs ($ESC_ORIGEM)"
    else
        DET_E="$DET_E · COMPLETO $E2E_N/$E2E_M specs"
    fi
    if [ "$RC_E" -eq 0 ] && [ "$E2E_N" -lt "$E2E_ESPERADO" ]; then
        RC_E=1
        DET_E="$DET_E — rodou $E2E_N de $E2E_ESPERADO specs esperados: NÃO é verde"
    fi
    [ "$RC_E" -eq 3 ] && DET_E="ambiente recusou medir — grep '^RECUSA:' no log"
fi
falhou $RC_E
printf '[%-9s] e2e             rc=%s  %s · %s\n' "$(rotulo $RC_E)" "$RC_E" "$DET_E" "$(seg $T0)"

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
# `T-06.2`: duas PALAVRAS, e `grep '^veredito: VERDE —'` não casa a do escopo. A do escopo diz o que
# NÃO rodou inteiro, para que ninguém a cite como portão.
if [ "$COMPLETO_DE_FATO" -eq 1 ]; then
    case "$PIOR" in
        0) echo "veredito: VERDE — $N_PORTOES portões mediram e passaram · e2e COMPLETO ${E2E_N:-?}/$E2E_M specs";;
        1) echo "veredito: VERMELHO — algum portão mediu e REPROVOU";;
        3) echo "veredito: INDETERMINADO — algum portão RECUSOU medir (rc=3). Não é o mesmo que passar.";;
    esac
else
    case "$ESC_PYT" in
        ALVO) D_PYT="pytest só de $(printf '%s\n' $ESC_ALVOS | grep -c .) alvo(s), sem cobertura nem piso" ;;
        PULADO) D_PYT="pytest PULADO (diff de front)" ;;
        *) D_PYT="pytest completo com piso" ;;
    esac
    if [ "$ESC_E2E" = ESCOPO ]; then D_E2E="e2e em ${E2E_N:-?}/$E2E_M specs ($ESC_ORIGEM)"; else D_E2E="e2e COMPLETO ${E2E_N:-?}/$E2E_M specs"; fi
    case "$PIOR" in
        0) echo "veredito: VERDE-ESCOPO — lint ×2, test-frontend, boundaries, regras e validate inteiros · $D_PYT · $D_E2E — NÃO é o verde da wave";;
        1) echo "veredito: VERMELHO (escopo) — algum portão mediu e REPROVOU";;
        3) echo "veredito: INDETERMINADO (escopo) — algum portão RECUSOU medir (rc=3). Não é o mesmo que passar.";;
    esac
fi
printf 'duração: %ss · saída completa: %s (%s)\n' "$SECONDS" "$LOG" "$(du -h "$LOG" 2>/dev/null | cut -f1)"
echo 'NÃO leia o log inteiro: grep o que precisar. Ele existe para ficar FORA do contexto.'
# Grava o cache (seção 0a) só com árvore limpa e VERDE — a árvore medida é a que o SHA nomeia.
# ⛔ E SÓ DO COMPLETO (`T-06.2`): um VERDE-ESCOPO gravado aqui faria o `make verify` da wave sobre a
# mesma árvore responder do cache sem ter rodado o e2e completo nem o pytest com piso.
if [ "$PIOR" -eq 0 ] && [ "$COMPLETO_DE_FATO" -eq 1 ] && [ -z "$SUJO" ] && [ -n "$TREE" ] && mkdir -p "$VERIFY_CACHE_DIR" 2>/dev/null; then
    printf '%s · %s\n' "$TS" "$LOG" > "$VERIFY_CACHE_DIR/$TREE"
fi
exit "$PIOR"
