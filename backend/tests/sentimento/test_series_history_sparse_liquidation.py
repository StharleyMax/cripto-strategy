"""`T-05.8`: the SPARSE contract of `sum_liquidation` — absence is absence, never zero.

Plan `05` item 5.4 and `RN-1`: a grid instant with no liquidation is `SEM_PONTO`, and a
projection that filled the hole with `0` would publish a fact the source never stated. This is
not a corner case on this series — it is the COMMON one: only **20,2%** of 1-minute buckets
carry a liquidation at all `[MEDIDO 2026-09-12, n=14.344 buckets possiveis, 2.900 preenchidos,
docs/context/cinco-metricas-do-core/gates/retencao-liquidation-history.md]`.

WHAT THIS MODULE MEASURES, AND WHY IT IS NOT A TEST OF `as_of`. `as_of` already has its own
suite, and `CARRY_FORWARD_BY_NATURE[Nature.FLOW] is False` is already pinned there. What was
untested until `T-05.8` is the SERVED path: the entry `list_series_catalog()` now publishes for
each cohort, fed to the real `build_series_history_report`, with holes in the data. A hole
reaching the wire as `"0"` and a hole reaching it as `SEM_PONTO` are both `200 OK` — nothing in
the envelope's shape distinguishes them, which is why the distinction needs a test and not a
comment.

THE NEGATIVE CONTROL IS THE POINT OF THE FILE. `test_the_same_holes_are_FILLED_for_a_carry_
forward_nature` runs the SAME observations through the SAME function with `nature=STOCK` and
gets the holes filled. Without it, `absence == SEM_PONTO` everywhere would also be satisfied by
a read path that returns `SEM_PONTO` unconditionally — a test that cannot fail for the right
reason measures nothing (`ADR-012`'s `rc=0` ambiguity, one layer up).
"""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from typing import Final

import pytest

from src.modules.charts.domain.panel_grid_enablement import classify_grid_multiple
from src.modules.sentimento.domain.as_of_accessor import BarPolicy, Observation
from src.modules.sentimento.domain.liquidation_catalog import (
    COHORTS,
    NATIVE_GRID_MS,
    coinalyze_liquidation_key,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    Absence,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import (
    PanelGridVerdict,
    SeriesHistoryReport,
)
from src.modules.sentimento.domain.series_key import Nature
from src.modules.sentimento.use_cases.series_catalog import list_series_catalog
from src.modules.sentimento.use_cases.series_history import build_series_history_report

SYMBOL: Final[str] = "BTCUSDT"

BUCKET_ZERO: Final[int] = 1_620_000_000_000
"""A `bucket_end` exactly on the 1-minute grid (`1_620_000_000_000 / 60_000 = 27_000_000`).

Real rows are always stamped this way — the writer computes `bucket_end` from the provider's
bucket START plus the width (`collector_series_mapping.build_liquidation_history_to_row`), and
Coinalyze's `t` is a whole minute."""

PUBLICATION_LAG_MS: Final[int] = 30_000
"""The fixture's lag between `bucket_end` and `available_at`, and it is DELIBERATELY under one
native grid width.

`as_of` refuses a `FLOW` bucket once `age_ms >= bucket_interval_ms`, so a row that only becomes
readable a whole minute after its bucket closed can never be served at any grid instant — the
defect `ACHADO-SERIES-HISTORY-SEM-PONTO.md` measured on `klines_volume` (180 rows, 0 values).
`test_a_lag_of_a_whole_native_grid_makes_every_instant_sem_ponto` below pins that boundary
explicitly, so this constant is a stated premise of the sparse test and not a lucky number."""

FILLED_OFFSETS: Final[tuple[int, ...]] = (0, 1, 4, 9)
"""Which of the ten grid instants carry a liquidation. The rest are holes.

4 of 10 is a deliberately GENEROUS density next to the measured 20,2%: the sparse case is the
common one, and a fixture that was mostly full would exercise the hole branch by accident."""

WINDOW_INSTANTS: Final[int] = 10

VALUES: Final[dict[int, str]] = {
    0: "1523.75",
    1: "44100.10",
    4: "8.25",
    9: "377000.00",
}
"""USD notionals, as RAW STRINGS — `SPEC-001` §2.6 keeps the source's digits, never a float."""


def _classify_panel_grid(*, panel_grid_ms: int, native_grid_ms: int) -> PanelGridVerdict:
    """Satisfy the `GridMultipleClassifier` port with the REAL `charts` rule (`ADR-037/D4`)."""
    verdict = classify_grid_multiple(panel_grid_ms, native_grid_ms)
    return PanelGridVerdict(
        native_grid_ms=verdict.native_grid_ms,
        enabled=verdict.enabled,
        reason=verdict.reason.value,
        multiple=verdict.multiple,
    )


class _FakeReader:
    """A `SeriesWindowReader` that returns exactly the observations it was built with."""

    def __init__(self, observations: tuple[Observation, ...]) -> None:
        self._observations = observations

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        return self._observations


class _FakeBoundsReader:
    """A `SeriesStoreBoundsReader` fixture — `(None, None)` always (`T-03.6`).

    This file's own test domain is `sum_liquidation`'s hole handling within the requested
    window, never `panel.coverage`'s store-extent fields — an empty store is the neutral answer.
    """

    def read_bounds(self, *, series_key_id: str, symbol: str) -> tuple[int | None, int | None]:
        return (None, None)


bounds_reader = _FakeBoundsReader()


def _served_entry(cohort: str) -> SeriesCatalogEntry:
    """Return the row `list_series_catalog()` SERVES for this cohort — not a hand-built one.

    Reading the served catalog is what ties this file to `T-05.8`: if the registration is
    reverted, this lookup raises and every test here fails, rather than quietly testing a local
    fixture that production no longer publishes.
    """
    key_id = coinalyze_liquidation_key(cohort, instrument_id=SYMBOL).series_key_id()
    entry = list_series_catalog(SYMBOL).entry_for_id(key_id)
    assert entry is not None, f"cohort {cohort!r} is not in the served catalog: `T-05.8` reverted"
    return entry


def _row(*, series_key_id: str, bucket_end: int, value_raw: str, lag_ms: int) -> SeriesRow:
    return SeriesRow(
        series_key_id=series_key_id,
        symbol=SYMBOL,
        source="/v1/liquidation-history",
        bucket_end=bucket_end,
        event_time=bucket_end,
        available_at=bucket_end + lag_ms,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=bucket_end + lag_ms,
        observed_at=bucket_end + lag_ms,
        provenance=Provenance.OBSERVED,
        src_label_raw="l",
        observer_id="test",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=True,
        value_raw=value_raw,
    )


def _sparse_observations(
    series_key_id: str, *, lag_ms: int = PUBLICATION_LAG_MS
) -> tuple[Observation, ...]:
    """Build one observation per FILLED offset — the holes are simply absent rows.

    That is the whole point of a sparse series on the write side: a minute with no liquidation
    produces NO ROW, not a row carrying `0`. Writing zeros here would make the read path's
    behaviour untestable, because there would be no hole left to fill.
    """
    return tuple(
        Observation(
            row=_row(
                series_key_id=series_key_id,
                bucket_end=BUCKET_ZERO + (offset * NATIVE_GRID_MS),
                value_raw=VALUES[offset],
                lag_ms=lag_ms,
            ),
            value=Decimal(VALUES[offset]),
        )
        for offset in FILLED_OFFSETS
    )


def _report(
    entry: SeriesCatalogEntry, observations: tuple[Observation, ...]
) -> SeriesHistoryReport:
    return build_series_history_report(
        SeriesCatalog((entry,)),
        _FakeReader(observations),
        _classify_panel_grid,
        bounds_reader,
        series_key_id=entry.key.series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=BUCKET_ZERO,
        window_end_ms=BUCKET_ZERO + ((WINDOW_INSTANTS - 1) * NATIVE_GRID_MS),
        knowledge_time_ms=BUCKET_ZERO + (WINDOW_INSTANTS * NATIVE_GRID_MS),
        bar_policy=BarPolicy.FINAL_ONLY,
    )


@pytest.mark.parametrize("cohort", COHORTS)
def test_a_bucket_without_a_liquidation_is_sem_ponto_and_never_zero(cohort: str) -> None:
    """`RN-1`: the projection does NOT fill the hole — for BOTH cohorts, separately.

    The six empty instants come back with `value is None` and `absence == "SEM_PONTO"`. The
    `Decimal(...) != 0` sweep is the second half of the claim: not merely "no hole was filled
    with the string `0`", but that no served value is zero at all, in any spelling (`0`, `0.0`,
    `0E-8`) — a reconstruction that emitted a zero-valued row would satisfy a `!= "0"` string
    check and still publish "there were no liquidations" as if it had been observed.
    """
    entry = _served_entry(cohort)

    rows = _report(entry, _sparse_observations(entry.key.series_key_id())).rows

    assert len(rows) == WINDOW_INSTANTS
    filled = {index for index, row in enumerate(rows) if row.value is not None}
    assert filled == set(FILLED_OFFSETS)
    for index, row in enumerate(rows):
        assert row.event_time == BUCKET_ZERO + (index * NATIVE_GRID_MS)
        if index in FILLED_OFFSETS:
            assert row.value == VALUES[index]
            assert row.absence is None
            assert row.available_at == row.event_time + PUBLICATION_LAG_MS
        else:
            assert row.value is None, f"instant {index} was FILLED: {row.value!r}"
            assert row.absence == Absence.NO_POINT.value == "SEM_PONTO"
            assert row.available_at is None
    assert all(Decimal(row.value) != 0 for row in rows if row.value is not None)


@pytest.mark.parametrize("cohort", COHORTS)
def test_the_same_holes_are_filled_for_a_carry_forward_nature(cohort: str) -> None:
    """THE NEGATIVE CONTROL: the read path CAN fill a hole — `nature` is the only varying term.

    Same observations, same window, same function; only `Nature.FLOW` becomes `Nature.STOCK`.
    The holes fill with the previous bucket's value, which is correct for a stock and would be
    a fabricated liquidation here. So the test above measures the FLOW contract rather than a
    read path that happens to return `SEM_PONTO` for everything — and if someone ever flips
    `CARRY_FORWARD_BY_NATURE[Nature.FLOW]`, that test fails while this one still passes,
    naming the cause instead of leaving two silent failures.
    """
    served = _served_entry(cohort)
    stock_entry = SeriesCatalogEntry(
        key=replace(served.key, nature=Nature.STOCK),
        native_grid=served.native_grid,
        native_grid_ms=served.native_grid_ms,
        max_staleness_ms=served.max_staleness_ms,
    )

    # The observations still carry the SERVED id, because `series_key_id` is what the reader
    # matches on and changing `nature` changes the id — the rows have to stay addressable by the
    # entry under test, which is exactly what `replace` on the catalog side alone achieves.
    rows = _report(
        stock_entry,
        _sparse_observations(stock_entry.key.series_key_id()),
    ).rows

    assert [row.value is not None for row in rows].count(True) > len(FILLED_OFFSETS)


@pytest.mark.parametrize("cohort", COHORTS)
def test_a_lag_of_a_whole_native_grid_is_visible_only_at_the_buckets_own_close(cohort: str) -> None:
    """The BOUNDARY `DoD-2` of plan `05` depends on — reshaped by `ADR-042`/`D1`, not erased.

    `[ADR-042 UPDATE, 2026-09-23]` Renamed from `..._makes_every_instant_sem_ponto`: that was
    the PRE-`ADR-042` shape, where R-1 (`available_at <= t`) and `D4.11`'s staleness
    (`age_ms < bucket_interval_ms`) were CONTRADICTORY whenever `lag_ms == bucket_interval_ms`
    exactly — `available_at <= t` forces `age_ms >= bucket_interval_ms`, which `D4.11` then
    always refuses, so a row published exactly one native grid late was NEVER servable at any
    `t`, from any reader. That was the collector precondition this test pinned.

    Under `D1` (`available_at <= knowledge_time`), `_report`'s single, WIDE
    `knowledge_time_ms` (one grid past the window, the RENDERING shape `ADR-042` exists to
    unlock) no longer ties visibility to `t` at all — it ties it to `K`, fixed for the whole
    batch. `D4.11`'s staleness is then the ONLY t-dependent gate left, and it admits exactly
    `age_ms = 0`: each filled bucket is visible at its OWN closing instant and nowhere else.
    `[MEDIDO 2026-09-23: filled indices are `{0, 1, 4, 9}` — identical to `FILLED_OFFSETS`,
    the SAME shape `test_a_bucket_without_a_liquidation_is_sem_ponto_and_never_zero` gets with
    `PUBLICATION_LAG_MS = 30_000` — confirmed by running this fixture and printing
    `(index, value, absence)` for all ten rows]`.

    The precondition this test now pins is narrower but still real: a RENDERING caller with a
    wide-enough `K` recovers the collector's point EXACTLY at its own bucket close regardless of
    how late (within `K`) it was published — `D1` subsumes the old "publish within one native
    grid or lose the point forever" requirement, but only for `RENDERING`. A per-instant,
    `ENTRY_CONDITION`-shaped read (`K = t`, `D2`'s own equivalence) still reproduces the OLD,
    tighter boundary exactly — that case is `test_adr_042_falsifier_1_...` in
    `test_as_of_accessor.py`, not this file, since this file's `_report` fixes ONE `K` for the
    whole window by construction (`SPEC-001`'s RENDERING shape), and this test's job is that
    shape specifically.
    """
    entry = _served_entry(cohort)

    rows = _report(
        entry, _sparse_observations(entry.key.series_key_id(), lag_ms=NATIVE_GRID_MS)
    ).rows

    filled = {index for index, row in enumerate(rows) if row.value is not None}
    assert filled == set(FILLED_OFFSETS)
    for index, row in enumerate(rows):
        if index in FILLED_OFFSETS:
            assert row.value == VALUES[index]
            assert row.absence is None
            # visible exactly AT the bucket's own close — `age_ms = 0` is the only age `D4.11`
            # admits once `K` no longer bounds anything (row published one whole grid late).
            assert row.available_at == row.event_time + NATIVE_GRID_MS
        else:
            assert row.value is None, f"instant {index} was FILLED: {row.value!r}"
            assert row.absence == Absence.NO_POINT.value == "SEM_PONTO"
