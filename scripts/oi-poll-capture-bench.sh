#!/usr/bin/env bash
# T-03.6 (paineis-de-fluxo, trilha 03a): DoD de captura do coletor de OI numa stack PROPRIA.
#
#   bash scripts/oi-poll-capture-bench.sh <out_dir>
#
# Sobe um Postgres (timescale) e um Redis DESCARTAVEIS, em loopback e porta aleatoria, com nomes
# `oi_capture_bench_*` — os unicos que o bench aceita (guarda de `D-g` em
# `open_interest_poll_capture_bench_cli.py`). Nunca toca o Postgres compartilhado: nem porta, nem
# stream, nem container. Roda o writer de producao (`single_writer_cli`) e o laco do coletor de OI
# SOZINHO (`... bench_cli collect`), para o coletor por `BENCH_STOPPED_S`, religa, e audita os
# itens 1 (contagem), 2 e 4 do DoD de `03a` (plano 03).
#
# MORDE, dentro do proprio script: depois da auditoria verde, copia a ultima linha anterior a
# parada para o primeiro minuto ausente — exatamente o que um carry-forward escreveria — no
# Postgres DO BENCH, e audita de novo. Sai 0 so se a 1a auditoria passou E a 2a reprovou.
#
# Gasta cota real da Binance (peso 1 por chamada, 4 por minuto). Nao e teste, nao entra em verify.
set -euo pipefail

OUT="${1:?uso: oi-poll-capture-bench.sh <out_dir>}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$RAIZ/backend"
PY="$BACKEND/.venv/bin/python"
BENCH="src.modules.sentimento.infra.open_interest_poll_capture_bench_cli"
BEFORE_S="${BENCH_BEFORE_S:-200}"
STOPPED_S="${BENCH_STOPPED_S:-150}"
AFTER_S="${BENCH_AFTER_S:-200}"

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
TAG="$(date +%s)_$$"
DB="oi_capture_bench_${TAG}"
PGC="oi-capture-bench-pg-${TAG}"
RDC="oi-capture-bench-redis-${TAG}"
PGUSER_="bench"
PGPASS_="bench-throwaway-${TAG}"
WRITER_PID=""
COLLECTOR_PID=""

_log() { printf '[bench %s] %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$OUT/bench.log" >&2; }
_now_ms() { date +%s%3N; }

cleanup() {
    [ -n "$COLLECTOR_PID" ] && kill -TERM "$COLLECTOR_PID" 2>/dev/null || true
    [ -n "$WRITER_PID" ] && kill -TERM "$WRITER_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    docker rm -f -v "$PGC" "$RDC" >/dev/null 2>&1 || true
    _log "stack destruida ($PGC, $RDC)"
}
trap cleanup EXIT

_psql() { docker exec "$PGC" psql -U "$PGUSER_" -d "$DB" -tAc "$1"; }

_log "subindo $PGC e $RDC"
docker run -d --rm --name "$PGC" -e POSTGRES_USER="$PGUSER_" -e POSTGRES_PASSWORD="$PGPASS_" \
    -e POSTGRES_DB="$DB" -p 127.0.0.1::5432 timescale/timescaledb:2.17.2-pg15 >/dev/null
docker run -d --rm --name "$RDC" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
PG_PORT="$(docker port "$PGC" 5432/tcp | head -1 | sed 's/.*://')"
RD_PORT="$(docker port "$RDC" 6379/tcp | head -1 | sed 's/.*://')"

deadline=$(( $(date +%s) + 60 ))
until docker exec "$PGC" pg_isready -h 127.0.0.1 -U "$PGUSER_" -d "$DB" >/dev/null 2>&1; do
    [ "$(date +%s)" -lt "$deadline" ] || { _log "RECUSA: postgres nao ficou pronto em 60 s"; exit 3; }
    sleep 1
done
until docker exec "$RDC" redis-cli ping >/dev/null 2>&1; do
    [ "$(date +%s)" -lt "$deadline" ] || { _log "RECUSA: redis nao ficou pronto em 60 s"; exit 3; }
    sleep 1
done

export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT="$PG_PORT" POSTGRES_DB="$DB"
export POSTGRES_USER="$PGUSER_" POSTGRES_PASSWORD="$PGPASS_"
export REDIS_HOST=127.0.0.1 REDIS_PORT="$RD_PORT" REDIS_STREAM="oi_capture_bench.series.write"
export INGEST_RECORD_BACKEND=postgres PYTHONPATH="$BACKEND"
_log "postgres 127.0.0.1:$PG_PORT db=$DB · redis 127.0.0.1:$RD_PORT stream=$REDIS_STREAM"

( cd "$BACKEND" && exec "$PY" -m src.modules.sentimento.infra.single_writer_cli ) \
    >"$OUT/writer.log" 2>&1 &
WRITER_PID=$!
until [ "$(_psql "select to_regclass('md.series') is not null" 2>/dev/null)" = "t" ]; do
    kill -0 "$WRITER_PID" 2>/dev/null || { _log "RECUSA: writer morreu no boot"; exit 3; }
    [ "$(date +%s)" -lt "$deadline" ] || { _log "RECUSA: md.series nao existe em 60 s"; exit 3; }
    sleep 1
done

( cd "$BACKEND" && "$PY" -m "$BENCH" counts ) >"$OUT/baseline.json" 2>>"$OUT/bench-cli.log"
_log "baseline: $(cat "$OUT/baseline.json")"

_start_collector() {
    ( cd "$BACKEND" && exec "$PY" -m "$BENCH" collect --calls-log "$OUT/calls.jsonl" ) \
        >>"$OUT/collector.log" 2>&1 &
    COLLECTOR_PID=$!
}
_stop_collector() {
    kill -TERM "$COLLECTOR_PID"
    wait "$COLLECTOR_PID" || _log "coletor saiu com rc=$?"
    COLLECTOR_PID=""
}

_start_collector
_log "coletor ligado (pid $COLLECTOR_PID); ${BEFORE_S}s antes da parada"
sleep "$BEFORE_S"
_stop_collector
STOPPED_FROM_MS="$(_now_ms)"
_log "coletor PARADO em $STOPPED_FROM_MS; ${STOPPED_S}s parado"
sleep "$STOPPED_S"
STOPPED_UNTIL_MS="$(_now_ms)"
_start_collector
_log "coletor RELIGADO em $STOPPED_UNTIL_MS (pid $COLLECTOR_PID); ${AFTER_S}s"
sleep "$AFTER_S"
_stop_collector
sleep 3  # o writer drena a ultima entrada da stream (WRITER_POLL_INTERVAL_MS = 500)

_audit() {
    ( cd "$BACKEND" && "$PY" -m "$BENCH" audit --calls-log "$OUT/calls.jsonl" \
        --stopped-from-ms "$STOPPED_FROM_MS" --stopped-until-ms "$STOPPED_UNTIL_MS" ) \
        >"$1" 2>>"$OUT/bench-cli.log"
}
set +e
_audit "$OUT/audit.json"; AUDIT_RC=$?
set -e
_log "auditoria: rc=$AUDIT_RC $(cat "$OUT/audit.json")"

# ── MORDE: carry-forward plantado no Postgres DO BENCH ────────────────────────────────────
FIRST_ABSENT="$("$PY" -c 'import json,sys; m=json.load(open(sys.argv[1]))["dod_4_absent_not_carried"]["expected_absent_minutes"]; print(m[0] if m else "")' "$OUT/audit.json")"
if [ -z "$FIRST_ABSENT" ]; then
    _log "sem minuto ausente esperado: a mordida nao tem onde plantar"; exit 1
fi
BTC_ID="$(cd "$BACKEND" && "$PY" -c 'from src.modules.sentimento.infra.open_interest_poll_capture_bench_cli import polled_series_ids; print(polled_series_ids()["BTCUSDT"])')"
PLANTED="$(_psql "INSERT INTO md.series SELECT series_key_id, symbol, source, $FIRST_ABSENT, \
event_time, available_at, availability_source, ingested_at, observed_at, provenance, src_label_raw, \
observer_id, observer_region, is_final, principal_id, value_raw FROM md.series \
WHERE bucket_end < $STOPPED_FROM_MS AND series_key_id = '$BTC_ID' ORDER BY bucket_end DESC LIMIT 1 RETURNING series_key_id, bucket_end")"
_log "carry-forward plantado: $PLANTED"
set +e
_audit "$OUT/audit-carry-forward.json"; PLANT_RC=$?
set -e
_log "auditoria com carry-forward: rc=$PLANT_RC $(cat "$OUT/audit-carry-forward.json")"

if [ "$AUDIT_RC" -eq 0 ] && [ "$PLANT_RC" -eq 1 ]; then
    _log "OK: auditoria verde e carry-forward reprovado"; exit 0
fi
_log "FALHA: auditoria rc=$AUDIT_RC (esperado 0), carry-forward rc=$PLANT_RC (esperado 1)"; exit 1
