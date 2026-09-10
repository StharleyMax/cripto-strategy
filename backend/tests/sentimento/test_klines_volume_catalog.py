"""`klines_volume` is a NEW identity, and this file is the one `verified_by` names.

Phase `01` item 1.1 (`SPEC-007` §4 / §4.1, `RF-2`). The DoD of the task is circular by
design and the circle is the point: `series_key_id()` is the `sha256` of all fifteen terms
INCLUDING `verified_by` (`series_key.py:226-234`), so the name of this file is part of what
the series IS. `test_verified_by_is_inside_the_identity_of_klines_volume` is the mutation
that proves the claim instead of asserting it, and
`test_verified_by_names_a_file_that_actually_exists` is what keeps the name from becoming a
dangling pointer after a rename.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from src.modules.sentimento.domain.klines_volume_catalog import (
    KLINES_VOLUME_MAX_STALENESS_MS,
    KLINES_VOLUME_METRIC,
    KLINES_VOLUME_NATIVE_GRID,
    build_klines_volume_entry,
)
from src.modules.sentimento.domain.price_source_catalog import (
    PRICE_SOURCES,
    build_klines_last_entry,
)
from src.modules.sentimento.domain.series_catalog import build_series_catalog
from src.modules.sentimento.domain.series_key import (
    FORBIDDEN_METRIC_NAMES,
    IncompleteSeriesKeyError,
    Nature,
    QuantityField,
    Reduction,
    TsConvention,
)

_VERIFIED_BY = "test_klines_volume_catalog.py"


# ── The normative row, term by term (`SPEC-007` §4) ─────────────────────────────────────────


def test_klines_volume_row_is_spec_007_section_4_transcribed() -> None:
    """All fifteen terms plus the two catalog-only fields, against the normative table.

    One assertion per term rather than one comparison against a prebuilt `SeriesKey`: a
    prebuilt expected key would be the same constructor call twice, which passes even when
    both copies are wrong together.
    """
    entry = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)
    key = entry.key

    assert key.provider == "binance"
    assert key.venue == "usdm_futures"
    assert key.instrument_id == "BTCUSDT"
    assert key.metric == "klines_volume"
    assert key.cohort == "all"
    assert key.interval == "1m"
    assert key.unit == "BTC"
    assert key.denom == "base"
    assert key.nature is Nature.FLOW
    assert key.ts_convention is TsConvention.AGGREGATE_OVER_BUCKET
    assert key.reduction is Reduction.SUM
    assert key.quantity_field is QuantityField.NA
    assert key.label_shift == 0
    assert key.aggregation_scope == "Symbol"
    assert key.verified_by == _VERIFIED_BY

    assert entry.native_grid == "1min"
    assert entry.max_staleness_ms == KLINES_VOLUME_MAX_STALENESS_MS


def test_exported_constants_are_the_values_the_row_carries() -> None:
    """The three module constants are not a second, driftable copy of the row's values."""
    entry = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert KLINES_VOLUME_METRIC == entry.key.metric
    assert KLINES_VOLUME_NATIVE_GRID == entry.native_grid
    assert KLINES_VOLUME_MAX_STALENESS_MS == entry.max_staleness_ms
    assert KLINES_VOLUME_MAX_STALENESS_MS == 120_000


# ── `GA-1`: this is a NEW identity, and `klines_last` is not it ─────────────────────────────


def test_klines_volume_and_klines_last_are_two_series_not_one() -> None:
    """`GA-1`, the misreading this whole task corrects: `klines_last` is a PRICE series.

    The falsifier is the catalog itself — `SeriesCatalog.__post_init__` raises
    `DuplicateSeriesKeyError` for two rows over the same `SeriesKey`. Both rows entering one
    catalog, with different `series_key_id()`, is the proof that phase `01` created an
    identity instead of colliding with the one that already existed.
    """
    volume = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)
    price = build_klines_last_entry("BTCUSDT", verified_by=_VERIFIED_BY)

    catalog = build_series_catalog((volume, price))

    assert len(catalog.entries) == 2
    assert volume.key.series_key_id() != price.key.series_key_id()
    assert price.key.metric == "klines_last"
    assert price.key.nature is Nature.STOCK
    assert price.key.denom == "quote"


def test_metric_is_not_the_sum_prefixed_name_that_would_invent_a_provenance() -> None:
    """`SPEC-007` §4.1: `sum_…` transcribes a Binance field, and `/fapi/v1/klines` has none.

    The assertion is on the PREFIX, not on the literal `sum_traded_volume`: any future
    `sum_*` rename of this metric would claim a field the endpoint does not publish, and this
    test has to reject the class, not one member of it.
    """
    assert not KLINES_VOLUME_METRIC.startswith("sum_")
    assert KLINES_VOLUME_METRIC == "klines_volume"
    assert KLINES_VOLUME_METRIC not in FORBIDDEN_METRIC_NAMES


def test_quantity_field_is_na_because_klines_does_not_derive_from_aggtrade() -> None:
    """The rejected alternative, pinned: `quantity_field` cannot distinguish these two rows.

    `quantity_field` is "which `aggTrade` quantity the series is built from"
    (`series_key.py:138`). `klines` derives from neither `q` nor `nq`, so `NA` is the correct
    value for the volume row AND for `klines_last` — which is exactly why reusing
    `klines_last` with a different `quantity_field` was refused (`SPEC-007` §4.1).
    """
    volume = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)
    price = build_klines_last_entry("BTCUSDT", verified_by=_VERIFIED_BY)

    assert volume.key.quantity_field is QuantityField.NA
    assert price.key.quantity_field is QuantityField.NA
    assert volume.key.quantity_field is price.key.quantity_field


def test_klines_volume_is_not_a_price_source() -> None:
    """`SPEC-001` §3.7's closed set has five names and volume is not one of them.

    A volume row that leaked into `PRICE_SOURCES` would let `resolve_price_source` answer a
    price question with a traded quantity — `ADR-007`/`PS-1`'s exact failure ("a escolha muda
    ONDE O SWING ESTÁ"), reached by a different door.
    """
    entry = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert KLINES_VOLUME_METRIC not in PRICE_SOURCES
    assert entry.price_use is None


# ── `FLOW` is a claim about the read path, not a label (`RN-1`) ─────────────────────────────


def test_volume_is_a_flow_aggregated_over_the_bucket_and_never_a_stock() -> None:
    """`Nature.FLOW` + `AGGREGATE_OVER_BUCKET` + `SUM` are one statement in three terms.

    `Nature.FLOW`'s own docstring: "`LOCF` over it is a type error, never UX". Declaring
    `STOCK` here — or `POINT_AT_BUCKET_END`, or `LAST` — would license the read path to carry
    the last known bar forward across a gap, which for traded volume invents trades that did
    not happen. That is `RN-1` ("ausência renderizada como zero é erro de tipo") in its other
    direction, and it starts in the identity, not in the renderer.

    There is deliberately no `assert key.nature is not Nature.STOCK` line: `mypy --strict`
    rejects it as `comparison-overlap` once `is Nature.FLOW` has narrowed the type — which is
    the static proof of the same claim, made by the type checker instead of at runtime.
    """
    key = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY).key

    assert key.nature is Nature.FLOW
    assert key.ts_convention is TsConvention.AGGREGATE_OVER_BUCKET
    assert key.reduction is Reduction.SUM


def test_interval_is_the_grid_series_history_serves_natively() -> None:
    """`interval == native_grid` is what exempts M1 from `GA-2`/`RN-S1`'s staircase.

    `/api/v1/series-history` walks a 1-minute grid and refuses any other `interval`
    (`ADR-034/D6`). A `5m` series is served as the same bar repeated five times, and `RN-S1`
    then forbids counting those repeats as distinct points in `DoD-3`. M1 declares `1m`
    against a `1min` native grid, so a distinct point on the wire is a distinct bar at the
    origin.
    """
    entry = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)
    price = build_klines_last_entry("BTCUSDT", verified_by=_VERIFIED_BY)

    assert entry.key.interval == "1m"
    assert entry.native_grid == "1min"
    assert entry.key.interval != price.key.interval
    assert price.key.interval == "5m"


def test_denom_is_base_which_is_the_field_the_endpoint_publishes_at_index_5() -> None:
    """`denom="base"` names WHICH of the two volume fields of the array this row is.

    `/fapi/v1/klines` publishes `volume` at index `[5]` (base asset) and `quoteAssetVolume` at
    index `[7]` (quote asset). They are different numbers for the same bucket, so `denom` is
    not decoration: getting it wrong makes the series claim a field it never read, and
    changing it later re-identifies the series (`series_key.py:226`) — migration, not a fix.
    """
    key = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY).key

    assert key.denom == "base"
    assert key.denom != "quote"


def test_unit_is_required_and_never_hardcoded_to_btc() -> None:
    """With `denom="base"` the unit IS the instrument's base asset — `ETH` for `ETHUSDT`."""
    entry = build_klines_volume_entry("ETHUSDT", unit="ETH", verified_by=_VERIFIED_BY)

    assert entry.key.unit == "ETH"
    assert entry.key.instrument_id == "ETHUSDT"


def test_the_row_is_read_from_the_origin_and_declares_no_reconstruction() -> None:
    """`reconstructed_from=None` ⇒ `published_error=None`, and the guard enforces the pair.

    The bucket is what the origin itself publishes, so there is no ground truth this row
    approximates and no `(median, p99, n)` to declare (`D6.9`). Unlike `coinalyze_bv`, which
    cannot be constructed without one.
    """
    entry = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert entry.reconstructed_from is None
    assert entry.published_error is None


# ── `verified_by` — the DoD, proven by mutation rather than asserted ────────────────────────


def test_verified_by_is_inside_the_identity_of_klines_volume() -> None:
    """THE MUTATION THAT REJECTS: change only the test name, and the series changes.

    `series_key_id()` is the `sha256` of the canonical projection of the fifteen terms, and
    `verified_by` is one of them. Two rows identical in every other term must NOT share an
    id — that is what makes "the named test enters the identity" a measurable property of
    this row instead of a sentence in a plan.
    """
    real = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)
    mutated = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by="test_something_else.py")

    assert real.key.series_key_id() != mutated.key.series_key_id()

    differing = {
        term
        for term, value in real.key.canonical_terms().items()
        if value != mutated.key.canonical_terms()[term]
    }
    assert differing == {"verified_by"}


def test_verified_by_names_a_file_that_actually_exists() -> None:
    """The name is a REFERENCE, and a reference that resolves to nothing verifies nothing.

    `SPEC-001` §3.3 reads `verified_by` as "apontando para um teste" — so the value the
    production row is built with has to be the name of a real test file. Renaming this file
    without updating the constant fails here, which is the cheapest place to catch it: the
    same rename silently re-identifies every series built with the old string.
    """
    assert Path(__file__).name == _VERIFIED_BY
    assert (Path(__file__).parent / _VERIFIED_BY).is_file()


def test_blank_verified_by_is_refused_by_the_identity_itself() -> None:
    """A row cannot be built claiming verification by nobody — `SeriesKey.__post_init__`."""
    with pytest.raises(IncompleteSeriesKeyError, match="verified_by"):
        build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by="   ")


@pytest.mark.parametrize("blank", ["", "  "])
def test_blank_unit_is_refused_by_the_identity_itself(blank: str) -> None:
    """`unit` is a term of identity: blank does not distinguish `BTC` volume from `ETH`."""
    with pytest.raises(IncompleteSeriesKeyError, match="unit"):
        build_klines_volume_entry("BTCUSDT", unit=blank, verified_by=_VERIFIED_BY)
