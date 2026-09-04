-- D4 criterion "leitura de backtest": full as_of(now) sequential scan, 30d x 4 symbols, fonte='q'.
\timing on
SELECT count(*) FROM (
  SELECT DISTINCT ON (symbol, event_time) symbol, event_time, sum_open_interest, sum_open_interest_value
  FROM market_series
  WHERE fonte = 'q' AND available_at <= now()
  ORDER BY symbol, event_time, observed_at ASC
) t;

-- TEST A: class (a) fixture -- as_of(cutoff_test_a) for the 30 poisoned event_times
-- must equal the ORIGINAL (unperturbed) value; the +20-day-future row must be invisible.
SELECT DISTINCT ON (event_time) event_time, sum_open_interest, sum_open_interest_value
FROM market_series
WHERE symbol = 'BTCUSDT' AND fonte = 'q'
  AND event_time IN (
    SELECT DISTINCT event_time FROM market_series WHERE poison_class = 'a'
  )
  AND available_at <= (SELECT max(event_time) FROM market_series WHERE fonte='q' AND poison_class IS NULL AND symbol='BTCUSDT')
ORDER BY event_time, observed_at ASC;

-- TEST B (final_only): must equal the ORIGINAL final value, ignore the partial (0.5x) row.
SELECT DISTINCT ON (event_time) event_time, sum_open_interest, sum_open_interest_value
FROM market_series
WHERE symbol = 'BTCUSDT' AND fonte = 'q' AND is_final = true
  AND event_time IN (SELECT DISTINCT event_time FROM market_series WHERE poison_class = 'b')
ORDER BY event_time, observed_at ASC;

-- TEST B (intrabar): no is_final filter -> argmin(observed_at) must pick the PARTIAL (0.5x) row.
SELECT DISTINCT ON (event_time) event_time, sum_open_interest, sum_open_interest_value
FROM market_series
WHERE symbol = 'BTCUSDT' AND fonte = 'q'
  AND event_time IN (SELECT DISTINCT event_time FROM market_series WHERE poison_class = 'b')
ORDER BY event_time, observed_at ASC;

-- TEST C: SEM_FONTE -- fonte='nq' before live_start must return ZERO rows, never fall back to 'q'.
SELECT count(*) AS rows_nq_before_live
FROM market_series
WHERE symbol = 'BTCUSDT' AND fonte = 'nq'
  AND event_time < (SELECT min(event_time) FROM market_series WHERE poison_class = 'c');
