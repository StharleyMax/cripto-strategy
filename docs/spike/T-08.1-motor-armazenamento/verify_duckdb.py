#!/usr/bin/env python3
"""Same fixture battery as verify_timescale.py, run against candidate 5
(Parquet, Hive-partitioned by symbol/fonte, zstd level 19) via DuckDB, local disk
(no real R2 -- see the gate report for why network latency is [NAO MEDIDO] here).
"""
import json
import sys
import time

import duckdb

REF = json.load(open("built/reference.json"))
GLOB = "built/parquet_z19/**/*.parquet"


def rows_to_dict(con, sql):
    out = {}
    for et, oi, oiv in con.execute(sql).fetchall():
        out[et.isoformat()] = {"sum_open_interest": oi, "sum_open_interest_value": oiv}
    return out


def compare(name, got, ref):
    if len(got) != len(ref):
        print(f"  [FAIL] {name}: row count got={len(got)} ref={len(ref)}")
        return False
    ok = True
    for k, v in ref.items():
        g = got.get(k)
        if g is None:
            print(f"  [FAIL] {name}: missing key {k}")
            ok = False
            continue
        if abs(g["sum_open_interest"] - v["sum_open_interest"]) > 1e-9 or \
           abs(g["sum_open_interest_value"] - v["sum_open_interest_value"]) > 1e-6:
            print(f"  [FAIL] {name}: mismatch at {k}: got={g} ref={v}")
            ok = False
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}: n={len(ref)} bit-identical={ok}")
    return ok


def main():
    con = duckdb.connect()
    # DuckDB returns timestamptz values converted to the connection's TimeZone
    # setting, which defaults to the HOST's local zone (America/Sao_Paulo here) --
    # not a correctness bug, but it breaks a naive isoformat() string comparison
    # against the UTC-labelled reference.json keys unless pinned explicitly.
    con.execute("SET TimeZone='UTC';")
    con.execute(f"CREATE VIEW market_series AS SELECT * FROM read_parquet('{GLOB}', hive_partitioning=1)")
    all_ok = True

    t0 = time.perf_counter()
    n = con.execute("""
        SELECT count(*) FROM (
          SELECT DISTINCT ON (symbol, event_time) symbol, event_time, sum_open_interest, sum_open_interest_value
          FROM market_series
          WHERE fonte = 'q' AND available_at <= now()
          ORDER BY symbol, event_time, observed_at ASC
        ) t;
    """).fetchone()[0]
    dt = time.perf_counter() - t0
    print(f"[TIMING] full as_of backtest scan (local Parquet, no network): n={n} rows, {dt:.4f}s (budget: 60s)")
    all_ok &= dt <= 60 and n == 34496

    got_a = rows_to_dict(con, """
        SELECT event_time, sum_open_interest, sum_open_interest_value FROM (
          SELECT DISTINCT ON (event_time) event_time, sum_open_interest, sum_open_interest_value
          FROM market_series
          WHERE symbol = 'BTCUSDT' AND fonte = 'q'
            AND event_time IN (SELECT DISTINCT event_time FROM market_series WHERE poison_class = 'a')
            AND available_at <= (SELECT max(event_time) FROM market_series WHERE fonte='q' AND poison_class IS NULL AND symbol='BTCUSDT')
          ORDER BY event_time, observed_at ASC
        ) t ORDER BY event_time;
    """)
    all_ok &= compare("TEST A (late correction excluded, R-1)", got_a, REF["test_a"])

    got_b_final = rows_to_dict(con, """
        SELECT event_time, sum_open_interest, sum_open_interest_value FROM (
          SELECT DISTINCT ON (event_time) event_time, sum_open_interest, sum_open_interest_value
          FROM market_series
          WHERE symbol = 'BTCUSDT' AND fonte = 'q' AND is_final = true
            AND event_time IN (SELECT DISTINCT event_time FROM market_series WHERE poison_class = 'b')
          ORDER BY event_time, observed_at ASC
        ) t ORDER BY event_time;
    """)
    all_ok &= compare("TEST B final_only (partial ignored)", got_b_final, REF["test_b_final_only"])

    got_b_intra = rows_to_dict(con, """
        SELECT event_time, sum_open_interest, sum_open_interest_value FROM (
          SELECT DISTINCT ON (event_time) event_time, sum_open_interest, sum_open_interest_value
          FROM market_series
          WHERE symbol = 'BTCUSDT' AND fonte = 'q'
            AND event_time IN (SELECT DISTINCT event_time FROM market_series WHERE poison_class = 'b')
          ORDER BY event_time, observed_at ASC
        ) t ORDER BY event_time;
    """)
    all_ok &= compare("TEST B intrabar (partial WINS, must diverge from final_only)", got_b_intra, REF["test_b_intrabar"])
    diverges = got_b_final != got_b_intra
    print(f"  [{'PASS' if diverges else 'FAIL'}] TEST B final_only != intrabar (mode actually changes behavior): {diverges}")
    all_ok &= diverges

    n_leak = con.execute("""
        SELECT count(*) FROM market_series
        WHERE symbol = 'BTCUSDT' AND fonte = 'nq'
          AND event_time < (SELECT min(event_time) FROM market_series WHERE poison_class = 'c');
    """).fetchone()[0]
    print(f"  [{'PASS' if n_leak == 0 else 'FAIL'}] TEST C (SEM_FONTE, no fallback to q): rows leaked={n_leak} (expected 0)")
    all_ok &= n_leak == 0

    print(f"\nOVERALL: {'PASS' if all_ok else 'FAIL'}")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
