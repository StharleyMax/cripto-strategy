"""`build_series_history_report`: the use case behind `GET /series-history` (`ADR-034/D9`, item 2).

For every 1-minute grid instant in the requested window, this module calls `as_of()`
(`domain/as_of_accessor.py`) with `purpose=RENDERING` and projects the result onto the
discriminated pair `ADR-034/D5` fixes. `as_of` is pure — it never touches a store — so this
module needs the observations already loaded, which is exactly what `SeriesWindowReader`
(the port `infra/postgres_series_window_reader.py` implements) supplies.

`ADR-034/D6`: F1 serves the NATIVE 1-minute grid only — `interval` outside `{"1m"}` is refused
here as a second line of defence, even though the route (`src.api.routes.series_history`)
already restricts the FastAPI query parameter to the literal `"1m"` before this function is
ever called. A use case that trusted its caller completely would be untestable on its own.
"""

from __future__ import annotations

from typing import Protocol, cast

from src.modules.sentimento.domain.as_of_accessor import (
    BarPolicy,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    as_of,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog
from src.modules.sentimento.domain.series_history_report import (
    SeriesHistoryReport,
    SeriesHistoryRow,
)

# `CVD_BUCKET_WIDTH_MS` (`domain/cvd.py:31`) transcribed, not imported: that constant is `cvd`'s
# own "NOT a parameter" fact about ONE metric, while this module's grid applies to every series
# `md.series` stores at F1 (price and OI share the same 1-minute native cadence — `ADR-034/D6`
# scopes the REAGGREGATION restriction to CVD specifically, not the grid width itself, which
# `postgres_series_sink.py`'s hypertable already fixes at 1 minute for everything it stores).
_GRID_STEP_MS = 60_000

# `ADR-034/D6`: the only `interval` F1/F2 serve. A request for anything else is refused with a
# named `422` by the route; this constant is what both the route's `Literal["1m"]` annotation
# and this defence-in-depth check are checked against, so the two can never silently drift.
SUPPORTED_INTERVAL = "1m"


class UnknownSeriesKeyIdError(Exception):
    """`series_key_id` has no row in the catalog: the caller asked for a series never cataloged."""


class UnsupportedIntervalError(Exception):
    """`interval` is not `"1m"` — `ADR-034/D6` refuses rather than silently subestimating a sum."""


class InvalidWindowError(Exception):
    """`window_start_ms` is not strictly before `window_end_ms` — there is no grid to read."""


class SeriesWindowReader(Protocol):
    """Read port over `md.series`: every observation covering a window plus its lookback.

    `infra/postgres_series_window_reader.PostgresSeriesWindowReader` satisfies this
    structurally — the same "name the port here, wire the adapter at composition" shape
    `QuarantineSource`/`IngestRecordSource` already use in their own use-case modules.
    """

    def read_window(  # noqa: D102
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]: ...


def _first_grid_instant(window_start_ms: int) -> int:
    """Round `window_start_ms` UP to the nearest 1-minute grid instant.

    `md.series.bucket_end` values are stamped on the whole-minute grid (`transact_time //
    60000`, `cvd.py`'s own bucketing rule) — starting the reported rows on that SAME grid, not
    on whatever millisecond the caller's window happens to begin at, is what makes `event_time`
    line up with the real `bucket_end` a chart's X axis expects.
    """
    return -(-window_start_ms // _GRID_STEP_MS) * _GRID_STEP_MS


def build_series_history_report(
    catalog: SeriesCatalog,
    reader: SeriesWindowReader,
    *,
    series_key_id: str,
    symbol: str,
    interval: str,
    window_start_ms: int,
    window_end_ms: int,
    knowledge_time_ms: int,
    bar_policy: BarPolicy,
) -> SeriesHistoryReport:
    """Build the `SeriesHistoryReport` `GET /series-history` serves for one request.

    Raises:
        UnsupportedIntervalError: `interval != "1m"` (`ADR-034/D6`).
        UnknownSeriesKeyIdError: `series_key_id` has no row in `catalog`.
        InvalidWindowError: `window_start_ms > window_end_ms`.
        DecisionReadRefusedError: propagated, uncaught, from `as_of` — a malformed read
            (`ADR-006`/D3, `SPEC-001` §2.3) is the route's `500` case (`RN-9`), never served.

    """
    if interval != SUPPORTED_INTERVAL:
        raise UnsupportedIntervalError(
            f"interval {interval!r} is not supported: `ADR-034/D6` serves only "
            f"{SUPPORTED_INTERVAL!r} in this phase, refusing rather than subestimating"
        )
    if window_start_ms > window_end_ms:
        raise InvalidWindowError(
            f"window_start_ms ({window_start_ms}) must not be after window_end_ms "
            f"({window_end_ms}) — a single instant (start == end) is a valid, one-row window"
        )
    entry = catalog.entry_for_id(series_key_id)
    if entry is None:
        raise UnknownSeriesKeyIdError(f"series_key_id {series_key_id!r} has no row in the catalog")

    # `ADR-006`'s two staleness lenses are collapsed to the catalog's single `max_staleness_ms`
    # here: `SeriesCatalogEntry` (`domain/series_catalog.py`) does not yet split
    # `asof_max_staleness_ms`/`render_max_staleness_ms` into two catalog fields, and RENDERING
    # is the ONLY purpose F1 ever asks `as_of` for — using the one value the catalog publishes
    # for both lenses is the smallest change that does not invent a number no document measured.
    # [INFERRED: `SeriesCatalogEntry.max_staleness_ms` stands in for both `ADR-006` fields until
    # the catalog grows a second one — a gap for whoever owns that catalog field next, not this
    # task's to widen.]
    staleness_ms = entry.max_staleness_ms
    policy = SeriesReadPolicy(
        asof_max_staleness_ms=staleness_ms,
        render_max_staleness_ms=staleness_ms,
        bucket_interval_ms=_GRID_STEP_MS,
        first_capture_at=None,
    )
    lookback_ms = max(_GRID_STEP_MS, staleness_ms)
    observations = reader.read_window(
        series_key_id=series_key_id,
        symbol=symbol,
        window_start_ms=window_start_ms,
        window_end_ms=window_end_ms,
        lookback_ms=lookback_ms,
    )

    rows: list[SeriesHistoryRow] = []
    grid_instant = _first_grid_instant(window_start_ms)
    while grid_instant <= window_end_ms:
        reading = as_of(
            series=entry.key,
            symbol=symbol,
            t=grid_instant,
            observations=observations,
            policy=policy,
            bar_policy=bar_policy,
            purpose=ReadPurpose.RENDERING,
            knowledge_time=knowledge_time_ms,
        )
        # `.projection()` (`as_of_accessor.py`) is the ALREADY-DECLARED read of the winning row's
        # `available_at` — reading it here directly, as `reading.observation.row.available_at`,
        # would make this module a second entry in `test_as_of_is_the_single_reader.py`'s
        # `DECLARED_TOUCHERS`; going through the dict keeps the read-path column scan exactly
        # where it already is.
        projected = reading.projection()
        rows.append(
            SeriesHistoryRow(
                event_time=grid_instant,
                available_at=cast("int | None", projected["available_at"]),
                value=cast("str | None", projected["value"]),
                absence=cast("str | None", projected["absence"]),
            )
        )
        grid_instant += _GRID_STEP_MS

    return SeriesHistoryReport(
        panel_series_key_id=series_key_id,
        # `panel.source` (`SPEC-006 §5.2`) names the WIRE column `SeriesRow.source`, but the
        # panel level is per-series (`ADR-005/D3`), not per-observation — `entry.key.provider`
        # is the fifteen-term identity's own answer to "where does this series come from"
        # (`series_key.py`'s `SERIES_KEY_TERMS`), always available regardless of which rows the
        # window happens to contain. [INFERRED: no document names which of `provider`/`source`
        # backs this specific envelope field; `provider` is the identity term, chosen over
        # reading it off whichever observation happened to win the last grid step.]
        panel_source=entry.key.provider,
        panel_nature=entry.key.nature.value,
        panel_unit=entry.key.unit,
        rows=tuple(rows),
        knowledge_time=knowledge_time_ms,
        bar_policy=bar_policy,
    )
