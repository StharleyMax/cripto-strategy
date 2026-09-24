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

import ast
from pathlib import Path

import pytest

from src.modules.sentimento.domain.open_interest_catalog import (
    OPEN_INTEREST_LABEL_SHIFT_MS,
    OPEN_INTEREST_POLL_METRIC,
    OPEN_INTEREST_POLL_VERIFIED_BY,
    binance_open_interest_key,
    binance_open_interest_poll_entry,
    binance_open_interest_poll_key,
    coinalyze_open_interest_key,
    open_interest_catalog_entries,
)
from src.modules.sentimento.domain.series_catalog import (
    DuplicateSeriesKeyError,
    SeriesCatalogEntry,
    build_series_catalog,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    TsConvention,
)


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
        native_grid_ms=300_000,
        max_staleness_ms=600_000,
    )

    with pytest.raises(DuplicateSeriesKeyError):
        build_series_catalog([*catalog.entries, duplicate_entry])


def test_instrument_id_is_a_parameter_not_a_hardcoded_symbol() -> None:
    """`SeriesKey.instrument_id` is a term of identity — the catalog builder must forward it."""
    catalog = open_interest_catalog_entries(instrument_id="ETHUSDT")

    assert all(entry.key.instrument_id == "ETHUSDT" for entry in catalog.entries)


# ── `T-03.3` (`SPEC-009`, plan `03` item 3a.3): THE POLLED SERIES, ONE ROW PER SYMBOL ─────────

_PILOT_SYMBOLS_AND_BASE_UNITS = (
    ("BTCUSDT", "BTC"),
    ("ETHUSDT", "ETH"),
    ("LINKUSDT", "LINK"),
    ("SOLUSDT", "SOL"),
)


@pytest.mark.parametrize(("instrument_id", "base_unit"), _PILOT_SYMBOLS_AND_BASE_UNITS)
def test_the_polled_open_interest_row_is_binance_point_1m_in_contracts(
    instrument_id: str, base_unit: str
) -> None:
    """Every term the plan names, on every pilot symbol: `binance·open_interest·1m·POINT`.

    `STOCK`, `POINT_AT_BUCKET_END`, `unit` = the symbol's OWN base asset (`D-a`/`D-b`: contracts,
    never USD), `denom="base"`. `BTCUSDT` yields `BTC`, as the title of `T-03.3` writes; the
    other three prove the unit is derived and not the literal the 5-minute builders once
    hardcoded (`ETHUSDT` published as `BTC`).
    """
    entry = binance_open_interest_poll_entry(instrument_id)
    key = entry.key

    assert key.provider == "binance"
    assert key.venue == "usdm_futures"
    assert key.instrument_id == instrument_id
    assert key.metric == OPEN_INTEREST_POLL_METRIC == "open_interest"
    assert key.interval == "1m"
    assert key.unit == base_unit
    assert key.denom == "base"
    assert key.nature is Nature.STOCK
    assert key.ts_convention is TsConvention.POINT_AT_BUCKET_END
    assert key.reduction is Reduction.POINT
    assert key.quantity_field is QuantityField.NA
    assert key.label_shift == 0
    assert entry.native_grid == "1min"
    assert entry.native_grid_ms == 60_000
    assert entry.max_staleness_ms == 2 * entry.native_grid_ms


def test_the_poll_key_refuses_to_default_the_instrument() -> None:
    """One row per symbol means no default symbol: omitting it is a `TypeError`, never BTC."""
    with pytest.raises(TypeError, match="instrument_id"):
        binance_open_interest_poll_key()  # type: ignore[call-arg]


def test_the_poll_row_shares_the_projection_trio_with_the_5m_point_row() -> None:
    """`ADR-045/D1` keys its projection on `(STOCK, POINT, POINT_AT_BUCKET_END)`.

    Both regimes of the OI candle have to sit on that trio for "one function, two regimes"
    (`SPEC-009` §6.2) to hold; a poll row on any other trio would make the projection fail
    loud on the very series `O-4` exists to capture.
    """
    poll = binance_open_interest_poll_key(instrument_id="BTCUSDT")
    hist = binance_open_interest_key(instrument_id="BTCUSDT")

    assert (poll.nature, poll.reduction, poll.ts_convention) == (
        hist.nature,
        hist.reduction,
        hist.ts_convention,
    )
    assert (poll.unit, poll.denom) == (hist.unit, hist.denom)


def test_the_poll_row_is_a_sixth_identity_and_leaves_the_five_row_catalog_alone() -> None:
    """Distinct from all five 5-minute rows, and `open_interest_catalog_entries` is still five.

    MORDE: appending the poll row INSIDE `open_interest_catalog_entries` moves this count to 6
    and fails the `CA-F2-17` assertion above as well.
    """
    five = open_interest_catalog_entries("BTCUSDT")
    poll_id = binance_open_interest_poll_key(instrument_id="BTCUSDT").series_key_id()

    assert len(five.entries) == 5
    assert poll_id not in {entry.key.series_key_id() for entry in five.entries}
    assert five.entry_for_id(poll_id) is None


def test_the_poll_row_does_not_reuse_the_5m_metric_name() -> None:
    """`metric` must NOT be `sum_open_interest`, or the front's OI selector sees two matches.

    `view-model.ts::matchesBinanceOpenInterest` selects by `metric + provider + reduction` and
    `findUniqueCatalogEntry` refuses ambiguity, so a poll row spelled `sum_open_interest` would
    blank the production OI pane (`panel_absent`) as soon as it is served.
    """
    poll = binance_open_interest_poll_key(instrument_id="BTCUSDT")
    hist = binance_open_interest_key(instrument_id="BTCUSDT")

    assert (poll.provider, poll.reduction) == (hist.provider, hist.reduction)
    assert poll.metric != hist.metric


def test_the_poll_verified_by_names_a_test_that_exists_in_this_file() -> None:
    """`verified_by` is inside the `sha256`, so it has to name something real, not a label.

    Read from the FILE ON DISK via `ast`, never compared against a literal this suite also
    owns: renaming the test without renaming the constant (or the reverse) fails here.
    """
    file_name, test_name = OPEN_INTEREST_POLL_VERIFIED_BY.split("::")
    here = Path(__file__).resolve()
    tree = ast.parse(here.read_text(encoding="utf-8"))
    defined = {node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)}

    assert file_name == here.name
    assert test_name in defined
    assert (
        binance_open_interest_poll_key(instrument_id="ETHUSDT").verified_by
        == OPEN_INTEREST_POLL_VERIFIED_BY
    )
