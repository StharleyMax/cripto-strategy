"""Falsifiers for `ADR-038`/`D1`: the stamp is invariant, and the two absences are enforced."""

import pytest

from src.modules.sentimento.domain.long_short_catalog import (
    LONG_SHORT_NATIVE_GRID_MS,
    count_long_short_ratio_key,
)
from src.modules.sentimento.domain.modeled_availability import (
    GRID_INVARIANT_ENDPOINTS,
    MODELED_AVAILABILITY_SOURCE,
    EndpointHasNoGridInvariantStampError,
    GridInvariantEndpoint,
    InvalidGridInvariantEndpointError,
    modeled_available_at,
    modeled_available_at_for_endpoint,
    stamps_over_band,
)
from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_key
from src.modules.sentimento.domain.provenance import AvailabilitySource
from src.modules.sentimento.domain.series_key import Nature

# A real grid-aligned open-interest instant: `1789218300000 % 300_000 == 0`, the point
# `collector_series_mapping.py` quotes from a measured page.
_GRID_INSTANT_MS = 1_789_218_300_000

# The klines numbers that put it OUTSIDE the band — native grid and the `p99` measured in
# `ADR-038` §0 over the stable window (`n = 696` buckets). They are constants here so the
# refusal test reads as the real case and not as an invented one.
_KLINES_GRID_MS = 60_000
_KLINES_P99_LAG_MS = 61_071


def test_the_stamp_is_invariant_over_the_whole_lag_band_for_every_declared_endpoint() -> None:
    """⛔ THIS IS `ADR-038`/`D1`'s ENTIRE ARGUMENT, COMPUTED INSTEAD OF ARGUED.

    `D1` does not measure `p99_lag`; it shows the stamp cannot depend on it, because rounding UP
    to a `300_000 ms` grid sends every lag in `(0, 300_000]` to the same point. If that were
    false, the decision would be an unmeasured guess wearing a formula.

    The sweep is what makes it a falsifier rather than a restatement: replace `ceil` with
    `floor` or with round-to-nearest in `modeled_available_at` and this set stops being a
    singleton, so the mutation fails HERE instead of shipping a row that claims a consumer knew
    a bucket before the lag elapsed.
    """
    for endpoint, entry in GRID_INVARIANT_ENDPOINTS.items():
        stamps = stamps_over_band(entry, bucket_end_ms=_GRID_INSTANT_MS, step_ms=997)
        assert stamps == {_GRID_INSTANT_MS + entry.native_grid_ms}, endpoint


def test_the_stamp_is_one_native_grid_after_a_grid_aligned_bucket() -> None:
    """`available_at_MODELED = bucket_end + 1 grade nativa` — the sentence `D1` decides."""
    for endpoint in GRID_INVARIANT_ENDPOINTS:
        stamp = modeled_available_at_for_endpoint(endpoint=endpoint, bucket_end_ms=_GRID_INSTANT_MS)
        assert stamp == _GRID_INSTANT_MS + 300_000, endpoint
        assert stamp % 300_000 == 0, endpoint


def test_rounding_is_always_up_so_an_off_grid_bucket_never_lands_early() -> None:
    """⛔ THE DIRECTION OF THE ROUNDING IS THE ANTI-LOOKAHEAD RULE (`SPEC-001` §5.2).

    `CLAUDE.md` records an anti-lookahead rule of this project that was already INVERTED once
    and propagated through two documents, so the direction is pinned against a case where up and
    down differ: an off-grid bucket with a 1 ms lag. `floor` would answer `_GRID_INSTANT_MS`
    itself — BEFORE the bucket's own successor — which is knowledge nobody had.
    """
    off_grid = _GRID_INSTANT_MS + 1
    stamp = modeled_available_at(
        bucket_end_ms=off_grid, native_grid_ms=300_000, lag_with_margin_ms=1
    )
    assert stamp == _GRID_INSTANT_MS + 300_000
    assert stamp > off_grid


def test_klines_cannot_even_be_written_down_as_a_grid_invariant_endpoint() -> None:
    """⛔ THE REFUSAL IS IN THE CONSTRUCTOR — `(60_000, 61_071)` is not expressible.

    This is the mutation the task warns about: applying `D1` to klines. `p99 = 61_071 ms` is
    OUTSIDE `(0, 60_000]`, so the invariance does not hold and the stamp WOULD move with the
    lag. The type refuses it at construction, which means a future editor cannot add the row to
    `GRID_INVARIANT_ENDPOINTS` and have the module import.
    """
    with pytest.raises(InvalidGridInvariantEndpointError) as excinfo:
        GridInvariantEndpoint(
            endpoint="/fapi/v1/klines",
            native_grid_ms=_KLINES_GRID_MS,
            lag_upper_bound_ms=_KLINES_P99_LAG_MS,
            nature=Nature.STOCK,
            evidence="ADR-038 §0, n=696",
        )
    assert "60000" in str(excinfo.value)
    assert "61071" in str(excinfo.value)


def test_klines_is_absent_from_the_table_and_asking_for_its_stamp_raises() -> None:
    """No silent fallback: an uncovered endpoint gets an exception, never a default.

    A fallback here would rebuild, with a different number, the `event_time + interval` default
    that `SPEC-001` §5.2 measured as 361x optimistic and forbids.
    """
    assert "/fapi/v1/klines" not in GRID_INVARIANT_ENDPOINTS
    with pytest.raises(EndpointHasNoGridInvariantStampError):
        modeled_available_at_for_endpoint(
            endpoint="/fapi/v1/klines", bucket_end_ms=_GRID_INSTANT_MS
        )


def test_the_table_covers_exactly_one_endpoint_and_names_why_the_other_two_are_out() -> None:
    """`ADR-038` §3 names TWO endpoints for `D1`. Only one of them survives measurement.

    klines is out because its lag band leaves the grid; `globalLongShortAccountRatio` is out
    because its NATURE leaves the read (the next test). A third entry appearing here is scope
    this decision never bought, and a re-added second entry is a measured regression.
    """
    assert sorted(GRID_INVARIANT_ENDPOINTS) == ["/futures/data/openInterestHist"]


def test_a_nature_that_does_not_carry_forward_is_refused_with_the_arithmetic_named() -> None:
    """⛔ THE SECOND REFUSAL, AND IT IS THE ONE `ADR-038` DID NOT MEASURE.

    `as_of_accessor.py:328` vetoes a read when `age_ms >= bucket_interval_ms` and the nature does
    not carry forward. A row stamped `bucket_end + G` is admissible only from `bucket_end + G`,
    so `age_ms >= G` at every readable instant and the veto always fires. Measured against the
    real store through the real mapper, `61` slots of 1 min at `kt = agora`, BTCUSDT: offset
    `34_532` -> `61/61`, `66_712` -> `48/61` (what `ADR-038` §1.2 row `F` reports), `299_999` ->
    `12/61`, `300_000` -> `0/61` `[MEDIDO 2026-09-12, n=1.000 linhas; C0=0/61, C1=61/61]`.

    `D1` emits the last of those, and the endpoint reads `4/61` today ⇒ regression. Deleting the
    carry-forward guard in `__post_init__` makes this test fail rather than a panel go blank.
    """
    with pytest.raises(InvalidGridInvariantEndpointError) as excinfo:
        GridInvariantEndpoint(
            endpoint="/futures/data/globalLongShortAccountRatio",
            native_grid_ms=LONG_SHORT_NATIVE_GRID_MS,
            lag_upper_bound_ms=LONG_SHORT_NATIVE_GRID_MS,
            nature=count_long_short_ratio_key("BTCUSDT").nature,
            evidence="ADR-038 §3 says this endpoint is covered; the measurement says otherwise",
        )
    assert "carry forward" in str(excinfo.value)
    assert "/futures/data/globalLongShortAccountRatio" not in GRID_INVARIANT_ENDPOINTS


def test_the_declared_grid_matches_the_catalog_that_already_declares_it() -> None:
    """The grid and the nature are facts the catalog already owns, not literals typed twice.

    A drift between the two files would move the stamp of every future row while both files
    still read correctly in isolation — the silent `rc=0` class.
    """
    entry = GRID_INVARIANT_ENDPOINTS["/futures/data/openInterestHist"]
    key = binance_open_interest_key(instrument_id="BTCUSDT")
    assert entry.native_grid_ms == 300_000
    assert entry.modeled_stamp_offset_ms == entry.native_grid_ms
    assert entry.nature is key.nature
    # The other 5-minute catalog agrees on the GRID and differs on the NATURE — which is exactly
    # the pair of facts that puts one endpoint in this table and the other outside it.
    assert LONG_SHORT_NATIVE_GRID_MS == entry.native_grid_ms
    assert count_long_short_ratio_key("BTCUSDT").nature is not key.nature


def test_a_computed_stamp_is_never_labelled_observed() -> None:
    """`availability_source` is the column that tells a consumer the stamp was CALCULATED."""
    # `mypy` REFUSES the complementary assertion (`is not AvailabilitySource.OBSERVED`) as a
    # non-overlapping identity check — the type system already proves the negative half, so
    # writing it would be a line that can never fail. The positive half is the one with content.
    assert MODELED_AVAILABILITY_SOURCE is AvailabilitySource.MODELED


@pytest.mark.parametrize(
    ("native_grid_ms", "lag_upper_bound_ms"),
    [(0, 1), (-300_000, 1), (300_000, 0), (300_000, -1)],
)
def test_a_non_positive_grid_or_band_is_refused(
    native_grid_ms: int, lag_upper_bound_ms: int
) -> None:
    """A zero band would claim a bucket is knowable at the instant it ended."""
    with pytest.raises(InvalidGridInvariantEndpointError):
        GridInvariantEndpoint(
            endpoint="/x",
            native_grid_ms=native_grid_ms,
            lag_upper_bound_ms=lag_upper_bound_ms,
            nature=Nature.STOCK,
            evidence="n/a",
        )


def test_a_sweep_that_does_not_advance_is_refused_instead_of_reporting_invariance() -> None:
    """A `step_ms <= 0` sweep would report an invariance it never tested — the `rc=0` failure."""
    entry = GRID_INVARIANT_ENDPOINTS["/futures/data/openInterestHist"]
    with pytest.raises(InvalidGridInvariantEndpointError):
        stamps_over_band(entry, bucket_end_ms=_GRID_INSTANT_MS, step_ms=0)


def test_modeled_available_at_refuses_a_non_positive_lag() -> None:
    """`SPEC-001` §5.2 adds a lag AND a margin; a non-positive sum is not that formula."""
    with pytest.raises(InvalidGridInvariantEndpointError):
        modeled_available_at(
            bucket_end_ms=_GRID_INSTANT_MS, native_grid_ms=300_000, lag_with_margin_ms=0
        )
