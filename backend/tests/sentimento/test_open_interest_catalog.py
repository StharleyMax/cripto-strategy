"""`CA-F2-17` / plan `06` item 6.11, run against the PRODUCTION population, not a local fixture.

`test_series_identity.py` already proves the identity-level shape (four distinct
`series_key_id`s, no default on `reduction`) using its OWN fixture builders
(`binance_oi_key`/`coinalyze_oi_key`), copied by hand for that file's purposes. This suite
exercises `src.modules.sentimento.domain.open_interest_catalog` directly instead — the module
`T-06.5` adds to POPULATE the real rows — so a regression in the production population (a
dropped row, a `reduction` silently defaulted, a duplicate key) fails here even if nobody ever
touches `test_series_identity.py` again.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.open_interest_catalog import (
    OPEN_INTEREST_LABEL_SHIFT_MS,
    binance_open_interest_key,
    coinalyze_open_interest_key,
    open_interest_catalog_entries,
)
from src.modules.sentimento.domain.series_catalog import (
    DuplicateSeriesKeyError,
    SeriesCatalogEntry,
    build_series_catalog,
)
from src.modules.sentimento.domain.series_key import Reduction, TsConvention


def test_asking_for_the_coinalyze_open_interest_key_without_reduction_is_refused() -> None:
    """`D6.7`, literal: no `reduction`, no key — a `TypeError` naming the missing argument."""
    with pytest.raises(TypeError, match="reduction"):
        coinalyze_open_interest_key()  # type: ignore[call-arg]


@pytest.mark.parametrize(
    "reduction", [Reduction.OPEN, Reduction.HIGH, Reduction.LOW, Reduction.CLOSE]
)
def test_coinalyze_open_interest_key_carries_the_ohlc_convention(reduction: Reduction) -> None:
    """Every reading of the four is `OHLC_OVER_BUCKET`, never `POINT_AT_BUCKET_END`."""
    key = coinalyze_open_interest_key(reduction)

    assert key.provider == "coinalyze"
    assert key.ts_convention is TsConvention.OHLC_OVER_BUCKET
    assert key.reduction is reduction


def test_binance_open_interest_key_is_always_point_at_bucket_end() -> None:
    """The one Binance reading is `POINT`/`POINT_AT_BUCKET_END` — no other option to ask for."""
    key = binance_open_interest_key()

    assert key.provider == "binance"
    assert key.reduction is Reduction.POINT
    assert key.ts_convention is TsConvention.POINT_AT_BUCKET_END


def test_the_four_coinalyze_keys_and_the_one_binance_key_are_five_distinct_identities() -> None:
    """`CA-F2-17`'s central claim: five rows, not two — every `series_key_id` is unique."""
    coinalyze_ids = {
        coinalyze_open_interest_key(reduction).series_key_id()
        for reduction in (Reduction.OPEN, Reduction.HIGH, Reduction.LOW, Reduction.CLOSE)
    }
    binance_id = binance_open_interest_key().series_key_id()

    assert len(coinalyze_ids) == 4
    assert binance_id not in coinalyze_ids


def test_the_catalog_has_five_rows_four_coinalyze_ohlc_and_one_binance_point() -> None:
    """The production entry point: `open_interest_catalog_entries()` builds all five at once."""
    catalog = open_interest_catalog_entries()

    assert len(catalog.entries) == 5
    reductions = {entry.key.reduction for entry in catalog.entries}
    assert reductions == {
        Reduction.OPEN,
        Reduction.HIGH,
        Reduction.LOW,
        Reduction.CLOSE,
        Reduction.POINT,
    }
    providers = [entry.key.provider for entry in catalog.entries]
    assert providers.count("coinalyze") == 4
    assert providers.count("binance") == 1


def test_the_catalog_looks_up_each_of_the_five_keys_by_its_own_identity() -> None:
    """`entry_for` resolves each of the five keys back to its own row, never a neighbour's."""
    catalog = open_interest_catalog_entries()

    for reduction in (Reduction.OPEN, Reduction.HIGH, Reduction.LOW, Reduction.CLOSE):
        key = coinalyze_open_interest_key(reduction)
        entry = catalog.entry_for(key)
        assert entry is not None
        assert entry.key.reduction is reduction

    binance_entry = catalog.entry_for(binance_open_interest_key())
    assert binance_entry is not None
    assert binance_entry.key.provider == "binance"


def test_open_interest_label_shift_is_positive_interval_not_zero() -> None:
    """`SPEC-001` §2.1, literal: "o `label_shift` da Coinalyze é `+interval` ... e não zero".

    Both sources carry the SAME shift, in the SAME direction as `metrics_shift.LABEL_SHIFT_MS`
    (`+300_000` ms) — the falsifier this test runs is that a value of `0` would pass every
    other assertion in this file yet contradict the SPEC line quoted above.
    """
    assert OPEN_INTEREST_LABEL_SHIFT_MS == 300_000
    assert coinalyze_open_interest_key(Reduction.CLOSE).label_shift == OPEN_INTEREST_LABEL_SHIFT_MS
    assert binance_open_interest_key().label_shift == OPEN_INTEREST_LABEL_SHIFT_MS


def test_a_sixth_row_reusing_an_existing_coinalyze_reduction_is_refused_as_a_duplicate() -> None:
    """The catalog's own uniqueness (`SPEC-001` §3.3) still gates this module's output.

    Falsifier for "the five rows are validated, not merely asserted distinct by this suite's
    own arithmetic": appending a SIXTH row that repeats an existing `reduction` must reprova
    the same way any other caller's duplicate would, through `build_series_catalog` itself.
    """
    catalog = open_interest_catalog_entries()
    duplicate_entry = SeriesCatalogEntry(
        key=coinalyze_open_interest_key(Reduction.CLOSE),
        native_grid="5min",
        max_staleness_ms=600_000,
    )

    with pytest.raises(DuplicateSeriesKeyError):
        build_series_catalog([*catalog.entries, duplicate_entry])


def test_instrument_id_is_a_parameter_not_a_hardcoded_symbol() -> None:
    """`SeriesKey.instrument_id` is a term of identity — the catalog builder must forward it."""
    catalog = open_interest_catalog_entries(instrument_id="ETHUSDT")

    assert all(entry.key.instrument_id == "ETHUSDT" for entry in catalog.entries)
