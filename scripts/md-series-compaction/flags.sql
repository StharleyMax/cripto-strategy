-- T-06.4: the predicate of docs/context/paineis-de-fluxo/handoff/T-06.4-prova.md §3.2, transcribed.
-- One output row per row of the FROZEN universe (ingested_at <= T_SNAP, bucket_end in [LO, HI)),
-- with `selected` = the row repeats its IMMEDIATE predecessor (same 13-column fact, available_at
-- not earlier) AND its bucket has no consecutive pair with available_at going down (§3.3).
-- The 13 fact columns are domain/repeated_fact.py FACT_COLUMNS: the four PARTITION BY columns plus
-- the nine lag() comparisons below. tests/sentimento/test_md_series_compaction_script.py fails if
-- the two lists diverge. The window never crosses a chunk: md.series is partitioned by bucket_end.
-- Placeholders {{T_SNAP}}, {{LO}}, {{HI}} are substituted by compact.sh, integers only.
WITH frozen AS (
  SELECT * FROM md.series
  WHERE ingested_at <= {{T_SNAP}} AND bucket_end >= {{LO}} AND bucket_end < {{HI}}
), w AS (
  SELECT series_key_id, symbol, source, bucket_end, observed_at, available_at, value_raw,
    (lag(observed_at) OVER b IS NOT NULL
     AND lag(event_time)          OVER b = event_time
     AND lag(is_final)            OVER b IS NOT DISTINCT FROM is_final
     AND lag(value_raw)           OVER b = value_raw
     AND lag(provenance)          OVER b = provenance
     AND lag(availability_source) OVER b = availability_source
     AND lag(principal_id)        OVER b IS NOT DISTINCT FROM principal_id
     AND lag(src_label_raw)       OVER b = src_label_raw
     AND lag(observer_id)         OVER b = observer_id
     AND lag(observer_region)     OVER b = observer_region
     AND lag(available_at)        OVER b <= available_at)          AS repeats_predecessor,
    coalesce(lag(available_at) OVER b > available_at, false)        AS inverts_here
  FROM frozen
  WINDOW b AS (PARTITION BY series_key_id, symbol, source, bucket_end ORDER BY observed_at)
), f AS (
  SELECT *, bool_or(inverts_here) OVER (PARTITION BY series_key_id, symbol, source, bucket_end)
           AS bucket_inverted
  FROM w
)
SELECT series_key_id, symbol, source, bucket_end, observed_at, available_at, value_raw,
       (repeats_predecessor AND NOT bucket_inverted) AS selected
FROM f
