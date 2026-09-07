"""Durable quarantine for the Coinalyze one-shot — `available_at` stays `NULL`, and that is it."""

# `SqliteIngestRecordStore` is the sibling this module copies its shape from: SQLite as the
# engine (`ADR-014/D1c`'s argument — the record is capture-or-lose, so it must not wait on a
# spike that has not landed — applies here just as much: a symbol swept once at real cost is
# exactly as irreplaceable as an `ingest_run` row), one connection per call, `sqlite_master`
# used as the crash-safe guard between "never ran" and "ran and is empty".
#
# `D2.6` (plano 02) is this module's whole reason to exist: *"leitura de `backtest` sobre as
# duas séries recém-capturadas devolve ZERO linhas"*. `read_promoted` is the query a future
# `backtest` consumer would run, and it filters on `available_at IS NOT NULL` — the same column
# this task never sets. `record()` cannot write a promoted row by construction (it takes a
# `QuarantinedSeriesEntry`, whose `available_at` is `None` unless `Q19` resolves the third
# quarantine term), so `read_promoted` returning rows would mean either this store's SQL is
# wrong or something outside this task's code path wrote directly to the table — either way, the
# falsifier this task's DoD asks for.

from __future__ import annotations

import logging
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Final, cast

from src.modules.sentimento.domain.coinalyze_daily_series import SeriesKind
from src.modules.sentimento.domain.quarantine_terms import QuarantineTerms
from src.modules.sentimento.domain.quarantined_series_entry import QuarantinedSeriesEntry
from src.modules.sentimento.domain.series_quarantine_report import QuarantineRow

logger = logging.getLogger(__name__)

_TABLE: Final[str] = "series_quarantine"
_SELECT_TABLE_PRESENCE: Final[str] = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"

_DDL: Final[str] = """
CREATE TABLE IF NOT EXISTS series_quarantine (
    source           TEXT NOT NULL,
    series_kind      TEXT NOT NULL,
    binance_symbol   TEXT NOT NULL,
    coinalyze_symbol TEXT NOT NULL,
    points_json      TEXT NOT NULL,
    n_points         INTEGER NOT NULL,
    first_point_date TEXT,
    requirement_met  INTEGER NOT NULL,
    label_shift_present INTEGER NOT NULL,
    unit_present     INTEGER NOT NULL,
    available_at     TEXT,
    received_at      TEXT NOT NULL,
    run_id           TEXT NOT NULL,
    PRIMARY KEY (source, series_kind, binance_symbol)
)
"""

_INSERT: Final[str] = (
    "INSERT OR REPLACE INTO series_quarantine "
    "(source, series_kind, binance_symbol, coinalyze_symbol, points_json, n_points, "
    " first_point_date, requirement_met, label_shift_present, unit_present, available_at, "
    " received_at, run_id) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

# `available_at IS NOT NULL` IS THE PROMOTION GATE. This is the one line `D2.6`'s falsifier
# exists to exercise: a row this task writes always has `available_at = NULL`
# (`domain/quarantine_terms.py`'s `COINALYZE_ONE_SHOT_TERMS`), so this query returns zero rows
# for every symbol this one-shot ever captures — and a planted row that DOES set `available_at`
# proves the query is not vacuously empty by construction.
_SELECT_PROMOTED: Final[str] = (
    "SELECT source, series_kind, binance_symbol, coinalyze_symbol, points_json, n_points, "
    "       available_at, received_at, run_id "
    "FROM series_quarantine "
    "WHERE series_kind = ? AND binance_symbol = ? AND available_at IS NOT NULL "
    "ORDER BY received_at, run_id"
)

# `T-03.4`'s `GET /series-quarantine`: every row of the table, for the gaveta view — and the
# ONE guarantee `D3.2` asks for lives HERE, in the query, not in a projection step downstream
# that might forget to drop a field. `points_json` is not named in the `SELECT` list, so no
# caller of `list_all()` can leak it by omission; a route built on this method is incapable of
# emitting it, the same class of guarantee `INGEST_HEALTH_RUN_COLUMNS` gives the ingest report
# by never including `agg_id`/`price`/`qty` in the first place. Ordered by the table's own
# PRIMARY KEY (`source, series_kind, binance_symbol`) rather than `received_at`: a table DUMP
# needs a deterministic order that does not depend on write order, unlike `_SELECT_PROMOTED`
# and `_SELECT_LATEST_QUARANTINED`, which are keyed lookups for one `(series_kind, symbol)`.
_SELECT_ALL: Final[str] = (
    "SELECT source, series_kind, binance_symbol, coinalyze_symbol, n_points, "
    "       label_shift_present, unit_present, available_at, received_at "
    "FROM series_quarantine "
    "ORDER BY source, series_kind, binance_symbol"
)

# `T-03.11`'s reconciliation reads the quarantine DIRECTLY — the handoff is explicit this is a
# DIFFERENT path from `read_promoted`: "lê da quarentena diretamente... não é o mesmo caminho que
# `backtest` usaria... não tente 'promover' a série aqui". No `available_at` filter, on purpose:
# every row this one-shot ever writes has `available_at = NULL` (`QuarantinedSeriesEntry
# .available_at`), so `read_promoted` would always return `()` for it — that is `D2.6`'s whole
# point, and exactly why this query cannot reuse it.
_SELECT_LATEST_QUARANTINED: Final[str] = (
    "SELECT source, series_kind, binance_symbol, coinalyze_symbol, points_json, n_points, "
    "       available_at, received_at, run_id "
    "FROM series_quarantine "
    "WHERE series_kind = ? AND binance_symbol = ? "
    "ORDER BY received_at DESC, run_id DESC "
    "LIMIT 1"
)

_RowTuple = tuple[str, str, str, str, str, int, str, str, str]

# `list_all()`'s own row shape — no `points_json`, no `run_id`: `_SELECT_ALL` never selects
# either, so this tuple's 9 positions are exactly what it returns, in order.
_ListAllRowTuple = tuple[str, str, str, str, int, int, int, str | None, str]


class SqliteSeriesQuarantineStore:
    """One SQLite file, one table, written by the one-shot and read by whoever checks quarantine."""

    def __init__(self, path: Path) -> None:
        """Bind the store to `path`; nothing is created or read until a method is called."""
        self._path = path

    @property
    def path(self) -> Path:
        """Return the database file this store reads and writes."""
        return self._path

    def initialise(self) -> None:
        """Create the table if it is absent — idempotent, safe to call before every run."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self._path)) as connection:
            connection.execute(_DDL)
            connection.commit()

    def record(self, entry: QuarantinedSeriesEntry) -> None:
        """Persist one captured series and COMMIT before returning.

        `available_at` is read from `entry.available_at`, never hardcoded here: the store does
        not decide quarantine, it stores whatever the domain entry already decided
        (`quarantine_terms.py` owns that decision).
        """
        first_point_date = (
            entry.requirement_verdict.first_point_date.isoformat()
            if entry.requirement_verdict.first_point_date is not None
            else None
        )
        with closing(sqlite3.connect(self._path)) as connection:
            connection.execute(
                _INSERT,
                (
                    entry.source,
                    entry.series_kind.value,
                    entry.binance_symbol,
                    entry.coinalyze_symbol,
                    entry.points_json(),
                    entry.n_points,
                    first_point_date,
                    int(entry.requirement_verdict.met),
                    int(entry.quarantine.label_shift_present),
                    int(entry.quarantine.unit_present),
                    entry.available_at,
                    entry.received_at,
                    entry.run_id,
                ),
            )
            connection.commit()
        logger.debug(
            "series_quarantine_recorded",
            extra={
                "source": entry.source,
                "series_kind": entry.series_kind.value,
                "binance_symbol": entry.binance_symbol,
                "n_points": entry.n_points,
                "quarantined": entry.quarantine.is_quarantined,
            },
        )

    def read_promoted(self, series_kind: SeriesKind, binance_symbol: str) -> tuple[_RowTuple, ...]:
        """Return rows a `backtest`-shaped reader would see: `available_at IS NOT NULL` only.

        `D2.6` is this exact call, over the two series this task captures: it MUST return `()`
        for every symbol this one-shot has written, because nothing in this task's code path
        ever sets `available_at`.
        """
        rows = self._fetch(_SELECT_PROMOTED, (series_kind.value, binance_symbol))
        return tuple(cast(_RowTuple, row) for row in rows)

    def read_latest(self, series_kind: SeriesKind, binance_symbol: str) -> _RowTuple | None:
        """Return the most recent quarantined row for `(series_kind, binance_symbol)`.

        Any `available_at` — `None`, never a raised error, when nothing was ever written for
        this pair, the same "never-ran reads as empty" contract `_fetch` already gives
        `read_promoted`. This is NOT the query a `backtest`-shaped reader would run (see the
        module-level comment above `_SELECT_LATEST_QUARANTINED`); it is `T-03.11`'s
        reconciliation reading the quarantine on its own, declared path.
        """
        rows = self._fetch(_SELECT_LATEST_QUARANTINED, (series_kind.value, binance_symbol))
        return cast(_RowTuple, rows[0]) if rows else None

    def list_all(self) -> tuple[QuarantineRow, ...]:
        """Return every row of the table, `points_json` NEVER among them (`D3.2`).

        This is the porta `GET /series-quarantine` reads through `series_quarantine_query`
        (`use_cases/series_quarantine.py`) — a store that never ran reads as `()`, the same
        "absence is empty, not a crash" contract `_fetch` already gives every other read here.
        """
        rows = self._fetch(_SELECT_ALL, ())
        return tuple(_row_to_quarantine_row(cast(_ListAllRowTuple, row)) for row in rows)

    def _fetch(self, statement: str, parameters: tuple[object, ...]) -> list[tuple[object, ...]]:
        """Run a read statement, treating a store that never ran as zero rows, not a crash.

        Same guard as `SqliteIngestRecordStore._fetch`, and for the same reason: a `SIGKILL`
        between `sqlite3.connect` creating the file and `initialise()`'s `CREATE TABLE`
        committing leaves a file that exists with no schema, and that is the SAME semantic
        state as "this one-shot never ran" — both must answer "zero rows", never a traceback.
        """
        if not self._path.exists():
            return []
        with closing(sqlite3.connect(self._path)) as connection:
            if connection.execute(_SELECT_TABLE_PRESENCE, (_TABLE,)).fetchone() is None:
                return []
            return list(connection.execute(statement, parameters).fetchall())


def _row_to_quarantine_row(row: _ListAllRowTuple) -> QuarantineRow:
    """Convert one `_SELECT_ALL` row into the typed read model `list_all()` returns.

    The two SQLite `INTEGER` columns (`label_shift_present`, `unit_present`) are `0`/`1`, never
    `NULL` (the `_DDL` marks both `NOT NULL`) — `bool(...)` is a safe, total conversion.
    `available_at_present` is NOT a stored column: it is derived from `available_at IS NOT
    NULL`, the exact same reading `QuarantinedSeriesEntry.available_at` and `_SELECT_PROMOTED`
    already give that column everywhere else in this module.
    """
    (
        source,
        series_kind,
        binance_symbol,
        coinalyze_symbol,
        n_points,
        label_shift_present,
        unit_present,
        available_at,
        received_at,
    ) = row
    return QuarantineRow(
        source=source,
        series_kind=SeriesKind(series_kind),
        binance_symbol=binance_symbol,
        coinalyze_symbol=coinalyze_symbol,
        n_points=n_points,
        terms=QuarantineTerms(
            label_shift_present=bool(label_shift_present),
            unit_present=bool(unit_present),
            available_at_present=available_at is not None,
        ),
        recorded_at=received_at,
    )
