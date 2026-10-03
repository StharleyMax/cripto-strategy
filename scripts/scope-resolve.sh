#!/usr/bin/env bash
# scope-resolve.sh — turns the diff into WHAT `verify.sh --scope` runs (`T-06.2`, `SPEC-009` plan `06`
# item `6.2`). It runs nothing itself: it prints the selection, one `key=value` per line, and the
# reason for every changed path as a `#` line. `verify.sh --scope` is its only caller; running it by
# hand is how you see why a path pulled what it pulled.
#
# Norm: `docs/context/paineis-de-fluxo/handoff/T-06.1-desenho.md` §2.1–2.5, EXTENDED by
# `[DECISÃO-OWNER: 2026-10-02, escolha entre alternativas apresentadas]` (`handoff/T-06.3-desenho.md`,
# "Verificação por escopo"): "task de front não roda o pytest; task de backend roda só o pytest do
# componente tocado; a suíte inteira com cobertura e piso por camada continua portão da wave".
#
# ── THE RULE THAT GOVERNS EVERY OTHER: fail-closed ───────────────────────────────────────────
# A path no rule recognizes widens the selection to COMPLETE; it never narrows it. An unknown that
# shrinks the set is the gate that depends on someone remembering (`verify.sh` §6, `DR-11`). The
# e2e set is a UNION and always contains `e2e/11` (the pixel spec). `E2E_EXTRA` only ADDS. There is
# no variable that removes a spec — that would be `SKIP_E2E` by another name.
#
# ── OUTPUT ───────────────────────────────────────────────────────────────────────────────────
#   base=<ref> <merge-base sha>
#   e2e=COMPLETO|ESCOPO          e2e_reason=<first path that forced COMPLETO, or empty>
#   e2e_specs=<e2e/NN-….spec.ts …>   e2e_origin=<NN origin · …>   e2e_total=<ls e2e/*.spec.ts>
#   pytest=COMPLETO|ALVO|PULADO  pytest_reason=…   pytest_targets=<paths relative to backend/>
# Exit: 0 resolved · 3 REFUSED (unknown spec in `E2E_EXTRA`, rotten map, no base). Never 1: this
# script measures nothing, so it cannot fail a measurement.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "RECUSA: fora de um repositório git" >&2; exit 3; }
cd "$ROOT" || exit 3
MAP="frontend/e2e/scope-map.tsv"
recusa() { echo "RECUSA: $*" >&2; exit 3; }

# ── the diff: the SAME base `verify.sh` §0 uses (VERIFY_BASE → upstream → origin/master) ──────
# `--no-renames`: a rename has to show BOTH sides — the old path is what the map and the
# importers knew; the default rename detection would hide it.
BASE="${VERIFY_BASE:-$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)}"
git rev-parse --verify -q "${BASE:-x}^{commit}" >/dev/null || BASE=origin/master
MB="$(git merge-base HEAD "$BASE" 2>/dev/null)" || recusa "sem merge-base entre HEAD e $BASE"
CHANGED="$( { git diff --no-renames --name-only "$MB"; git ls-files -o --exclude-standard; } | grep -v '^$' | sort -u)"
echo "base=$BASE $MB"
echo "# caminhos alterados desde a base: $(printf '%s\n' "$CHANGED" | grep -c . || true)"

# ── spec universe and the map, validated on EVERY run ───────────────────────────────────────
mapfile -t ALL_SPECS < <(ls frontend/e2e/[0-9]*.spec.ts 2>/dev/null | sed 's|^frontend/||')
[ "${#ALL_SPECS[@]}" -gt 0 ] || recusa "nenhum spec em frontend/e2e/"
spec_of() { # spec_of NN -> e2e/NN-….spec.ts, exactly one, or refuse (a typo must not become "no spec")
    local n="$1" hits
    [[ "$n" =~ ^[0-9]{2}$ ]] || recusa "número de spec inválido: '$n'"
    hits="$(printf '%s\n' "${ALL_SPECS[@]}" | grep -c "^e2e/$n-")"
    [ "$hits" -eq 1 ] || recusa "spec '$n' casa $hits arquivo(s) em frontend/e2e/ (precisa casar exatamente 1)"
    printf '%s\n' "${ALL_SPECS[@]}" | grep "^e2e/$n-"
}
expand() { # expand "13 20-22 08+" -> one NN per line. It runs inside `$( )`, so it must NOT refuse
           # (an `exit` there leaves only the subshell): the caller checks every NN with `spec_of`.
    local tok a b last
    last="$(printf '%s\n' "${ALL_SPECS[@]}" | sed -E 's|^e2e/([0-9]+)-.*|\1|' | sort -n | tail -1)"
    for tok in $1; do
        case "$tok" in
            *+) a="${tok%+}"   # the first number printed is `a` itself, so the caller's check refuses a missing base
                for ((i=10#$a; i<=10#$last; i++)); do printf '%02d\n' "$i"; done ;;
            *-*) a="${tok%-*}"; b="${tok#*-}"
                 for ((i=10#$a; i<=10#$b; i++)); do printf '%02d\n' "$i"; done ;;
            *) printf '%s\n' "$tok" ;;
        esac
    done
}
[ -f "$MAP" ] || recusa "$MAP ausente — sem o mapa o escopo não sabe o que cada caminho de frontend/src alcança"
declare -A ROW=()            # prefix -> specs
declare -a ROW_ORDER=()
while IFS=$'\t' read -r prefix specs _rest; do
    case "$prefix" in ''|'#'*) continue ;; esac
    [ -n "${specs:-}" ] || recusa "$MAP: linha '$prefix' sem specs"
    if [[ "$prefix" != @rota:* ]] && ! git ls-files -- "frontend/$prefix*" | grep -q .; then
        recusa "$MAP: prefixo '$prefix' não casa nenhum arquivo versionado (mapa podre — renomeie ou apague a linha)"
    fi
    for n in $(expand "$specs"); do spec_of "$n" >/dev/null; done   # refuses on a missing spec
    ROW["$prefix"]="$specs"; ROW_ORDER+=("$prefix")
done < "$MAP"
[ -n "${ROW[@rota:console]:-}" ] && [ -n "${ROW[@rota:symbol]:-}" ] || recusa "$MAP: faltam as linhas @rota:console e @rota:symbol"

# ── selection state ─────────────────────────────────────────────────────────────────────────
declare -A SEL=()            # spec path -> origin label (first one wins)
E2E_FULL=""                  # first path that forced COMPLETE
add_spec() { local s; s="$(spec_of "$1")" || exit 3; [ -n "${SEL[$s]:-}" ] || SEL["$s"]="$2"; }
add_rows() { local n; for n in $(expand "$1"); do add_spec "$n" "$2"; done; }
full_e2e() { [ -n "$E2E_FULL" ] || E2E_FULL="$1"; echo "#   e2e: COMPLETO — $1"; }

declare -A PYT=()            # pytest target (relative to backend/) -> 1
PYT_FULL=""
full_pytest() { [ -n "$PYT_FULL" ] || PYT_FULL="$1"; echo "#   pytest: COMPLETO — $1"; }
add_pytest() { PYT["$1"]=1; echo "#   pytest: $1 — $2"; }

add_spec 11 pixel   # always: the only gate that reads the PAINTED pixel (`DR-11`)

# ── backend: the import closure of the two processes `e2e-env.sh` starts ────────────────────
# DERIVED, not written by hand: import the API entry (`python -m src.main`, `e2e-env.sh:137`) and
# the seed (`e2e-env.sh:29`) and read `sys.modules`. A dynamic import is a hole — the wave's full
# run is the backstop `[INFERRED, T-06.1-desenho §2.2]`. If the probe cannot import (the task broke
# an import), the closure is unknown and every backend path widens to COMPLETE.
CLOSURE=""
CLOSURE_STATE="não calculado"
backend_closure() {
    [ "$CLOSURE_STATE" = "não calculado" ] || return 0
    local tmp
    tmp="$(mktemp -d)"
    if CLOSURE="$(cd backend && INGEST_HEALTH_STORE_PATH="$tmp/ih.sqlite3" QUARANTINE_STORE_PATH="$tmp/q.sqlite3" \
            PYTHONPATH=. .venv/bin/python - 2>/dev/null <<'PY'
import importlib, importlib.util, sys
importlib.import_module("src.main.__main__")
spec = importlib.util.spec_from_file_location("_scope_seed_probe", "scripts/seed_ephemeral_ingest_store.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print("\n".join(sorted(n for n in sys.modules if n == "src" or n.startswith("src."))))
PY
)" && [ -n "$CLOSURE" ]; then
        CLOSURE_STATE="ok"
        echo "# fecho de import da API + seed: $(printf '%s\n' "$CLOSURE" | grep -c .) módulos"
    else
        CLOSURE_STATE="falhou"
        echo "# fecho de import da API + seed: NÃO DERIVADO (o import falhou) — caminho de backend/src vira COMPLETO"
    fi
    rm -rf "$tmp"
}
module_of() { local m="${1#backend/}"; m="${m%.py}"; m="${m%/__init__}"; printf '%s' "${m//\//.}"; }

# backend tests that name a file. Over-approximation on purpose: `compose.yml` is read by
# `tests/main/test_compose_*.py`, `verify.sh` by two tests — a test that reads a file is a test
# that this file can break, and the name is the only trace of it a static rule can see.
tests_naming() {
    local name="$1"
    grep -rlaF --include='test_*.py' -e "$name" backend/tests 2>/dev/null | sed 's|^backend/||'
}
# helpers under backend/tests: follow who names them, until only `test_*.py` remain
declare -A HELPER_SEEN=()
tests_of_helper() {
    local file="$1" stem hit
    stem="$(basename "$file" .py)"
    [ -n "${HELPER_SEEN[$stem]:-}" ] && return 0
    HELPER_SEEN["$stem"]=1
    while read -r hit; do
        [ -n "$hit" ] || continue
        case "$(basename "$hit")" in
            test_*.py) printf '%s\n' "${hit#backend/}" ;;
            *) [ "$hit" != "$file" ] && tests_of_helper "$hit" ;;
        esac
    done < <(grep -rlaFw --include='*.py' -e "$stem" backend/tests 2>/dev/null)
}

# ── one path at a time ──────────────────────────────────────────────────────────────────────
GRAPH_OUT=""
if printf '%s\n' "$CHANGED" | grep -qE '^frontend/(src|e2e)/'; then
    # shellcheck disable=SC2046
    GRAPH_OUT="$(node scripts/scope-graph.mjs $(printf '%s\n' "$CHANGED" | grep -E '^frontend/(src|e2e)/'))" \
        || recusa "scripts/scope-graph.mjs não devolveu o grafo"
fi
graph_line() { printf '%s\n' "$GRAPH_OUT" | awk -F'\t' -v p="$1" '$1==p'; }

while read -r P; do
    [ -n "$P" ] || continue
    echo "# $P"
    EXISTS=0; [ -e "$P" ] && EXISTS=1

    # pytest: every path, wherever it lives, pulls the backend tests that NAME it
    if [ "$EXISTS" -eq 1 ] || [ "${P#backend/}" != "$P" ]; then
        while read -r t; do [ -n "$t" ] && add_pytest "$t" "nomeia $(basename "$P")"; done < <(tests_naming "$(basename "$P")")
    fi

    case "$P" in
        # ── documentation, wherever it lives: never compiled, never served (the backend tests that
        #    read one were already pulled by name above) ──
        *.md)
            echo "#   e2e: só 11 — documento" ;;

        # ── e2e specs and their support files ──
        frontend/e2e/scope-map.tsv)
            echo "#   e2e: só 11 — o mapa é dado do escopo, não código da app" ;;
        frontend/e2e/[0-9]*.spec.ts)
            if [ "$EXISTS" -eq 1 ]; then add_spec "$(basename "$P" | cut -c1-2)" diff
            else echo "#   e2e: spec removido — nada a rodar dele"; fi ;;
        frontend/e2e/*)
            line="$(graph_line "$P")"
            if [ "$EXISTS" -eq 0 ] || [ -z "$line" ]; then full_e2e "suporte de e2e removido ou fora do grafo: $P"
            else
                specs="$(printf '%s' "$line" | cut -f4)"
                if [ -z "$specs" ]; then echo "#   e2e: nenhum spec o importa ou o nomeia"; fi
                for s in ${specs//,/ }; do add_spec "$(basename "$s" | cut -c1-2)" grafo; done
            fi ;;

        # ── app code: the import graph first, the map refines inside the symbol route ──
        frontend/src/*)
            line="$(graph_line "$P")"
            if [ "$EXISTS" -eq 0 ] || [ -z "$line" ]; then
                rows=""
                for pre in "${ROW_ORDER[@]}"; do [[ "$pre" != @rota:* && "${P#frontend/}" == "$pre"* ]] && rows="$rows ${ROW[$pre]}"; done
                if [ -n "$rows" ]; then add_rows "$rows" mapa; else full_e2e "removido e sem linha no mapa: $P"; fi
            else
                entries="$(printf '%s' "$line" | cut -f3)"
                for s in $(printf '%s' "$line" | cut -f4 | tr ',' ' '); do add_spec "$(basename "$s" | cut -c1-2)" grafo; done
                if [ -z "$entries" ]; then
                    echo "#   e2e: nenhuma página da app o importa (teste unitário ou código fora do grafo)"
                else
                    routes=""; other=""
                    for e in ${entries//,/ }; do
                        case "$e" in
                            frontend/src/app/console/*) routes="$routes console" ;;
                            frontend/src/app/symbol/*) routes="$routes symbol" ;;
                            *) other="$e" ;;
                        esac
                    done
                    if [ -n "$other" ]; then
                        full_e2e "alcançado por $other (vale para toda rota): $P"
                    elif [ "$(printf '%s\n' $routes | sort -u | tr -d '\n')" = "symbol" ]; then
                        rows=""
                        for pre in "${ROW_ORDER[@]}"; do [[ "$pre" != @rota:* && "${P#frontend/}" == "$pre"* ]] && rows="$rows ${ROW[$pre]}"; done
                        if [ -n "$rows" ]; then add_rows "$rows" mapa
                        else add_rows "${ROW[@rota:symbol]}" rota; echo "#   e2e: sem linha no mapa ⇒ todos os specs da rota /symbol"; fi
                    else
                        for r in $(printf '%s\n' $routes | sort -u); do add_rows "${ROW[@rota:$r]}" rota; done
                    fi
                fi
            fi ;;

        # ── everything that builds or serves the app, or decides how e2e runs ──
        frontend/*|Makefile|scripts/verify.sh|scripts/e2e-env.sh|scripts/scope-resolve.sh|scripts/scope-graph.mjs)
            full_e2e "constrói/serve a app ou decide como o e2e roda: $P" ;;

        # ── backend ──
        backend/src/*.py)
            backend_closure
            mod="$(module_of "$P")"
            if [ "$CLOSURE_STATE" != ok ]; then full_e2e "fecho de import não derivado: $P"
            elif printf '%s\n' "$CLOSURE" | grep -qxF "$mod"; then full_e2e "no fecho de import da API/seed ($mod)"
            else echo "#   e2e: fora do fecho da API/seed ($mod) — só 11"; fi
            case "$P" in
                backend/src/modules/*/*)
                    comp="$(printf '%s' "$P" | cut -d/ -f4)"
                    if [ -d "backend/tests/$comp" ]; then add_pytest "tests/$comp" "componente $comp"
                    else full_pytest "componente $comp sem backend/tests/$comp"; fi ;;
                backend/src/api/*|backend/src/main/*)
                    add_pytest "tests/api" "componente infra (src/api, src/main)"
                    add_pytest "tests/main" "componente infra (src/api, src/main)" ;;
                *) full_pytest "fora de um componente: $P" ;;
            esac ;;
        backend/scripts/seed_ephemeral_ingest_store.py)
            full_e2e "seed do e2e: $P"; full_pytest "script de infraestrutura do backend: $P" ;;
        backend/tests/conftest.py|backend/tests/__init__.py)
            full_pytest "fixture/pacote de toda a suíte: $P" ;;
        backend/tests/helpers/*)
            n=0
            while read -r t; do [ -n "$t" ] && { add_pytest "$t" "usa o helper $(basename "$P")"; n=$((n+1)); }; done < <(tests_of_helper "$P")
            [ "$n" -gt 0 ] || [ "$EXISTS" -eq 1 ] || full_pytest "helper removido, quem o usava não é mais visível: $P" ;;
        backend/tests/*/test_*.py)
            if [ "$EXISTS" -eq 1 ]; then add_pytest "${P#backend/}" "teste alterado"
            else echo "#   pytest: teste removido"; fi ;;
        backend/tests/*/*)
            add_pytest "$(printf '%s' "$P" | cut -d/ -f2-3)" "suporte do diretório de teste" ;;
        backend/scripts/*)
            # scripts/test.sh, check-coverage-layers.sh, nonet/ — the gate machinery itself
            full_pytest "maquinário de teste/lint do backend: $P" ;;
        backend/*)
            full_e2e "dependência/configuração do backend: $P"; full_pytest "dependência/configuração do backend: $P" ;;

        # ── what neither the app nor the e2e reads (the non-e2e gates cover it) ──
        docs/*|deploy/*|.harness/*|harness.toml|.claude/*|scripts/hooks/*|scripts/claude-hooks/*|scripts/install-*.sh|scripts/wt.sh|.gitignore|corpus/*|data/*)
            echo "#   e2e: só 11" ;;

        # fail-closed on BOTH sides: an unknown path can feed the app, the e2e or the backend suite
        *) full_e2e "caminho sem regra (fail-closed): $P"; full_pytest "caminho sem regra (fail-closed): $P" ;;
    esac
done <<< "$CHANGED"

# ── E2E_EXTRA: only adds ────────────────────────────────────────────────────────────────────
for n in ${E2E_EXTRA:-}; do add_spec "$n" extra; done

# ── print ───────────────────────────────────────────────────────────────────────────────────
echo "e2e_total=${#ALL_SPECS[@]}"
if [ -n "$E2E_FULL" ]; then
    echo "e2e=COMPLETO"; echo "e2e_reason=$E2E_FULL"
    echo "e2e_specs="; echo "e2e_origin="
else
    mapfile -t KEYS < <(printf '%s\n' "${!SEL[@]}" | sort)
    echo "e2e=ESCOPO"; echo "e2e_reason="
    echo "e2e_specs=${KEYS[*]}"
    origin=""
    for k in "${KEYS[@]}"; do origin="$origin · $(basename "$k" | cut -c1-2) ${SEL[$k]}"; done
    echo "e2e_origin=${origin# · }"
fi
if [ -n "$PYT_FULL" ]; then
    echo "pytest=COMPLETO"; echo "pytest_reason=$PYT_FULL"; echo "pytest_targets="
elif [ "${#PYT[@]}" -eq 0 ]; then
    echo "pytest=PULADO"; echo "pytest_reason=nenhum caminho do diff alcança o pytest"; echo "pytest_targets="
else
    # a directory swallows the files under it: pytest would collect them twice otherwise
    mapfile -t T < <(printf '%s\n' "${!PYT[@]}" | sort)
    keep=()
    for t in "${T[@]}"; do
        covered=0
        for d in "${T[@]}"; do [ "$d" != "$t" ] && [[ "$t" == "$d/"* ]] && covered=1; done
        [ "$covered" -eq 0 ] && keep+=("$t")
    done
    echo "pytest=ALVO"; echo "pytest_reason="; echo "pytest_targets=${keep[*]}"
fi
exit 0
