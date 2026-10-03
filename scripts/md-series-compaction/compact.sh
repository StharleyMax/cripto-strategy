#!/usr/bin/env bash
# T-06.4 (paineis-de-fluxo): compacts the proven duplicates of md.series — LOCAL Docker ONLY.
#
# Norm: docs/context/paineis-de-fluxo/handoff/T-06.4-prova.md (§3.2 the predicate, §4 the falsifier,
# end of file the owner's decision) and the 2026-10-02 amendment to ADR-002 and ADR-041.
# Scope: "so local,, n tem nada na vps ais ainda" [PREMISSA-OWNER: 2026-10-02]. This script talks
# to the local container through `docker exec`; it refuses a remote DOCKER_HOST/context.
#
# ORDER (precondition: T-06.4 deployed in the writer, otherwise the next boot rewrites everything).
# The "frozen" universe (`ingested_at <= T_SNAP`) is frozen only with the PIPELINE STOPPED:
# `ingested_at` is the COLLECTOR's `received_at`, stamped before the row enters the stream, and the
# `lag` of XINFO GROUPS excludes the PEL (a batch delivered to the writer and not yet acked). With
# the pipeline alive, rows with `ingested_at <= T_SNAP` land after the `count before`, and F-B fails
# AFTER the DELETE without telling a false alarm from a wrong deletion (W8-CODE-REVIEW B-1).
# `snapshot` and `delete` refuse (rc=2, before touching the database) unless the pipeline is
# stopped — see require_pipeline_stopped.
#   0. docker stop deploy-collector-1           # stop the collectors: nothing new enters the stream
#      wait for lag 0 AND pending 0 on the group # the writer drains the stream and acks the PEL
#      docker stop deploy-writer-1              # stop the writer
#   1. compact.sh snapshot  OUT                 # requires the pipeline stopped; writes OUT/t_snap
#   2. compact.sh count     OUT before          # read-only: per source, fingerprint, q1, F-1
#   3. compact.sh envelopes OUT before          # F-A: 100 envelopes through the route, sha256 of each
#   4. COMPACT_CONFIRM=delete-md-series-duplicates compact.sh delete OUT   # pipeline stopped again;
#                                                                         # one chunk per transaction
#   5. compact.sh count     OUT after
#   6. compact.sh envelopes OUT after
#   7. compact.sh verify    OUT                 # rc=0 only if F-A and F-B pass, every item
#   8. docker start deploy-writer-1 deploy-collector-1   # restart: writer before collector
#
# Inspection without a database (the test runs exactly these texts):
#   compact.sh print-sql {flags|stats|chunks|delete-chunk} T_SNAP [LO HI]
#
# Variables: PG_CONTAINER (deploy-postgres-1), API_CONTAINER (deploy-api-1),
#            REDIS_CONTAINER (deploy-redis-1), REDIS_STREAM (md.series.write),
#            REDIS_STREAM_GROUP (single_writer), COLLECTOR_CONTAINERS (deploy-collector-1, a
#            space-separated list), WRITER_CONTAINER (deploy-writer-1), SYMBOL (BTCUSDT).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_CONTAINER="${PG_CONTAINER:-deploy-postgres-1}"
API_CONTAINER="${API_CONTAINER:-deploy-api-1}"
REDIS_CONTAINER="${REDIS_CONTAINER:-deploy-redis-1}"
REDIS_STREAM="${REDIS_STREAM:-md.series.write}"
REDIS_STREAM_GROUP="${REDIS_STREAM_GROUP:-single_writer}"
COLLECTOR_CONTAINERS="${COLLECTOR_CONTAINERS:-deploy-collector-1}"
WRITER_CONTAINER="${WRITER_CONTAINER:-deploy-writer-1}"
SYMBOL="${SYMBOL:-BTCUSDT}"
CONFIRM_TOKEN="delete-md-series-duplicates"
MIN_BIGINT="-9223372036854775808"
MAX_BIGINT="9223372036854775807"

die() { echo "compact.sh: $*" >&2; exit 2; }

require_int() {
  [[ "$2" =~ ^-?[0-9]+$ ]] || die "$1 must be an integer (ms), got '$2'"
}

# ── SQL ─────────────────────────────────────────────────────────────────────────────────────────

sql_flags() {  # T_SNAP LO HI
  require_int T_SNAP "$1"; require_int LO "$2"; require_int HI "$3"
  sed -e "s/{{T_SNAP}}/$1/g" -e "s/{{LO}}/$2/g" -e "s/{{HI}}/$3/g" "$HERE/flags.sql"
}

# F-B over the frozen universe: rows per source (frozen / selected / survivors), and three
# numbers over the SURVIVORS — an order-independent fingerprint, q1 and F-1 of T-05.2.
# Before the DELETE the survivors are the non-selected rows; after it, they are every row, and
# `selected` must be 0. The SAME text runs before and after.
sql_stats() {  # T_SNAP
  require_int T_SNAP "$1"
  cat <<SQL
WITH flags AS (
$(sql_flags "$1" "$MIN_BIGINT" "$MAX_BIGINT")
), kept AS (
  SELECT * FROM flags WHERE NOT selected
), buckets AS (
  SELECT series_key_id, symbol, source, bucket_end,
         count(DISTINCT value_raw) AS n_values,
         min(observed_at) FILTER (WHERE value_raw ~ '^0+(\.0+)?\$')  AS first_zero,
         max(observed_at) FILTER (WHERE value_raw !~ '^0+(\.0+)?\$') AS last_nonzero
  FROM kept GROUP BY 1, 2, 3, 4
)
SELECT 'source' AS kind, source AS key, count(*)::text AS a,
       count(*) FILTER (WHERE selected)::text AS b, count(*) FILTER (WHERE NOT selected)::text AS c
  FROM flags GROUP BY source
UNION ALL
SELECT 'fingerprint', 'survivors', count(*)::text,
       coalesce(sum(('x' || substr(md5(concat_ws('|', series_key_id, symbol, source, bucket_end,
                observed_at, available_at, value_raw)), 1, 15))::bit(60)::bigint), 0)::text, '-'
  FROM kept
UNION ALL
SELECT 'q1', 'buckets_with_more_than_one_value', count(*) FILTER (WHERE n_values > 1)::text, '-', '-'
  FROM buckets
UNION ALL
SELECT 'f1', 'buckets_zero_before_nonzero', count(*) FILTER (WHERE first_zero < last_nonzero)::text,
       '-', '-'
  FROM buckets
ORDER BY 1, 2
SQL
}

sql_chunks() {
  cat <<'SQL'
SELECT range_start_integer, range_end_integer
  FROM timescaledb_information.chunks
 WHERE hypertable_schema = 'md' AND hypertable_name = 'series'
 ORDER BY range_start_integer
SQL
}

# One chunk: selected and deleted counted in the SAME statement; compact.sh commits only when
# they are equal (psql \if below). The test runs this text and asserts the same equality.
sql_delete_chunk() {  # T_SNAP LO HI
  require_int T_SNAP "$1"; require_int LO "$2"; require_int HI "$3"
  cat <<SQL
WITH d AS (
  SELECT series_key_id, symbol, source, bucket_end, observed_at
  FROM (
$(sql_flags "$1" "$2" "$3")
  ) flags
  WHERE selected
), del AS (
  DELETE FROM md.series s USING d
   WHERE s.series_key_id = d.series_key_id AND s.symbol = d.symbol AND s.source = d.source
     AND s.bucket_end = d.bucket_end AND s.observed_at = d.observed_at
     AND s.bucket_end >= $2 AND s.bucket_end < $3
  RETURNING 1
)
SELECT (SELECT count(*) FROM d) AS n_selected, (SELECT count(*) FROM del) AS n_deleted
SQL
}

# ── docker ──────────────────────────────────────────────────────────────────────────────────────

refuse_remote_docker() {
  if [[ -n "${DOCKER_HOST:-}" && "${DOCKER_HOST}" != unix://* ]]; then
    die "DOCKER_HOST=${DOCKER_HOST} is not local; owner's decision: local Docker only"
  fi
  local ctx; ctx="$(docker context show 2>/dev/null || echo default)"
  [[ "$ctx" == "default" ]] || die "docker context '$ctx' is not the local one (default)"
}

psql_ro() {  # stdin = SQL; read-only session, TSV out
  docker exec -i -e PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=0" \
    "$PG_CONTAINER" sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -F "	"'
}

psql_rw() {  # stdin = SQL (with psql meta-commands)
  docker exec -i -e PGOPTIONS="-c statement_timeout=0" \
    "$PG_CONTAINER" sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -F "	"'
}

t_snap_of() {
  [[ -s "$1/t_snap" ]] || die "$1/t_snap missing — run 'compact.sh snapshot $1' first"
  local t; t="$(cat "$1/t_snap")"; require_int T_SNAP "$t"; echo "$t"
}

# B-1 (W8-CODE-REVIEW): the frozen universe is frozen only while NOTHING can still land a row with
# `ingested_at <= T_SNAP`. Fail-closed on every check — a container that cannot be inspected, a
# group that is not listed, or a `lag` Redis cannot compute (nil) all refuse, as a running one does.
#   * every collector and the writer exist and are NOT running (exited/created/dead);
#   * no container of compose service `collector` or `writer` runs under ANY name (a scaled
#     replica, another project) — the named check alone would miss it;
#   * the writer group has lag 0 (nothing undelivered) AND pending 0 (no PEL: nothing delivered and
#     not yet acked, i.e. no batch half-written when the writer stopped).
require_pipeline_stopped() {
  local c state
  for c in $COLLECTOR_CONTAINERS $WRITER_CONTAINER; do
    state="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)" \
      || die "container '$c' not found (set COLLECTOR_CONTAINERS/WRITER_CONTAINER); nothing was touched"
    case "$state" in
      exited|created|dead) ;;
      *) die "container '$c' is '$state'; stop the pipeline first (docker stop $c) — B-1, nothing was touched" ;;
    esac
  done
  # ONE `docker ps` PER SERVICE: repeated `label` filters are AND, not OR — a single call filtering
  # on both services matches no container and always prints nothing (W8-CODE-REVIEW N-1, measured
  # on Docker 24.0.4 with the live pipeline: AND → empty; `…=collector` → deploy-collector-1).
  local svc running
  for svc in collector writer; do
    running="$(docker ps --format '{{.Names}}' --filter "label=com.docker.compose.service=$svc")" \
      || die "docker ps failed; cannot prove the pipeline is stopped — nothing was touched"
    [[ -z "$running" ]] \
      || die "compose service '$svc' still running: $(tr '\n' ' ' <<< "$running")— stop it first; nothing was touched"
  done
  local info
  info="$(docker exec "$REDIS_CONTAINER" redis-cli XINFO GROUPS "$REDIS_STREAM")" \
    || die "XINFO GROUPS $REDIS_STREAM failed (REDIS_CONTAINER=$REDIS_CONTAINER); nothing was touched"
  # redis-cli (no TTY) prints the reply flattened, one element per line: key, value, key, value…
  local found lag pending
  read -r found lag pending <<< "$(awk -v g="$REDIS_STREAM_GROUP" '
      NR % 2 == 1 { key = $0; next }
      key == "name" { cur = $0; if (cur == g) found = 1 }
      cur == g && key == "lag"     { lag = ($0 == "" ? "nil" : $0) }
      cur == g && key == "pending" { pending = ($0 == "" ? "nil" : $0) }
      END { printf "%d %s %s", found, (lag == "" ? "?" : lag), (pending == "" ? "?" : pending) }' <<< "$info")"
  [[ "$found" == "1" ]] \
    || die "group '$REDIS_STREAM_GROUP' missing from XINFO GROUPS $REDIS_STREAM; nothing was touched"
  [[ "$lag" == "0" ]] \
    || die "lag of group '$REDIS_STREAM_GROUP' is '$lag', not 0 — restart only the writer, drain, stop it again; nothing was touched"
  [[ "$pending" == "0" ]] \
    || die "pending of group '$REDIS_STREAM_GROUP' is '$pending', not 0 (unacked PEL) — restart only the writer, drain, stop it again; nothing was touched"
}

# ── subcommands ─────────────────────────────────────────────────────────────────────────────────

cmd_snapshot() {
  local out="$1"; refuse_remote_docker
  require_pipeline_stopped
  mkdir -p "$out"
  local t; t="$(echo "SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint" | psql_ro)"
  require_int T_SNAP "$t"
  echo "$t" > "$out/t_snap"
  echo "T_SNAP=$t ($(date -u -d "@$((t / 1000))" +%FT%TZ)) pipeline stopped, lag=0 pending=0 -> $out/t_snap"
}

cmd_count() {
  local out="$1" phase="$2"; refuse_remote_docker
  local t; t="$(t_snap_of "$out")"
  local started; started="$(date +%s)"
  sql_stats "$t" | psql_ro > "$out/stats-$phase.tsv"
  echo "count $phase: $(wc -l < "$out/stats-$phase.tsv") lines in $(( $(date +%s) - started )) s -> $out/stats-$phase.tsv"
  cat "$out/stats-$phase.tsv"
}

# F-A plan: up to 10 series of SYMBOL (most rows first) x {1m,1h,4h} x {now,hist,mid}, final_only,
# plus 1m/now intrabar = 100 requests when 10 series exist.
cmd_envelopes() {
  local out="$1" phase="$2"; refuse_remote_docker
  local t; t="$(t_snap_of "$out")"
  local plan="$out/envelope-plan.tsv"
  if [[ ! -s "$plan" ]]; then
    local k_now=$(( t - 300000 ))
    local k_hist; k_hist="$(( $(date -u -d '2026-09-12T12:00:00Z' +%s) * 1000 ))"
    local four_h=14400000 day=86400000
    local end_now=$(( (k_now / four_h) * four_h ))
    psql_ro > "$out/envelope-series.tsv" <<SQL
WITH s AS (
  SELECT series_key_id, count(*) AS n FROM md.series
   WHERE symbol = '$SYMBOL' AND ingested_at <= $t GROUP BY 1 ORDER BY n DESC, 1 LIMIT 10
), m AS (
  SELECT x.series_key_id, x.bucket_end, x.observed_at, x.value_raw,
         lead(x.observed_at) OVER w AS next_obs, lead(x.value_raw) OVER w AS next_val,
         row_number() OVER w AS rn
    FROM md.series x JOIN s USING (series_key_id)
   WHERE x.symbol = '$SYMBOL' AND x.ingested_at <= $t AND x.bucket_end > $t - 14 * $day
  WINDOW w AS (PARTITION BY x.series_key_id, x.source, x.bucket_end ORDER BY x.observed_at)
), b AS (
  SELECT DISTINCT ON (series_key_id) series_key_id, bucket_end, (observed_at + next_obs) / 2 AS k_mid
    FROM m WHERE rn = 1 AND next_obs IS NOT NULL AND next_val = value_raw
   ORDER BY series_key_id, bucket_end DESC
)
SELECT s.series_key_id, coalesce(b.bucket_end, -1), coalesce(b.k_mid, -1)
  FROM s LEFT JOIN b USING (series_key_id) ORDER BY s.series_key_id
SQL
    : > "$plan"
    while IFS=$'\t' read -r sid bucket k_mid; do
      [[ -n "$sid" ]] || continue
      local mid_k mid_lo mid_hi
      if [[ "$k_mid" == "-1" ]]; then  # no repeated bucket in 14 d: a third, declared horizon
        mid_k=$(( k_hist - day )); mid_lo=$(( mid_k - day )); mid_hi=$mid_k
        echo "WARNING: $sid has no repeated bucket in 14 d; K_mid = K_hist - 1 d" >&2
      else
        mid_k=$k_mid; mid_lo=$(( ((bucket - day / 2) / four_h) * four_h )); mid_hi=$(( mid_lo + day ))
      fi
      for interval in 1m 1h 4h; do
        local span=$(( 7 * day )); [[ "$interval" == "1m" ]] && span=$(( 4 * day ))
        printf '%s\n' \
          "$sid|$interval|now|final_only|$(( end_now - span ))|$(( end_now - 60000 ))|$k_now" \
          "$sid|$interval|hist|final_only|$(( k_hist - 7 * day ))|$(( k_hist - 60000 ))|$k_hist" \
          "$sid|$interval|mid|final_only|$mid_lo|$(( mid_hi - 60000 ))|$mid_k" >> "$plan"
      done
      echo "$sid|1m|now|intrabar|$(( end_now - 4 * day ))|$(( end_now - 60000 ))|$k_now" >> "$plan"
    done < "$out/envelope-series.tsv"
    echo "plan: $(wc -l < "$plan") requests -> $plan"
  fi
  local started; started="$(date +%s)"
  docker exec -i -e SYMBOL="$SYMBOL" "$API_CONTAINER" python -c "$(cat "$HERE/envelopes.py")" \
    < "$plan" > "$out/envelopes-$phase.tsv"
  local n n200
  n="$(wc -l < "$out/envelopes-$phase.tsv")"
  n200="$(awk -F'\t' '$2==200' "$out/envelopes-$phase.tsv" | wc -l)"
  echo "envelopes $phase: $n requests, $n200 with 200, in $(( $(date +%s) - started )) s -> $out/envelopes-$phase.tsv"
}

cmd_delete() {
  local out="$1"; refuse_remote_docker
  [[ "${COMPACT_CONFIRM:-}" == "$CONFIRM_TOKEN" ]] \
    || die "DELETE refused: export COMPACT_CONFIRM=$CONFIRM_TOKEN (owner's decision, local only)"
  local t; t="$(t_snap_of "$out")"
  [[ -s "$out/stats-before.tsv" ]] || die "run 'compact.sh count $out before' before the DELETE"
  # F-A's "before" can only be taken before the DELETE; without it `verify` can never pass again.
  [[ -s "$out/envelopes-before.tsv" ]] \
    || die "run 'compact.sh envelopes $out before' before the DELETE (F-A, T-06.4-prova.md §4)"
  # B-1: the pipeline must STILL be stopped — restarted between snapshot and DELETE, rows with
  # `ingested_at <= T_SNAP` would land under the DELETE and break F-B after the irreversible step.
  require_pipeline_stopped
  # The chunk list is captured, not read through `< <(…)`: a process substitution's exit status is
  # invisible to `set -e`, and a failed listing would be reported as "0 rows deleted".
  local chunks
  chunks="$(sql_chunks | psql_ro)" \
    || die "failed to list the chunks of md.series (PG_CONTAINER=$PG_CONTAINER); nothing was deleted"
  local log="$out/delete.log"; : > "$log"
  local total=0
  while IFS=$'\t' read -r lo hi; do
    [[ -n "$lo" ]] || continue
    local started; started="$(date +%s)"
    local res
    res="$( { echo "BEGIN;"; sql_delete_chunk "$t" "$lo" "$hi"; echo '\gset'
              echo "SELECT :n_selected = :n_deleted AS ok \\gset"
              echo '\if :ok'; echo 'COMMIT;'; echo '\echo :n_selected :n_deleted COMMIT'
              echo '\else'; echo 'ROLLBACK;'; echo '\echo :n_selected :n_deleted ROLLBACK'; echo '\endif'
            } | psql_rw )"
    echo "$lo	$hi	$res	$(( $(date +%s) - started ))s" | tee -a "$log"
    [[ "$res" == *COMMIT ]] || die "chunk [$lo,$hi): selected != deleted — ROLLBACK; stop and investigate"
    total=$(( total + $(awk '{print $2}' <<< "$res") ))
  done <<< "$chunks"
  echo "deleted in total: $total (log: $log)"
}

cmd_verify() {
  local out="$1" fail=0
  local before="$out/stats-before.tsv" after="$out/stats-after.tsv"
  [[ -s "$before" && -s "$after" ]] || die "missing $before and/or $after"
  # F-B.1: per source, after.frozen == before.survivors and after.selected == 0.
  while IFS=$'\t' read -r kind key a b c; do
    [[ "$kind" == "source" ]] || continue
    local after_line; after_line="$(awk -F'\t' -v k="$key" '$1=="source" && $2==k' "$after")"
    local fa sa; fa="$(cut -f3 <<< "$after_line")"; sa="$(cut -f4 <<< "$after_line")"
    if [[ "$fa" == "$c" && "$sa" == "0" ]]; then
      echo "F-B.1 OK   $key: before $a, selected $b, after $fa"
    else
      echo "F-B.1 FAIL $key: expected after=$c and selected=0, got after=${fa:-?} selected=${sa:-?}"; fail=1
    fi
  done < "$before"
  # F-B.2 / F-B.3: the same line, byte for byte.
  for kind in fingerprint q1 f1; do
    local lb la; lb="$(awk -F'\t' -v k="$kind" '$1==k' "$before")"; la="$(awk -F'\t' -v k="$kind" '$1==k' "$after")"
    if [[ -n "$lb" && "$lb" == "$la" ]]; then echo "F-B   OK   $lb"; else echo "F-B   FAIL before '$lb' after '$la'"; fail=1; fi
  done
  # F-A: every envelope equal; latest_bucket_ms never goes back; at least 60 answered 200.
  local eb="$out/envelopes-before.tsv" ea="$out/envelopes-after.tsv"
  if [[ -s "$eb" && -s "$ea" ]]; then
    local res
    res="$(awk -F'\t' 'NR==FNR{s[$1]=$3; l[$1]=$4; st[$1]=$2; next}
      { n++; if (!($1 in s)) {miss++; next}
        if (s[$1]==$3) eq++; else {diff++; print "F-A   DIFF " $1 > "/dev/stderr"}
        if ($4 != "" && l[$1] != "" && $4+0 < l[$1]+0) back++
        if (st[$1]==200) ok200++ }
      END{printf "%d %d %d %d %d", n, eq, diff+miss, back, ok200}' "$eb" "$ea")"
    read -r n eq bad back ok200 <<< "$res"
    if [[ "$bad" == "0" && "$back" == "0" && "$ok200" -ge 60 ]]; then
      echo "F-A   OK   $eq/$n envelopes equal, $ok200 with 200, latest_bucket_ms never went back"
    else
      echo "F-A   FAIL $eq/$n equal, $bad different or missing, $back went back, $ok200 with 200 (minimum 60)"; fail=1
    fi
  else
    echo "F-A   FAIL missing $eb and/or $ea"; fail=1
  fi
  [[ "$fail" == "0" ]] && echo "VERDICT: DELETE verified (F-A and F-B)" || echo "VERDICT: FAIL — see the FAIL lines"
  return "$fail"
}

cmd_print_sql() {
  local what="$1"; shift
  case "$what" in
    flags)        sql_flags "$1" "${2:-$MIN_BIGINT}" "${3:-$MAX_BIGINT}" ;;
    stats)        sql_stats "$1" ;;
    chunks)       sql_chunks ;;
    delete-chunk) require_int LO "$2"; require_int HI "$3"; sql_delete_chunk "$1" "$2" "$3" ;;
    *) die "print-sql: flags|stats|chunks|delete-chunk" ;;
  esac
}

main() {
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    snapshot)  [[ $# -eq 1 ]] || die "usage: snapshot OUT"; cmd_snapshot "$1" ;;
    count)     [[ $# -eq 2 ]] || die "usage: count OUT {before|after}"; cmd_count "$1" "$2" ;;
    envelopes) [[ $# -eq 2 ]] || die "usage: envelopes OUT {before|after}"; cmd_envelopes "$1" "$2" ;;
    delete)    [[ $# -eq 1 ]] || die "usage: delete OUT"; cmd_delete "$1" ;;
    verify)    [[ $# -eq 1 ]] || die "usage: verify OUT"; cmd_verify "$1" ;;
    print-sql) [[ $# -ge 1 ]] || die "usage: print-sql WHAT [T_SNAP [LO HI]]"; cmd_print_sql "$@" ;;
    *) die "usage: compact.sh {snapshot|count|envelopes|delete|verify|print-sql} ... (see the header)" ;;
  esac
}

main "$@"
