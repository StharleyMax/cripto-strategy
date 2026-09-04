#!/usr/bin/env python3
"""FA-3b (`ADR-002`, emenda "D6 CONCRETIZADA para o candidato 4", `T-08.3`/`CST-71`).

Falsifier: "uma `compress_chunk` real (TimescaleDB, não simulada) sobre uma partição com N
linhas produzindo `content_hash` diferente quando calculado com `ORDER BY` explícito e
determinístico". This script runs it FOR REAL, against the same TimescaleDB image the `T-08.1`
spike used, and — deliberately, so the falsifier tests the SHIPPED code and not a
reimplementation of it — imports `compute_content_hash` directly from
`backend/src/modules/sentimento/domain/partition_registry.py` rather than recomputing a hash by
hand in this script.

WHY THIS IS A STANDALONE SCRIPT AND NOT A `pytest` TEST: `backend/scripts/test.sh` runs with
`socket` amputated ("ZERO REDE" — see that script's own header), so a real Postgres connection
over TCP, even to `127.0.0.1`, cannot run inside that suite. This mirrors the spike's own
`verify_timescale.py`, which is likewise never called by `test.sh` — both are run BY HAND, with
the result transcribed into the ADR/gate report, never asserted by a portão this repository
claims runs automatically.

WHY SYNTHETIC DATA, UNLIKE THE SPIKE'S REAL BINANCE OI: `ADR-002/D4`'s five criteria measure
properties of the ENGINE against a market-shaped dataset (space, backtest latency, bitemporal
correctness) — realism of the numbers mattered. `FA-3b` measures a different property:
whether `compress_chunk` (a lossless, row-count-preserving recode) moves a hash computed with
an explicit `ORDER BY`. That property does not depend on the values being real market numbers,
only on there being enough rows, across enough distinct `(event_time, observed_at, symbol)`
combinations, for `compress_chunk`'s columnar segmentation to actually engage — the same
reason the spike itself found synthetic-shaped rows sufficient for the fixture classes.

USAGE (no network beyond the LOCAL Docker daemon; `timescale/timescaledb:2.17.2-pg15` is
already the spike's cached image):

    python3 verify_compaction_epoch.py
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import psycopg

# `domain/partition_registry.py` has ZERO third-party dependencies (stdlib only — `Natureza`
# in `backend/pyproject.toml` forbids `domain` from importing anything that would need one), so
# importing it from a plain `python3` outside `backend/.venv` is safe: nothing here needs
# `backend/pyproject.toml`'s dependency set, only its `src` package layout.
BACKEND_ROOT = Path(__file__).resolve().parents[3] / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.modules.sentimento.domain.partition_registry import compute_content_hash  # noqa: E402

CONTAINER_NAME = "verify-compaction-epoch-ts"
HOST_PORT = 15434
IMAGE = "timescale/timescaledb:2.17.2-pg15"
DSN = f"host=127.0.0.1 port={HOST_PORT} user=postgres password=spike dbname=spike"

# Synthetic, labeled as such (see module docstring): 2 symbols x 3 days x 288 5-min buckets =
# 1.728 rows, enough for `compress_chunk`'s columnar segmentation to engage per `symbol,fonte`
# (`ADR-002` "Emenda T-08.1", the finding about 31 tiny chunks starving compression at low
# row counts per segment) — this spike's chunk is one 45-day chunk holding all 1.728 rows, so
# the segment-starvation failure mode does not apply here either way.
SYMBOLS = ("BTCUSDT", "ETHUSDT")
DAYS = 3
BUCKETS_PER_DAY = 288  # 5-minute buckets over 24h

SCHEMA_SQL = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")

# The four `CONTENT_HASH_ORDER_KEYS` `D6c` names, mapped onto THIS spike's column names —
# `fonte` is the pre-existing spike schema's name for what `D6c` calls `source`.
_HASH_QUERY = """
    SELECT event_time, observed_at, fonte AS source, symbol,
           sum_open_interest, sum_open_interest_value
    FROM market_series
    WHERE symbol = %s AND fonte = %s
    ORDER BY event_time, observed_at, fonte, symbol
"""


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, check=False)


def _start_container() -> None:
    _run(["docker", "rm", "-f", CONTAINER_NAME])  # idempotent: clear a stale run
    result = _run(
        [
            "docker",
            "run",
            "-d",
            "--name",
            CONTAINER_NAME,
            "-e",
            "POSTGRES_PASSWORD=spike",
            "-e",
            "POSTGRES_USER=postgres",
            "-e",
            "POSTGRES_DB=spike",
            "-p",
            f"{HOST_PORT}:5432",
            IMAGE,
        ]
    )
    if result.returncode != 0:
        raise RuntimeError(f"docker run failed: {result.stderr}")
    # Poll with a REAL connection attempt, not `pg_isready` — Postgres's own startup sequence
    # accepts TCP, restarts once to apply `initdb`, and only THEN serves queries; `pg_isready`
    # returned success during the brief window between those two starts and the actual connect
    # below still failed [MEDIDO nesta execucao: `pg_isready` PASS seguido de
    # `OperationalError: server closed the connection unexpectedly`]. A real `connect()` cannot
    # be fooled by that intermediate window because it IS the thing being waited for.
    deadline = time.monotonic() + 60
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with psycopg.connect(DSN, connect_timeout=2):
                return
        except psycopg.OperationalError as exc:
            last_error = exc
            time.sleep(0.5)
    raise RuntimeError(f"TimescaleDB container did not become ready within 60s: {last_error}")


def _stop_container() -> None:
    _run(["docker", "rm", "-f", CONTAINER_NAME])


def _seed(conn: psycopg.Connection) -> int:
    """Load the schema and insert the synthetic dataset; return the row count inserted."""
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
        # Built via SQL `generate_series` rather than looping in Python and sending 1.728
        # individual timestamp strings — fewer places for a timezone/format bug to hide, and
        # the generated rows are exactly the shape `market_series` expects.
        cur.execute(
            """
            INSERT INTO market_series
                (event_time, symbol, sum_open_interest, sum_open_interest_value,
                 bucket_end, available_at, observed_at, is_final, fonte)
            SELECT
                ts,
                symbol,
                1000.0 + (extract(epoch FROM ts)::bigint %% 97),
                50000000.0 + (extract(epoch FROM ts)::bigint %% 1009) * 10,
                ts + interval '5 minutes' - interval '1 millisecond',
                ts + interval '5 minutes',
                ts + interval '5 minutes 30 seconds',
                true,
                'q'
            FROM generate_series(
                timestamptz '2026-09-01 00:00:00+00',
                timestamptz '2026-09-01 00:00:00+00'
                    + (%(days)s * %(buckets)s - 1) * interval '5 minutes',
                interval '5 minutes'
            ) AS ts
            CROSS JOIN unnest(%(symbols)s::text[]) AS symbol
            """,
            {"days": DAYS, "buckets": BUCKETS_PER_DAY, "symbols": list(SYMBOLS)},
        )
        conn.commit()
        cur.execute("SELECT count(*) FROM market_series")
        (count,) = cur.fetchone()
        return int(count)


def _partition_hash(conn: psycopg.Connection, symbol: str, source: str) -> str:
    with conn.cursor() as cur:
        cur.execute(_HASH_QUERY, (symbol, source))
        columns = [d.name for d in cur.description]
        projected_rows = []
        for record in cur.fetchall():
            row = dict(zip(columns, record, strict=True))
            row["event_time"] = row["event_time"].isoformat()
            row["observed_at"] = row["observed_at"].isoformat()
            projected_rows.append(row)
    return compute_content_hash(projected_rows)


def main() -> int:
    """Run FA-3b end to end; return `0` on PASS, `1` on FAIL — never silent either way."""
    print(f"[SETUP] starting {IMAGE} as {CONTAINER_NAME} on 127.0.0.1:{HOST_PORT}")
    _start_container()
    all_ok = True
    try:
        with psycopg.connect(DSN) as conn:
            n = _seed(conn)
            print(f"[SETUP] seeded {n} synthetic rows across {SYMBOLS}")

            hashes_before = {
                symbol: _partition_hash(conn, symbol, "q") for symbol in SYMBOLS
            }
            for symbol, digest in hashes_before.items():
                print(f"[BEFORE] {symbol}: content_hash={digest}")

            with conn.cursor() as cur:
                cur.execute("SELECT compress_chunk(c) FROM show_chunks('market_series') c;")
                conn.commit()
            print("[ACTION] compress_chunk executed on every chunk of market_series")

            hashes_after_compress = {
                symbol: _partition_hash(conn, symbol, "q") for symbol in SYMBOLS
            }
            for symbol in SYMBOLS:
                same = hashes_after_compress[symbol] == hashes_before[symbol]
                print(
                    f"[{'PASS' if same else 'FAIL'}] {symbol}: content_hash "
                    f"{'UNCHANGED' if same else 'CHANGED'} across compress_chunk "
                    f"({hashes_before[symbol]} -> {hashes_after_compress[symbol]})"
                )
                all_ok &= same

            with conn.cursor() as cur:
                cur.execute("SELECT decompress_chunk(c) FROM show_chunks('market_series') c;")
                conn.commit()
            print("[ACTION] decompress_chunk executed on every chunk of market_series")

            hashes_after_decompress = {
                symbol: _partition_hash(conn, symbol, "q") for symbol in SYMBOLS
            }
            for symbol in SYMBOLS:
                same = hashes_after_decompress[symbol] == hashes_before[symbol]
                print(
                    f"[{'PASS' if same else 'FAIL'}] {symbol}: content_hash "
                    f"UNCHANGED across compress+decompress: {same}"
                )
                all_ok &= same

            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM market_series")
                (final_count,) = cur.fetchone()
            row_count_preserved = final_count == n
            print(
                f"[{'PASS' if row_count_preserved else 'FAIL'}] row_count preserved "
                f"(lossless, D6a): {n} -> {final_count}"
            )
            all_ok &= row_count_preserved
    finally:
        _stop_container()
        print(f"[TEARDOWN] removed container {CONTAINER_NAME}")

    print(f"OVERALL: {'PASS' if all_ok else 'FAIL'}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
