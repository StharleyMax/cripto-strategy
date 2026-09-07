"""`QuarantineRow`/`SeriesQuarantineReport`: the read-side shape of `GET /series-quarantine`.

`SPEC-003` s3.6, "fechado na forma": `{"query": "series_quarantine", "n_rows": N, "rows":
[{source, series_kind, binance_symbol, coinalyze_symbol, n_points, recorded_at, terms…}]}`,
`points_json` NEVER included. `terms…` is `QuarantineTerms` (`quarantine_terms.py`) spread
inline, camelCased — the TS mirror (`quarantine.ts:15`) already documents `QuarantineTerms` as
an ordinary domain type, not a stored-column shape, so it is cased like one here too, the same
way `_GAP_FIELD_BY_COLUMN` in `ingest_record.py` keeps a wire key distinct from its Python field
where the two are not the same kind of name.

`QuarantineRow` is DELIBERATELY a different type from `QuarantinedSeriesEntry`
(`quarantined_series_entry.py`): that one is the WRITE side and carries the raw points plus the
full `SeriesRequirementVerdict` (`n_points` is derived from `len(points)` there). This is the
READ side — what `SqliteSeriesQuarantineStore.list_all()` returns — and it never carries a
point at all, because the query behind it (`_SELECT_ALL`) never selects `points_json`. The
`D3.2` guarantee lives in that query, not in this module remembering to drop a field.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.modules.sentimento.domain.coinalyze_daily_series import SeriesKind
from src.modules.sentimento.domain.quarantine_terms import QuarantineTerms

# The query name this report answers under — mirrors `INGEST_HEALTH_QUERY_NAME`
# (`use_cases/ingest_health.py`): fixed once, here, so the route and any future second consumer
# read it off the same constant rather than each spelling the string by hand.
SERIES_QUARANTINE_QUERY_NAME = "series_quarantine"


@dataclass(frozen=True)
class QuarantineRow:
    """One row of `list_all()`.

    Never `points_json`, never `run_id`: `_SELECT_ALL` selects neither.
    """

    source: str
    series_kind: SeriesKind
    binance_symbol: str
    coinalyze_symbol: str
    n_points: int
    terms: QuarantineTerms
    recorded_at: str

    def to_wire(self) -> dict[str, object]:
        """Project one row onto the wire dict `SPEC-003` s3.6 fixes, in the order it fixes them.

        `terms` is spread inline and camelCased (`labelShiftPresent`/`unitPresent`/
        `availableAtPresent`) — the same three names `quarantine.ts`'s `QuarantineTerms`
        interface already uses, so a future TS parser reads this dict without a translation
        table.
        """
        return {
            "source": self.source,
            "series_kind": self.series_kind.value,
            "binance_symbol": self.binance_symbol,
            "coinalyze_symbol": self.coinalyze_symbol,
            "n_points": self.n_points,
            "recorded_at": self.recorded_at,
            "labelShiftPresent": self.terms.label_shift_present,
            "unitPresent": self.terms.unit_present,
            "availableAtPresent": self.terms.available_at_present,
        }


@dataclass(frozen=True)
class SeriesQuarantineReport:
    """What `series_quarantine_query` returns — the whole quarantine table, one row per entry."""

    rows: tuple[QuarantineRow, ...]

    def to_envelope(self) -> dict[str, object]:
        """Return the `GET /series-quarantine` envelope `SPEC-003` s3.6 fixes.

        The shape is `{"query", "n_rows", "rows"}`. `points_json` cannot appear here even if a
        future edit tried to add it by hand:
        `QuarantineRow` (`self.rows`' element type) has no such field to read.
        """
        return {
            "query": SERIES_QUARANTINE_QUERY_NAME,
            "n_rows": len(self.rows),
            "rows": [row.to_wire() for row in self.rows],
        }
