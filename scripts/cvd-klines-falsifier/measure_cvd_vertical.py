"""The CVD vertical, end to end, on REAL Binance data and a REAL Postgres engine.

`T-02.3`/`T-02.4`, phase `02` of `SPEC-007`. This closes the MECHANISM of `DoD 1`, `DoD 2` and
`DoD 4` with a number, using the production components at every step:

    /fapi/v1/klines (real)  ->  build_klines_to_rows (real mapping)
                            ->  PostgresSeriesSink (real writer sink, real TimescaleDB)
                            ->  PostgresSeriesWindowReader + build_series_history_report (real
                                read path, the one `/api/v1/series-history` calls)

⛔ WHAT THIS IS NOT: it is NOT the production measurement. The database is a throwaway container
started and destroyed by this script, exactly the idiom `test_postgres_series_window_reader.py`
already uses — deliberately, because seeding the shared Postgres is forbidden and because a
worktree must not become the compose project directory of the owner's stack (the defect
`gates/T-01.10-infra.md` §"consequência" records). The production numbers are `T-02.7`'s, taken
from the canonical checkout after this branch merges; this script proves the mechanism those
numbers will measure.

The data written IS real: real klines for the four pilot symbols, fetched live. Nothing here is
synthetic, so a zero at the end would be a real zero.
"""

from __future__ import annotations

import subprocess
import sys
import time
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

import psycopg  # noqa: E402

from src.modules.sentimento.domain.as_of_accessor import BarPolicy  # noqa: E402
from src.modules.sentimento.domain.cvd_source_catalog import (  # noqa: E402
    build_kline_takerbuy_entry,
)
from src.modules.sentimento.domain.instrument import base_asset  # noqa: E402
from src.modules.sentimento.domain.klines_volume_catalog import (  # noqa: E402
    build_klines_volume_entry,
)
from src.modules.sentimento.infra.binance_klines_client import BinanceKlinesClient  # noqa: E402
from src.modules.sentimento.infra.postgres_series_sink import (  # noqa: E402
    PostgresSeriesSink,
    ensure_schema,
)
from src.modules.sentimento.infra.postgres_series_window_reader import (  # noqa: E402
    PostgresSeriesWindowReader,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (  # noqa: E402
    INITIAL_SYMBOLS,
    build_klines_to_rows,
)
from src.modules.sentimento.use_cases.series_catalog import (  # noqa: E402
    list_pilot_series_catalog,
)

IMAGE = "timescale/timescaledb:2.17.2-pg15"
TAIL_BARS = 300
# The measured publication lag of `/fapi/v1/klines` `[MEDIDO 2026-09-10, T-01.3]`: the newest
# element of a page is the minute in progress, ~58 s behind the wall clock.
PUBLICATION_LAG_MS = 58_000
KLINES_VOLUME_VERIFIED_BY = "test_klines_volume_catalog.py"


def _docker(*args: str) -> subprocess.CompletedProcess[str]:
    """Run one `docker` subcommand, capturing output."""
    return subprocess.run(["docker", *args], capture_output=True, text=True, timeout=120)  # noqa: S603, S607


def _start_postgres() -> tuple[str, str]:
    """Start a throwaway TimescaleDB and return `(container_name, conninfo)`."""
    name = f"cvd-vertical-{uuid.uuid4().hex[:8]}"
    started = _docker(
        "run", "-d", "--rm", "--name", name,
        "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_USER=test", "-e", "POSTGRES_DB=test",
        "-p", "127.0.0.1::5432", IMAGE,
    )  # fmt: skip
    if started.returncode != 0:
        raise RuntimeError(f"could not start {IMAGE}: {started.stderr.strip()}")
    host_port = _docker("port", name, "5432/tcp").stdout.strip().rsplit(":", maxsplit=1)[-1]
    conninfo = f"host=127.0.0.1 port={host_port} dbname=test user=test password=test"
    deadline = time.monotonic() + 60.0
    while True:
        try:
            psycopg.connect(conninfo, connect_timeout=3).close()
            return name, conninfo
        except psycopg.Error:
            if time.monotonic() > deadline:
                raise
            time.sleep(0.5)


def main() -> int:
    """Write real klines-borne rows into a real engine and read them back through the API path."""
    name, conninfo = _start_postgres()
    try:
        connection = psycopg.connect(conninfo)
        ensure_schema(connection)
        sink = PostgresSeriesSink(connection)
        to_rows = build_klines_to_rows()
        client = BinanceKlinesClient()

        n_written = 0
        symbols = sorted(INITIAL_SYMBOLS)
        for symbol in symbols:
            page = client.klines(symbol, "1m", TAIL_BARS)
            # ── WHY EACH BAR IS PUBLISHED AT ITS OWN INSTANT, NOT ALL AT ONCE ─────────────
            #
            # Handing the whole page to the mapping with a single `received_at = now` is a
            # BOOT BACKFILL, and this repository has already measured what that does to the
            # read path: `available_at` becomes "when we fetched", so `as_of`'s anti-lookahead
            # rule `R-1` (`available_at <= t`) correctly refuses every bucket at its own grid
            # instant, and `n_points` collapses to 1 — `handoff/ACHADO-BACKFILL-INVISIVEL-AO-
            # AS-OF.md`, `[MEDIDO 2026-09-11: 769 pontos legiveis de 5.761 grades]`. That is a
            # PRE-EXISTING defect of the volume series, NOT of CVD, and `D15`/`D17` put it
            # explicitly out of this phase's scope (the base is to be truncated and reingested).
            #
            # So the loop below reproduces the LIVE CADENCE instead: one publication per bar,
            # at `bucket_end + 58 s`, which is the measured publication lag of this endpoint
            # `[MEDIDO 2026-09-10, T-01.3]`. That is what 300 consecutive 60-second cycles of
            # the deployed collector produce, and it is the regime `DoD 2`/`DoD 3` will be
            # measured in once this branch is deployed.
            for kline in page.rows:
                received_at = kline.close_time_ms + PUBLICATION_LAG_MS
                for row in to_rows(received_at, symbol, (kline,)):
                    sink.accept(row)
                    n_written += 1
            print(f"{symbol}: {len(page.rows)} bars returned, published at the live cadence")

        print(f"DoD-4 n_written = {n_written}")

        reader = PostgresSeriesWindowReader(connection)
        catalog = list_pilot_series_catalog()
        now_ms = int(time.time() * 1000)
        window_start = now_ms - TAIL_BARS * 60_000
        for symbol in symbols:
            unit = base_asset(symbol)
            cvd_id = build_kline_takerbuy_entry(symbol, unit=unit).key.series_key_id()
            volume_id = build_klines_volume_entry(
                symbol, unit=unit, verified_by=KLINES_VOLUME_VERIFIED_BY
            ).key.series_key_id()

            with connection.cursor() as cursor:
                cursor.execute(
                    "select count(*) from md.series where series_key_id = %s", (cvd_id,)
                )
                stored = cursor.fetchone()[0]  # type: ignore[index]

            report = build_series_history_report_for(catalog, reader, cvd_id, symbol,
                                                     window_start, now_ms)
            print(
                f"{symbol}: DoD-1 count(*) for cvd_source/klines = {stored} · "
                f"DoD-2 n_points = {report} · (volume id {volume_id[:12]}…)"
            )
        return 0
    finally:
        _docker("rm", "-f", name)


def build_series_history_report_for(catalog, reader, series_key_id, symbol, start_ms, end_ms):  # noqa: ANN001, ANN201
    """Call the REAL read path `/api/v1/series-history` uses and return its `n_points`."""
    from src.modules.sentimento.use_cases.series_history import build_series_history_report

    report = build_series_history_report(
        catalog,
        reader,
        series_key_id=series_key_id,
        symbol=symbol,
        interval="1m",
        window_start_ms=start_ms,
        window_end_ms=end_ms,
        knowledge_time_ms=end_ms,
        bar_policy=BarPolicy.FINAL_ONLY,
    )
    # `n_points` in `DoD 2` is what the chart can actually plot: rows whose `value` is not
    # `None`. Counting `rows` instead would count the grid, which is never zero and would make
    # the DoD unfalsifiable.
    return sum(1 for row in report.rows if row.value is not None)


if __name__ == "__main__":
    raise SystemExit(main())
