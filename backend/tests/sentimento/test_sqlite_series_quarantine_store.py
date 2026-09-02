"""`D2.6`: the store the one-shot writes into, and the falsifier that proves quarantine is real.

Plano 02: *"leitura de `backtest` sobre as duas séries recém-capturadas devolve ZERO linhas"*.
`backtest` does not exist as a module yet (it is a component `import-linter` already declares as
forbidden for `sentimento` to import from — `pyproject.toml`'s "Fronteira de contexto" contract),
so `read_promoted` is the shape a future `backtest` reader would call: `available_at IS NOT
NULL`. This file is the test that actually runs that query, over the two series this task
captures, and separately proves it is not vacuously empty by planting a row that DOES have
`available_at` set and confirming it comes back.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

from src.modules.sentimento.domain.coinalyze_daily_series import (
    LIQUIDATION_REQUIREMENT,
    OPEN_INTEREST_REQUIREMENT,
    DailyPoint,
    SeriesKind,
    evaluate_series_requirement,
)
from src.modules.sentimento.domain.quarantine_terms import COINALYZE_ONE_SHOT_TERMS
from src.modules.sentimento.domain.quarantined_series_entry import QuarantinedSeriesEntry
from src.modules.sentimento.infra.sqlite_series_quarantine_store import (
    SqliteSeriesQuarantineStore,
)

_RECEIVED_AT = "2026-09-01T12:00:00Z"
_RUN_ID = "run-t-02.2-test"


def _entry(symbol: str, kind: SeriesKind, n_points: int = 3) -> QuarantinedSeriesEntry:
    """Build a minimal, born-quarantined entry for `symbol`/`kind`."""
    points = tuple(
        DailyPoint(1_600_000_000 + day * 86_400, {"t": 1_600_000_000 + day * 86_400})
        for day in range(n_points)
    )
    requirement = (
        OPEN_INTEREST_REQUIREMENT if kind is SeriesKind.OPEN_INTEREST else LIQUIDATION_REQUIREMENT
    )
    return QuarantinedSeriesEntry(
        source="coinalyze",
        series_kind=kind,
        binance_symbol=symbol,
        coinalyze_symbol=f"{symbol}_PERP.A",
        points=points,
        requirement_verdict=evaluate_series_requirement(requirement, points),
        quarantine=COINALYZE_ONE_SHOT_TERMS,
        received_at=_RECEIVED_AT,
        run_id=_RUN_ID,
    )


def test_a_store_that_never_ran_reads_zero_rows_not_a_crash(tmp_path: Path) -> None:
    """Same guard as `SqliteIngestRecordStore`: absence reads as zero, never a traceback."""
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")

    assert store.read_promoted(SeriesKind.OPEN_INTEREST, "BTCUSDT") == ()


def test_d2_6_the_two_freshly_captured_series_read_zero_promoted_rows(tmp_path: Path) -> None:
    """THE FALSIFIER `plano 02` `D2.6` NAMES, over exactly the two series this task captures.

    If this returns ANY row, the physical isolation of quarantine does not exist — the
    three-term predicate would be a label, not a rule (plano 02, "Falsificador da fase").
    """
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")
    store.initialise()
    store.record(_entry("BTCUSDT", SeriesKind.OPEN_INTEREST, n_points=2500))
    store.record(_entry("BTCUSDT", SeriesKind.LIQUIDATION, n_points=730))

    assert store.read_promoted(SeriesKind.OPEN_INTEREST, "BTCUSDT") == ()
    assert store.read_promoted(SeriesKind.LIQUIDATION, "BTCUSDT") == ()


def test_the_query_is_not_vacuously_empty_a_planted_promoted_row_is_read_back(
    tmp_path: Path,
) -> None:
    """The other half of the falsifier: prove `read_promoted` CAN return a row.

    That is what makes its silence above EVIDENCE about quarantine, rather than evidence that
    the query is dead code. This writes directly through `sqlite3`, bypassing `record()` on
    purpose: `record()` can never write a promoted row (it takes `entry.available_at`, which is
    `None` unless `Q19` resolves the third quarantine term) — reaching a non-`NULL`
    `available_at` needs a lower-level write, exactly like a real promotion mechanism (out of
    this task's scope, per the handoff) eventually would.
    """
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")
    store.initialise()
    with sqlite3.connect(store.path) as connection:
        connection.execute(
            "INSERT INTO series_quarantine "
            "(source, series_kind, binance_symbol, coinalyze_symbol, points_json, n_points, "
            " first_point_date, requirement_met, label_shift_present, unit_present, "
            " available_at, received_at, run_id) "
            "VALUES ('coinalyze', 'open_interest', 'ETHUSDT', 'ETHUSDT_PERP.A', '[]', 0, "
            "        NULL, 1, 1, 1, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', 'promoted-run')"
        )
        connection.commit()

    rows = store.read_promoted(SeriesKind.OPEN_INTEREST, "ETHUSDT")

    assert len(rows) == 1
    assert rows[0][2] == "ETHUSDT"
    assert rows[0][6] == "2026-09-01T00:00:00Z"


def test_read_promoted_never_crosses_symbols_or_series_kinds(tmp_path: Path) -> None:
    """A promoted row for one (symbol, kind) must not leak into another's read."""
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")
    store.initialise()
    store.record(_entry("BTCUSDT", SeriesKind.OPEN_INTEREST))
    store.record(_entry("ETHUSDT", SeriesKind.OPEN_INTEREST))
    store.record(_entry("BTCUSDT", SeriesKind.LIQUIDATION))

    assert store.read_promoted(SeriesKind.OPEN_INTEREST, "BTCUSDT") == ()
    assert store.read_promoted(SeriesKind.OPEN_INTEREST, "ETHUSDT") == ()
    assert store.read_promoted(SeriesKind.LIQUIDATION, "BTCUSDT") == ()


def test_record_persists_the_raw_points_and_the_verdict(tmp_path: Path) -> None:
    """A round trip through `record()` — the store keeps what the entry gave it."""
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")
    store.initialise()
    entry = _entry("BTCUSDT", SeriesKind.OPEN_INTEREST, n_points=5)

    store.record(entry)

    with sqlite3.connect(store.path) as connection:
        row = connection.execute(
            "SELECT n_points, available_at, requirement_met, points_json "
            "FROM series_quarantine WHERE binance_symbol = 'BTCUSDT'"
        ).fetchone()

    assert row[0] == 5
    assert row[1] is None
    assert row[2] == 0  # 5 points does not meet the 2.400 floor
    assert row[3] == entry.points_json()


def test_record_is_idempotent_under_insert_or_replace(tmp_path: Path) -> None:
    """Re-running the one-shot for the same symbol replaces the row, never duplicates it."""
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")
    store.initialise()
    store.record(_entry("BTCUSDT", SeriesKind.OPEN_INTEREST, n_points=1))
    store.record(_entry("BTCUSDT", SeriesKind.OPEN_INTEREST, n_points=99))

    with sqlite3.connect(store.path) as connection:
        rows = connection.execute(
            "SELECT n_points FROM series_quarantine WHERE binance_symbol = 'BTCUSDT'"
        ).fetchall()

    assert rows == [(99,)]


def test_read_latest_returns_none_when_the_store_never_ran(tmp_path: Path) -> None:
    """`T-03.11`'s reconciliation path: absence still reads as `None`, never a traceback."""
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")

    assert store.read_latest(SeriesKind.LIQUIDATION, "BTCUSDT") is None


def test_read_latest_returns_the_quarantined_row_even_though_available_at_is_null(
    tmp_path: Path,
) -> None:
    """`T-03.11`'s handoff: reconciliation reads the quarantine DIRECTLY, not `read_promoted`.

    Every row `record()` writes has `available_at = NULL` (`D2.6`) — a `read_latest` that
    accidentally reused `_SELECT_PROMOTED`'s filter would return `None` here for every symbol
    this one-shot ever captures, which is exactly the bug this test exists to catch.
    """
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")
    store.initialise()
    entry = _entry("BTCUSDT", SeriesKind.LIQUIDATION, n_points=730)
    store.record(entry)

    row = store.read_latest(SeriesKind.LIQUIDATION, "BTCUSDT")

    assert row is not None
    assert row[2] == "BTCUSDT"
    assert row[4] == entry.points_json()
    assert row[6] is None  # available_at


def test_read_latest_never_crosses_symbols_or_series_kinds(tmp_path: Path) -> None:
    """A row for one `(symbol, kind)` must not leak into another's `read_latest`."""
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")
    store.initialise()
    store.record(_entry("BTCUSDT", SeriesKind.LIQUIDATION))
    store.record(_entry("ETHUSDT", SeriesKind.LIQUIDATION))
    store.record(_entry("BTCUSDT", SeriesKind.OPEN_INTEREST))

    btc_liquidation = store.read_latest(SeriesKind.LIQUIDATION, "BTCUSDT")

    assert btc_liquidation is not None
    assert btc_liquidation[2] == "BTCUSDT"
    assert btc_liquidation[1] == SeriesKind.LIQUIDATION.value


def test_read_latest_prefers_the_most_recently_received_row(tmp_path: Path) -> None:
    """`ORDER BY received_at DESC` — defensive, for the day `source` stops being a constant."""
    store = SqliteSeriesQuarantineStore(tmp_path / "quarantine.sqlite3")
    store.initialise()
    older = _entry("BTCUSDT", SeriesKind.LIQUIDATION, n_points=1)
    with closing(sqlite3.connect(store.path)) as connection:
        connection.execute(
            "INSERT INTO series_quarantine "
            "(source, series_kind, binance_symbol, coinalyze_symbol, points_json, n_points, "
            " first_point_date, requirement_met, label_shift_present, unit_present, "
            " available_at, received_at, run_id) "
            "VALUES ('coinalyze-superseded', 'liquidation', 'BTCUSDT', 'BTCUSDT_PERP.A', "
            "        '[]', 0, NULL, 0, 1, 1, NULL, '2026-08-01T00:00:00Z', 'run-old')"
        )
        connection.commit()
    store.record(older)

    row = store.read_latest(SeriesKind.LIQUIDATION, "BTCUSDT")

    assert row is not None
    assert row[7] == _RECEIVED_AT  # the newer, record()-written row wins
