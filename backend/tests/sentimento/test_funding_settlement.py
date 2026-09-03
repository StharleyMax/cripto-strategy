"""`funding_settled` vs `funding_estimado`: `D6.11` (grid), `D6.12` (dedupe) — plan `06` item 6.4.

`D6.11`/`D6.12` are both run against the real Binance `monthly/fundingRate` dump for
`1000XECUSDT`, July 2026 — the fixture `PRD-001` §5.6 and `CA-F2-7` name by hand because it is
the ONE symbol on record that crosses two interval transitions inside a single month
(`8h -> 1h` then `1h -> 4h`, the second with a 3,0h delta), which is exactly the case a
fixed-interval formula gets wrong and a per-line one does not.
"""

from __future__ import annotations

import csv
import io
import zipfile
from decimal import Decimal
from pathlib import Path

import pytest

from src.modules.sentimento.domain.funding_settlement import (
    ConflictingFundingRecordError,
    FundingRecord,
    FundingSource,
    InvalidFundingIntervalError,
    InvalidFundingRecordError,
    build_funding_record,
    compute_settlement_slot,
    deduplicate_funding_records,
    settlement_residual_ms,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry, build_series_catalog
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)
from tests.helpers.data_fixtures import require_fixture

_FIXTURE = "binance/fundingrate/1000XECUSDT-fundingRate-2026-07.zip"
_FIXTURE_MD5 = "40e35f60a065aac30f2d08d7a47139bc"
_INSTRUMENT = "1000XECUSDT"

_ONE_HOUR_MS = 3_600_000


def _read_fixture_rows(path: Path) -> list[dict[str, str]]:
    """Read the ONE CSV inside the zip, in file order — 321 data rows (`D6.12`).

    Zip-then-CSV, never a pre-extracted copy on disk: `data/binance/fundingrate/` ships the
    monthly dump exactly as `.zip`, and unzipping a fresh copy per test run is what keeps this
    suite from depending on a side-effect of some earlier, unrelated command.
    """
    with zipfile.ZipFile(path) as archive:
        (member,) = archive.namelist()
        with archive.open(member) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8", newline="")
            return list(csv.DictReader(text))


@pytest.fixture(scope="module")
def _fixture_rows() -> list[dict[str, str]]:
    path = require_fixture(_FIXTURE, expected_md5=_FIXTURE_MD5)
    return _read_fixture_rows(path)


def _records_from_rows(rows: list[dict[str, str]]) -> tuple[FundingRecord, ...]:
    """Build one `SETTLED` `FundingRecord` per fixture row, in file order."""
    return tuple(
        build_funding_record(
            instrument_id=_INSTRUMENT,
            source=FundingSource.SETTLED,
            observed_at_ms=int(row["calc_time"]),
            interval_hours_declared=int(row["funding_interval_hours"]),
            funding_rate=Decimal(row["last_funding_rate"]),
        )
        for row in rows
    )


# ── D6.12 — dupla ingestão não duplica ──────────────────────────────────────────────────────


def test_d6_12_the_fixture_has_exactly_321_rows(_fixture_rows: list[dict[str, str]]) -> None:
    """`[MEDIDO]` command: `unzip -p <fixture> | wc -l` minus the header — `321` data rows."""
    assert len(_fixture_rows) == 321


def test_d6_12_ingesting_the_fixture_twice_still_yields_321_rows(
    _fixture_rows: list[dict[str, str]],
) -> None:
    """The falsifier `D6.12` names literally: `count(*) = 321`, never `642`.

    `_fixture_rows` read TWICE (simulating the file being ingested twice) hands
    `deduplicate_funding_records` `642` records that pairwise share both a primary key and
    every other field; the function is required to collapse each pair back to one.
    """
    once = _records_from_rows(_fixture_rows)
    twice = once + once
    assert len(twice) == 642

    deduped = deduplicate_funding_records(twice)
    assert len(deduped) == 321
    assert deduped == once


def test_d6_12_dedupe_survives_the_8h_to_1h_to_4h_transition(
    _fixture_rows: list[dict[str, str]],
) -> None:
    """The transition rows are not merged into each other by a coarse dedupe.

    `[MEDIDO]`: row index `38` is the `8h -> 1h` transition (delta `1,0h` from the prior
    settlement) and row index `267` is `1h -> 4h` (delta exactly `3,0h`) — both survive as
    DISTINCT records after dedupe, at their own `observed_at`/`interval_hours_declared`.
    """
    records = _records_from_rows(_fixture_rows)
    deduped = deduplicate_funding_records(records + records)
    assert len(deduped) == 321

    transition_1 = deduped[38]
    assert transition_1.interval_hours_declared == 1
    assert deduped[37].interval_hours_declared == 8
    delta_hours_1 = (transition_1.observed_at - deduped[37].observed_at) / _ONE_HOUR_MS
    assert delta_hours_1 == pytest.approx(1.0, abs=1e-3)

    transition_2 = deduped[267]
    assert transition_2.interval_hours_declared == 4
    assert deduped[266].interval_hours_declared == 1
    delta_hours_2 = (transition_2.observed_at - deduped[266].observed_at) / _ONE_HOUR_MS
    assert delta_hours_2 == pytest.approx(3.0)


def test_a_primary_key_seen_twice_with_different_content_is_a_conflict_not_a_duplicate() -> None:
    """Two records sharing a PK but disagreeing on `funding_rate` refuse, they never pick one."""
    first = build_funding_record(
        instrument_id=_INSTRUMENT,
        source=FundingSource.SETTLED,
        observed_at_ms=8 * _ONE_HOUR_MS,
        interval_hours_declared=8,
        funding_rate=Decimal("0.0001"),
    )
    second = build_funding_record(
        instrument_id=_INSTRUMENT,
        source=FundingSource.SETTLED,
        observed_at_ms=8 * _ONE_HOUR_MS,
        interval_hours_declared=8,
        funding_rate=Decimal("0.0002"),
    )
    assert first.primary_key() == second.primary_key()
    with pytest.raises(ConflictingFundingRecordError):
        deduplicate_funding_records([first, second])


def test_funding_settled_and_funding_estimado_never_collide_at_the_same_window() -> None:
    """`SPEC-001` §3.4: the SAME window carries one row of EACH series, never an overwrite.

    Same `instrument_id`, same `observed_at`, same `interval_hours_declared` — only `source`
    differs — and that is enough for the two to keep separate primary keys and both survive
    dedupe, because `source` is the PK term this task's DoD exists to add.
    """
    settled = build_funding_record(
        instrument_id=_INSTRUMENT,
        source=FundingSource.SETTLED,
        observed_at_ms=8 * _ONE_HOUR_MS,
        interval_hours_declared=8,
        funding_rate=Decimal("0.0001"),
    )
    estimated = build_funding_record(
        instrument_id=_INSTRUMENT,
        source=FundingSource.ESTIMATED,
        observed_at_ms=8 * _ONE_HOUR_MS,
        interval_hours_declared=8,
        funding_rate=Decimal("0.00013"),
    )
    assert settled.primary_key() != estimated.primary_key()
    deduped = deduplicate_funding_records([settled, estimated, settled, estimated])
    assert len(deduped) == 2
    assert set(deduped) == {settled, estimated}


# ── D6.11 — settlement_slot correto, da própria linha ───────────────────────────────────────


def test_compute_settlement_slot_floors_to_the_given_interval_grid() -> None:
    """`8h` grid: `2026-01-01T09:00:07Z` (in ms) floors to the `08:00:00Z` slot."""
    grid_8h = 8 * _ONE_HOUR_MS
    observed_at = 5 * grid_8h + 7_000  # 7s past the 5th 8h boundary since epoch
    assert compute_settlement_slot(observed_at, 8) == 5 * grid_8h
    assert settlement_residual_ms(observed_at, 8) == 7_000


def test_compute_settlement_slot_rejects_a_non_positive_interval() -> None:
    """Zero or negative hours has no grid width to align a settlement to."""
    with pytest.raises(InvalidFundingIntervalError):
        compute_settlement_slot(1_000, 0)
    with pytest.raises(InvalidFundingIntervalError):
        compute_settlement_slot(1_000, -4)


def test_compute_settlement_slot_rejects_a_negative_observed_at() -> None:
    """No settlement in this pipeline's universe predates the epoch."""
    with pytest.raises(InvalidFundingIntervalError):
        compute_settlement_slot(-1, 8)


def test_a_record_with_a_hand_built_off_grid_settle_bucket_is_refused() -> None:
    """`FundingRecord` checks `settle_bucket` at construction — `D6.11`'s bug, refused at birth."""
    with pytest.raises(InvalidFundingRecordError):
        FundingRecord(
            instrument_id=_INSTRUMENT,
            source=FundingSource.SETTLED,
            settle_bucket=0,  # the WRONG slot for observed_at below under an 8h grid
            observed_at=9 * _ONE_HOUR_MS,
            interval_hours_declared=8,
            funding_rate=Decimal("0.0001"),
        )


def test_a_record_with_a_blank_instrument_id_is_refused() -> None:
    """`SPEC-001` §3.4's PK starts with `instrument_id`; blank does not identify a settlement."""
    with pytest.raises(InvalidFundingRecordError, match="instrument_id"):
        FundingRecord(
            instrument_id="   ",
            source=FundingSource.SETTLED,
            settle_bucket=0,
            observed_at=0,
            interval_hours_declared=8,
            funding_rate=Decimal("0.0001"),
        )


def test_a_hand_built_record_with_a_non_positive_interval_is_refused() -> None:
    """Bypassing `build_funding_record`, a `FundingRecord` still refuses a bad interval itself."""
    with pytest.raises(InvalidFundingIntervalError):
        FundingRecord(
            instrument_id=_INSTRUMENT,
            source=FundingSource.SETTLED,
            settle_bucket=0,
            observed_at=0,
            interval_hours_declared=0,
            funding_rate=Decimal("0.0001"),
        )


def test_funding_record_settlement_residual_ms_method_matches_the_module_function() -> None:
    """The INSTANCE method reads the same jitter the free function computes from raw ints."""
    record = build_funding_record(
        instrument_id=_INSTRUMENT,
        source=FundingSource.SETTLED,
        observed_at_ms=8 * _ONE_HOUR_MS + 5_000,
        interval_hours_declared=8,
        funding_rate=Decimal("0.0001"),
    )
    assert record.settlement_residual_ms() == 5_000
    assert record.settlement_residual_ms() == settlement_residual_ms(
        record.observed_at, record.interval_hours_declared
    )


def test_d6_11_every_row_of_the_real_fixture_lands_in_a_small_non_negative_residual(
    _fixture_rows: list[dict[str, str]],
) -> None:
    """`D6.11`, per-line formula: `[MEDIDO]` residual in `[0, 12]` ms over all `321` rows.

    Command: this test itself, over `data/binance/fundingrate/1000XECUSDT-fundingRate-2026-07
    .zip` (`md5 40e35f60a065aac30f2d08d7a47139bc`), universe `n=321`. `0` slots land outside
    `[0, 20]` ms and none is negative — the bound `D6.11` states for the wider, cross-symbol
    measurement (`16.979` liquidações) holds on this one symbol's `321` rows too.
    """
    residuals = [
        settlement_residual_ms(int(row["calc_time"]), int(row["funding_interval_hours"]))
        for row in _fixture_rows
    ]
    assert len(residuals) == 321
    assert min(residuals) == 0
    assert max(residuals) == 12
    assert all(0 <= residual <= 20 for residual in residuals)


def test_d6_11_the_old_fixed_interval_formula_misplaces_most_rows_the_per_line_one_does_not(
    _fixture_rows: list[dict[str, str]],
) -> None:
    """The falsifier, stated forwards: assume a GLOBAL `8h` grid instead of the per-line one.

    `[MEDIDO]`: `228` of `321` rows (`71,0%`) land outside `[0, 20]` ms under the fixed-`8h`
    assumption — every row from the moment the symbol left `8h` behind (`1000XECUSDT` spends
    most of the file at `1h` and `4h`, per `PRD-001` §5.6) — while the SAME rows, read with
    THEIR OWN declared interval, all land in `[0, 20]` ms (previous test). This is the
    "fórmula antiga erra" `D6.11` names, reproduced on the fixture this task ships, not merely
    quoted from the plan.
    """
    fixed_grid_ms = 8 * _ONE_HOUR_MS
    misplaced = 0
    for row in _fixture_rows:
        calc_time = int(row["calc_time"])
        slot = (calc_time // fixed_grid_ms) * fixed_grid_ms
        residual = calc_time - slot
        if residual < 0 or residual > 20:
            misplaced += 1
    assert misplaced == 228
    assert misplaced / len(_fixture_rows) == pytest.approx(0.7102803738317757)


def test_d6_11_nextfundingtime_style_schedule_has_zero_residual() -> None:
    """`D6.16`'s shape, as a domain unit: a SCHEDULED future slot has NO jitter to absorb.

    `settlement_residual_ms` is the same function `D6.11` reads on PAST settlements (small,
    non-negative jitter) and `D6.16` reads on `nextFundingTime` (must be exactly `0`, because a
    published schedule has nothing yet to be late by) — this pins the zero-jitter case as a
    plain arithmetic fact before the real snapshot test exercises it end to end.
    """
    grid_4h = 4 * _ONE_HOUR_MS
    next_funding_time = 100 * grid_4h  # sits exactly on a 4h boundary, as a schedule must
    assert settlement_residual_ms(next_funding_time, 4) == 0


# ── the catalog side: two `SeriesCatalogEntry` rows, never one series with a flag ───────────


def _funding_series_key(metric: str) -> SeriesKey:
    """Build a funding `SeriesKey` differing from its sibling ONLY in `metric`.

    Values other than `metric` are `[INFERRED]` placeholders reasonable for an `EVENT` series —
    this task's DoD (`D6.11`/`D6.12`/`D6.16`) is about the PK and the grid, not about picking
    the catalog's `unit`/`denom`/`native_grid` for funding, which is `T-06.9`'s scope.
    """
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=_INSTRUMENT,
        metric=metric,
        cohort="all",
        interval="event",
        unit="rate",
        denom="notional",
        nature=Nature.EVENT,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=(
            "test_funding_settlement.py::"
            "test_funding_settled_and_funding_estimado_are_two_catalog_entries"
        ),
    )


def test_funding_settled_and_funding_estimado_are_two_catalog_entries() -> None:
    """Plan `06` item 6.4, literal: "series distintas ... nunca a mesma `SeriesKey`".

    Reuses `T-06.1`'s `SeriesCatalog`/`SeriesKey` rather than inventing a second catalog:
    `funding_settled` and `funding_estimado` are two `SeriesCatalogEntry` rows differing ONLY
    in `metric`, and `build_series_catalog` accepts both side by side — the same function that
    `DuplicateSeriesKeyError`s on a genuine collision does NOT collide here, which is the proof
    the two are distinct identities rather than one series overwritten by a flag.
    """
    catalog = build_series_catalog(
        [
            SeriesCatalogEntry(
                key=_funding_series_key(FundingSource.SETTLED.value),
                native_grid="event",
                max_staleness_ms=60_000,
            ),
            SeriesCatalogEntry(
                key=_funding_series_key(FundingSource.ESTIMATED.value),
                native_grid="event",
                max_staleness_ms=60_000,
            ),
        ]
    )
    assert len(catalog.entries) == 2
    assert catalog.entry_for(_funding_series_key(FundingSource.SETTLED.value)) is not None
    assert catalog.entry_for(_funding_series_key(FundingSource.ESTIMATED.value)) is not None
