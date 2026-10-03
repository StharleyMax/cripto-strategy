#!/usr/bin/env bash
# T-06.4 (paineis-de-fluxo): compacta as duplicatas comprovadas de md.series — SÓ no Docker local.
#
# Norma: docs/context/paineis-de-fluxo/handoff/T-06.4-prova.md (§3.2 o predicado, §4 o falsificador,
# fim do arquivo a decisão do owner) e a emenda de 2026-10-02 em ADR-002 e ADR-041.
# Escopo: "so local,, n tem nada na vps ais ainda" [PREMISSA-OWNER: 2026-10-02]. Este script fala
# com o container local por `docker exec`; ele recusa um DOCKER_HOST/contexto remoto.
#
# ORDEM (pré-condição: T-06.4 implantada no writer, senão o próximo boot regrava tudo):
#   1. compact.sh snapshot  OUT                 # exige lag 0 em XINFO GROUPS; grava OUT/t_snap
#   2. compact.sh count     OUT before          # só leitura: por source, fingerprint, q1, F-1
#   3. compact.sh envelopes OUT before          # F-A: 100 envelopes pela rota, sha256 de cada
#   4. COMPACT_CONFIRM=delete-md-series-duplicates compact.sh delete OUT   # um chunk por transação
#   5. compact.sh count     OUT after
#   6. compact.sh envelopes OUT after
#   7. compact.sh verify    OUT                 # rc=0 só se F-A e F-B passarem, todos os itens
#
# Inspeção sem banco (o teste executa exatamente estes textos):
#   compact.sh print-sql {flags|stats|chunks|delete-chunk} T_SNAP [LO HI]
#
# Variáveis: PG_CONTAINER (deploy-postgres-1), API_CONTAINER (deploy-api-1),
#            REDIS_CONTAINER (deploy-redis-1), REDIS_STREAM (md.series.write), SYMBOL (BTCUSDT).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_CONTAINER="${PG_CONTAINER:-deploy-postgres-1}"
API_CONTAINER="${API_CONTAINER:-deploy-api-1}"
REDIS_CONTAINER="${REDIS_CONTAINER:-deploy-redis-1}"
REDIS_STREAM="${REDIS_STREAM:-md.series.write}"
SYMBOL="${SYMBOL:-BTCUSDT}"
CONFIRM_TOKEN="delete-md-series-duplicates"
MIN_BIGINT="-9223372036854775808"
MAX_BIGINT="9223372036854775807"

die() { echo "compact.sh: $*" >&2; exit 2; }

require_int() {
  [[ "$2" =~ ^-?[0-9]+$ ]] || die "$1 tem de ser inteiro (ms), veio '$2'"
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
    die "DOCKER_HOST=${DOCKER_HOST} não é local; decisão do owner: só o Docker local"
  fi
  local ctx; ctx="$(docker context show 2>/dev/null || echo default)"
  [[ "$ctx" == "default" ]] || die "contexto docker '$ctx' não é o local (default)"
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
  [[ -s "$1/t_snap" ]] || die "$1/t_snap ausente — rode 'compact.sh snapshot $1' antes"
  local t; t="$(cat "$1/t_snap")"; require_int T_SNAP "$t"; echo "$t"
}

# ── subcommands ─────────────────────────────────────────────────────────────────────────────────

cmd_snapshot() {
  local out="$1"; mkdir -p "$out"; refuse_remote_docker
  local lag
  lag="$(docker exec "$REDIS_CONTAINER" redis-cli XINFO GROUPS "$REDIS_STREAM" \
         | awk 'prev=="lag"{print; exit} {prev=$0}')"
  [[ "$lag" == "0" ]] || die "lag do grupo em $REDIS_STREAM é '${lag:-?}', não 0; espere o writer drenar"
  local t; t="$(echo "SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint" | psql_ro)"
  require_int T_SNAP "$t"
  echo "$t" > "$out/t_snap"
  echo "T_SNAP=$t ($(date -u -d "@$((t / 1000))" +%FT%TZ)) lag=0 -> $out/t_snap"
}

cmd_count() {
  local out="$1" phase="$2"; refuse_remote_docker
  local t; t="$(t_snap_of "$out")"
  local started; started="$(date +%s)"
  sql_stats "$t" | psql_ro > "$out/stats-$phase.tsv"
  echo "count $phase: $(wc -l < "$out/stats-$phase.tsv") linhas em $(( $(date +%s) - started )) s -> $out/stats-$phase.tsv"
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
        echo "AVISO: $sid sem bucket repetido em 14 d; K_mid = K_hist - 1 d" >&2
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
    echo "plano: $(wc -l < "$plan") pedidos -> $plan"
  fi
  local started; started="$(date +%s)"
  docker exec -i -e SYMBOL="$SYMBOL" "$API_CONTAINER" python -c "$(cat "$HERE/envelopes.py")" \
    < "$plan" > "$out/envelopes-$phase.tsv"
  local n n200
  n="$(wc -l < "$out/envelopes-$phase.tsv")"
  n200="$(awk -F'\t' '$2==200' "$out/envelopes-$phase.tsv" | wc -l)"
  echo "envelopes $phase: $n pedidos, $n200 com 200, em $(( $(date +%s) - started )) s -> $out/envelopes-$phase.tsv"
}

cmd_delete() {
  local out="$1"; refuse_remote_docker
  [[ "${COMPACT_CONFIRM:-}" == "$CONFIRM_TOKEN" ]] \
    || die "DELETE recusado: exporte COMPACT_CONFIRM=$CONFIRM_TOKEN (decisão do owner, só local)"
  local t; t="$(t_snap_of "$out")"
  [[ -s "$out/stats-before.tsv" ]] || die "rode 'compact.sh count $out before' antes do DELETE"
  # F-A's "before" can only be taken before the DELETE; without it `verify` can never pass again.
  [[ -s "$out/envelopes-before.tsv" ]] \
    || die "rode 'compact.sh envelopes $out before' antes do DELETE (F-A, prova §4)"
  # The chunk list is captured, not read through `< <(…)`: a process substitution's exit status is
  # invisible to `set -e`, and a failed listing would be reported as "0 rows deleted".
  local chunks
  chunks="$(sql_chunks | psql_ro)" \
    || die "falha ao listar os chunks de md.series (PG_CONTAINER=$PG_CONTAINER); nada foi apagado"
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
    [[ "$res" == *COMMIT ]] || die "chunk [$lo,$hi): selecionadas != apagadas — ROLLBACK; pare e investigue"
    total=$(( total + $(awk '{print $2}' <<< "$res") ))
  done <<< "$chunks"
  echo "apagadas no total: $total (log: $log)"
}

cmd_verify() {
  local out="$1" fail=0
  local before="$out/stats-before.tsv" after="$out/stats-after.tsv"
  [[ -s "$before" && -s "$after" ]] || die "faltam $before e/ou $after"
  # F-B.1: per source, after.frozen == before.survivors and after.selected == 0.
  while IFS=$'\t' read -r kind key a b c; do
    [[ "$kind" == "source" ]] || continue
    local after_line; after_line="$(awk -F'\t' -v k="$key" '$1=="source" && $2==k' "$after")"
    local fa sa; fa="$(cut -f3 <<< "$after_line")"; sa="$(cut -f4 <<< "$after_line")"
    if [[ "$fa" == "$c" && "$sa" == "0" ]]; then
      echo "F-B.1 OK   $key: antes $a, selecionadas $b, depois $fa"
    else
      echo "F-B.1 FAIL $key: esperado depois=$c e selecionadas=0, veio depois=${fa:-?} selecionadas=${sa:-?}"; fail=1
    fi
  done < "$before"
  # F-B.2 / F-B.3: the same line, byte for byte.
  for kind in fingerprint q1 f1; do
    local lb la; lb="$(awk -F'\t' -v k="$kind" '$1==k' "$before")"; la="$(awk -F'\t' -v k="$kind" '$1==k' "$after")"
    if [[ -n "$lb" && "$lb" == "$la" ]]; then echo "F-B   OK   $lb"; else echo "F-B   FAIL antes '$lb' depois '$la'"; fail=1; fi
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
      echo "F-A   OK   $eq/$n envelopes iguais, $ok200 com 200, latest_bucket_ms nunca recuou"
    else
      echo "F-A   FAIL $eq/$n iguais, $bad diferentes ou ausentes, $back recuos, $ok200 com 200 (mínimo 60)"; fail=1
    fi
  else
    echo "F-A   FAIL faltam $eb e/ou $ea"; fail=1
  fi
  [[ "$fail" == "0" ]] && echo "VEREDITO: DELETE conferido (F-A e F-B)" || echo "VEREDITO: REPROVA — ver as linhas FAIL"
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
    snapshot)  [[ $# -eq 1 ]] || die "uso: snapshot OUT"; cmd_snapshot "$1" ;;
    count)     [[ $# -eq 2 ]] || die "uso: count OUT {before|after}"; cmd_count "$1" "$2" ;;
    envelopes) [[ $# -eq 2 ]] || die "uso: envelopes OUT {before|after}"; cmd_envelopes "$1" "$2" ;;
    delete)    [[ $# -eq 1 ]] || die "uso: delete OUT"; cmd_delete "$1" ;;
    verify)    [[ $# -eq 1 ]] || die "uso: verify OUT"; cmd_verify "$1" ;;
    print-sql) [[ $# -ge 1 ]] || die "uso: print-sql WHAT [T_SNAP [LO HI]]"; cmd_print_sql "$@" ;;
    *) die "uso: compact.sh {snapshot|count|envelopes|delete|verify|print-sql} ... (ver o cabeçalho)" ;;
  esac
}

main "$@"
