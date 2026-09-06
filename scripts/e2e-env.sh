#!/usr/bin/env bash
# e2e-env.sh — sobe/derruba o ambiente de `make e2e` (`T-01.8`, `SPEC-003` s3.5).
#
# `Makefile` chama ESTE script para o SETUP e o TEARDOWN; o `playwright test` em si fica NA
# RECEITA do Makefile, visivel a olho nu (`make -n e2e` tem de imprimir o comando literal —
# DoD de `T-01.8`), porque ele e quem decide o `rc` do alvo. Este arquivo nunca chama
# playwright — a mesma separacao que `ADR-011/D2` ja aplica entre `Makefile` e os `.sh`: o
# Makefile nao absorve, e aqui o que nao e absorvido e o proprio executor do teste.
#
# DOIS SUBCOMANDOS:
#   up   <api_up:0|1> <api_port> <next_port>   -> imprime o STATE_DIR em stdout, e SO ISSO;
#                                                  todo o resto vai para stderr. rc=0 pronto,
#                                                  rc=3 RECUSA (ambiente ausente ou nao subiu).
#   down <state_dir>                            -> mata os processos registrados e apaga o
#                                                  STATE_DIR. Best-effort: nao propaga falha de
#                                                  teardown como veredito de teste — quem chama
#                                                  ja capturou o rc do Playwright antes.
#
# OS DOIS MODOS DE `D1.11` (API de pe / API deliberadamente no chao): `api_up=1` sobe o
# `uvicorn` sobre o store efemero; `api_up=0` NAO o sobe — o `next start` fica de pe do mesmo
# jeito, apontando para uma porta sem ninguem escutando, e e ISSO que faz "no chao" ser um
# estado real (connection refused), nao um mock.
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$RAIZ/backend"
FRONTEND="$RAIZ/frontend"
PY="$BACKEND/.venv/bin/python"
SEED="backend/scripts/seed_ephemeral_ingest_store.py"

_TIMEOUT_BUILD_S=180
_TIMEOUT_READY_S=45
_POLL_S=0.3

_log() { printf '%s\n' "$*" >&2; }

_http_code() { # _http_code <url> -> codigo HTTP, ou "000" se a conexao falhar
    # NAO usar `cmd || printf '000'` aqui: o curl moderno já imprime "000" via `-w` quando a
    # conexão falha E ainda sai com rc != 0 — as duas coisas juntas dobrariam a saída para
    # "000000" [MEDIDO: `curl -s -o /dev/null -w '%{http_code}' <porta fechada>` -> stdout
    # "000", rc=7; com `|| printf '000'` o resultado capturado vira "000000"].
    local saida
    saida="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$1" 2>/dev/null)"
    printf '%s' "${saida:-000}"
}

_espera() { # _espera <url> <rotulo> -> rc=0 quando responder (qualquer codigo != 000), rc=1 no timeout
    local url="$1" rotulo="$2" decorrido=0
    while :; do
        codigo="$(_http_code "$url")"
        if [ "$codigo" != "000" ]; then
            _log "pronto: $rotulo respondeu $codigo em ${decorrido}s ($url)"
            return 0
        fi
        sleep "$_POLL_S"
        decorrido=$(awk -v a="$decorrido" -v p="$_POLL_S" 'BEGIN{printf "%.1f", a+p}')
        if awk -v a="$decorrido" -v t="$_TIMEOUT_READY_S" 'BEGIN{exit !(a>=t)}'; then
            _log "RECUSA: $rotulo nao respondeu em ${_TIMEOUT_READY_S}s ($url)"
            return 1
        fi
    done
}

_porta_livre() { # _porta_livre <porta> -> rc=0 se NADA esta escutando
    [ "$(_http_code "http://127.0.0.1:$1/")" = "000" ]
}

cmd_up() {
    local api_up="${1:?api_up}" api_port="${2:?api_port}" next_port="${3:?next_port}"

    if [ ! -x "$PY" ]; then
        _log "RECUSA: $PY nao existe. Rode 'make setup' (precisa de rede)."
        return 3
    fi
    if [ ! -d "$FRONTEND/node_modules" ]; then
        _log "RECUSA: $FRONTEND/node_modules ausente. Rode 'make setup' (precisa de rede)."
        return 3
    fi
    if [ ! -x "$FRONTEND/node_modules/.bin/next" ]; then
        _log "RECUSA: $FRONTEND/node_modules/.bin/next ausente — node_modules incompleto."
        return 3
    fi
    if [ ! -x "$FRONTEND/node_modules/.bin/playwright" ]; then
        _log "RECUSA: $FRONTEND/node_modules/.bin/playwright ausente. Rode 'make setup'."
        return 3
    fi

    local state_dir
    state_dir="$(mktemp -d "${TMPDIR:-/tmp}/cripto-strategy-e2e.XXXXXX")" || {
        _log "RECUSA: nao consegui criar diretorio efemero (mktemp -d)."
        return 3
    }
    local store_path="$state_dir/ingest_health.sqlite3"

    # ── seed do store efemero (>= 1 run, G >= 0 gaps) — nunca le backend/data/ ──────────
    # `PYTHONPATH="$BACKEND"`: o script mora em `backend/scripts/` (fora do pacote `src`), e
    # invocado por CAMINHO ABSOLUTO o Python poe o DIRETORIO DO SCRIPT em `sys.path[0]`, nao o
    # cwd — sem isto, `from src.modules...` falha com `ModuleNotFoundError` mesmo com `cd`.
    if ! ( cd "$BACKEND" && PYTHONPATH="$BACKEND" "$PY" "$RAIZ/$SEED" "$store_path" ) >>"$state_dir/seed.log" 2>&1; then
        _log "RECUSA: seed do store efemero falhou — ver $state_dir/seed.log"
        cat "$state_dir/seed.log" >&2
        rm -rf "$state_dir"
        return 3
    fi

    # ── API de teste (modo D1.11 "de pe") ────────────────────────────────────────────────
    local api_pid=""
    if [ "$api_up" = "1" ]; then
        if ! _porta_livre "$api_port"; then
            _log "RECUSA: porta $api_port (API) ja tem algo escutando — escolha outra via E2E_API_PORT."
            rm -rf "$state_dir"
            return 3
        fi
        ( cd "$BACKEND" && INGEST_HEALTH_STORE_PATH="$store_path" APP_PORT="$api_port" \
            exec "$PY" -m src.main ) >>"$state_dir/api.log" 2>&1 &
        api_pid=$!
        echo "$api_pid" >"$state_dir/api.pid"
        if ! _espera "http://127.0.0.1:$api_port/ingest-health" "API de teste"; then
            cat "$state_dir/api.log" >&2
            cmd_down "$state_dir" >/dev/null 2>&1
            return 3
        fi
    else
        if ! _porta_livre "$api_port"; then
            _log "RECUSA: modo 'API no chao' pede a porta $api_port LIVRE, e ela nao esta."
            rm -rf "$state_dir"
            return 3
        fi
        _log "modo D1.11: API deliberadamente NO CHAO — porta $api_port fica sem listener."
    fi

    # ── next build + next start (a app SOBE sempre, com API de pe ou no chao) ───────────
    if ! ( cd "$FRONTEND" && INGEST_HEALTH_API_BASE_URL="http://127.0.0.1:$api_port" \
            timeout "$_TIMEOUT_BUILD_S" node_modules/.bin/next build ) >>"$state_dir/next-build.log" 2>&1
    then
        _log "RECUSA: 'next build' falhou — ver $state_dir/next-build.log"
        tail -n 40 "$state_dir/next-build.log" >&2
        [ -n "$api_pid" ] && kill "$api_pid" 2>/dev/null
        rm -rf "$state_dir"
        return 3
    fi

    ( cd "$FRONTEND" && INGEST_HEALTH_API_BASE_URL="http://127.0.0.1:$api_port" \
        exec node_modules/.bin/next start -p "$next_port" ) >>"$state_dir/next.log" 2>&1 &
    local next_pid=$!
    echo "$next_pid" >"$state_dir/next.pid"
    if ! _espera "http://127.0.0.1:$next_port/" "next start"; then
        cat "$state_dir/next.log" >&2
        cmd_down "$state_dir" >/dev/null 2>&1
        return 3
    fi

    printf 'http://127.0.0.1:%s\n' "$next_port" >"$state_dir/base_url"
    printf '%s\n' "$state_dir"   # ÚNICA linha em stdout — o Makefile captura só esta
    return 0
}

cmd_down() {
    local state_dir="${1:?state_dir}"
    if [ -f "$state_dir/next.pid" ]; then
        kill "$(cat "$state_dir/next.pid")" 2>/dev/null
    fi
    if [ -f "$state_dir/api.pid" ]; then
        kill "$(cat "$state_dir/api.pid")" 2>/dev/null
    fi
    # dá um instante para os dois soltarem a porta antes de apagar o diretório de estado
    sleep 0.3
    rm -rf "$state_dir"
    return 0
}

case "${1:-}" in
    up) shift; cmd_up "$@"; exit $? ;;
    down) shift; cmd_down "$@"; exit $? ;;
    *) _log "uso: e2e-env.sh up <api_up:0|1> <api_port> <next_port> | e2e-env.sh down <state_dir>"; exit 3 ;;
esac
