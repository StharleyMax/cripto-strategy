"""`T-01.3`: the `klines_volume` mapping, and the SIGN of the anti-lookahead cut (`RS-3.4`).

⛔ WHY THE FALSIFIERS HERE ARE WRITTEN AGAINST THE SIGN AND NOT AGAINST A FLAG.

`CLAUDE.md` records, as one of the three real defects this project's measurement discipline
found, "uma regra anti-lookahead que estava INVERTIDA e propagada por dois documentos". A test
that asserts "the mapping has a finality rule" passes just as happily when the rule keeps the
partial bucket and throws away the settled ones. So every assertion below names WHICH buckets
survive, by value, and the mutation table in the gate report records that flipping `<` to `>`
(or relaxing it to `<=` on the boundary tick) fails a named test.

The fixture is the SHAPE THAT WAS MEASURED, not an invented one `[MEDIDO 2026-09-10, tasks.toml
`T-01.3`]`: `/fapi/v1/klines` answers with the minute currently in progress as its newest
element, ~58 s behind the wall clock, carrying a partial `volume` — `4.413` against `10`-`44`
in the settled neighbours. Recording that `4.413` as the minute's traded volume understates it
by whatever had not traded yet, which is the lookahead defect inverted: a number no decision
taken at that minute could have seen, filed as though it had settled.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.cvd_source_catalog import (
    CVD_SOURCE_METRIC,
    build_kline_takerbuy_entry,
)
from src.modules.sentimento.domain.kline_cvd import TakerBuyExceedsVolumeError
from src.modules.sentimento.domain.klines_volume_catalog import (
    KLINES_VOLUME_METRIC,
    build_klines_volume_entry,
)
from src.modules.sentimento.domain.provenance import (
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_key import Nature
from src.modules.sentimento.infra.binance_klines_client import KlineRow
from src.modules.sentimento.use_cases.collector_run_mapping import (
    KLINES_ENDPOINT,
    KLINES_OBSERVER_ID,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    KLINES_BUCKET_WIDTH_MS,
    build_klines_to_rows,
    is_closed_bucket,
)

# The `verified_by` `use_cases/series_catalog.py` (`T-01.6`) has to register the SERVED entry
# with — `T-01.1` created the identity and this is the name of the test that backs it. Spelled
# here as a literal, deliberately NOT imported from the production module: importing it would
# make the contract test below compare a value to itself.
_CATALOG_VERIFIED_BY = "test_klines_volume_catalog.py"

# One whole minute, UTC, well inside the endpoint's own depth (BTCUSDT since 2019-09-08).
_T0 = 1_788_000_000_000
_CLOSE_OFFSET_MS = KLINES_BUCKET_WIDTH_MS - 1  # Binance: closeTime = openTime + 59999


def _kline(open_time_ms: int, volume: str, taker_buy: str = "5.0") -> KlineRow:
    """Build a REAL `KlineRow` (not a stand-in) with the 12 fields the endpoint returns.

    Using the production type is what proves `KlineLike` — the structural `Protocol` the
    mapping is written against, because `use_cases` may not import `infra` — actually matches
    the class that will be passed in production. A hand-rolled double would let the two drift.
    """
    return KlineRow(
        raw=(
            open_time_ms,
            "100.0",
            "101.0",
            "99.0",
            "100.5",
            volume,
            open_time_ms + _CLOSE_OFFSET_MS,
            "1000.0",
            42,
            taker_buy,
            "500.0",
            "0",
        )
    )


# The measured shape: three settled minutes, then the one in progress.
_SETTLED_VOLUMES = ("10.221", "44.108", "23.775")
_PARTIAL_VOLUME = "4.413"


def _measured_page() -> tuple[KlineRow, ...]:
    """Four bars: three closed, then the in-progress one the endpoint always appends."""
    return tuple(
        _kline(_T0 + index * KLINES_BUCKET_WIDTH_MS, volume)
        for index, volume in enumerate((*_SETTLED_VOLUMES, _PARTIAL_VOLUME))
    )


def _now_with_the_last_bucket_still_open() -> int:
    """Return an instant INSIDE the fourth bucket — the ~58 s lag the measurement shows."""
    return _T0 + 3 * KLINES_BUCKET_WIDTH_MS + 2_000


def _volume_id(instrument_id: str = "BTCUSDT", unit: str = "BTC") -> str:
    """Return the `series_key_id` of the M1 volume identity — phase `01`'s row."""
    return build_klines_volume_entry(
        instrument_id, unit=unit, verified_by=_CATALOG_VERIFIED_BY
    ).key.series_key_id()


def _cvd_id(instrument_id: str = "BTCUSDT", unit: str = "BTC") -> str:
    """Return the M5 CVD identity's `series_key_id` — phase `02`'s row, same page, no request."""
    return build_kline_takerbuy_entry(instrument_id, unit=unit).key.series_key_id()


def _values_of(rows: tuple[SeriesRow, ...], series_key_id: str) -> tuple[str, ...]:
    """Project the `value_raw`s of ONE identity out of a page that now carries two."""
    return tuple(row.value_raw for row in rows if row.series_key_id == series_key_id)


# ── THE ANTI-LOOKAHEAD CUT: WHICH BUCKETS SURVIVE, BY VALUE ────────────────────────────────


def test_the_in_progress_bucket_is_the_one_dropped_not_the_ones_around_it() -> None:
    """The newest, still-open bar is absent and the three settled ones are present, in order.

    Morde: invert `is_closed_bucket`'s comparison (`<` -> `>`) and this returns exactly the
    complement — one row, the partial one — so the assertion fails on BOTH halves at once
    (count and content), which is what makes it a test of the sign rather than of the flag.
    """
    to_rows = build_klines_to_rows()
    rows = to_rows(_now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page())
    assert _values_of(rows, _volume_id()) == _SETTLED_VOLUMES
    assert _PARTIAL_VOLUME not in {row.value_raw for row in rows}


def test_the_bucket_end_of_the_dropped_bar_is_the_newest_one_never_a_middle_one() -> None:
    """The bar that was cut is the NEWEST, by `bucket_end` — not an arbitrary one.

    Morde: a rule that dropped the OLDEST bar (an off-by-one on a slice instead of a finality
    predicate) would keep the same COUNT, so counting alone cannot see it. This names the
    boundary instant that must be missing and the one that must be the last present.
    """
    to_rows = build_klines_to_rows()
    rows = to_rows(_now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page())
    ends = [row.bucket_end for row in rows]
    assert ends[0] == _T0 + KLINES_BUCKET_WIDTH_MS
    assert ends[-1] == _T0 + 3 * KLINES_BUCKET_WIDTH_MS
    assert _T0 + 4 * KLINES_BUCKET_WIDTH_MS not in ends


def test_the_closing_millisecond_itself_still_counts_as_an_open_bucket() -> None:
    """At `observed_at == close_time_ms` the bucket is STILL OPEN — that ms is inside it.

    Morde: relax `<` to `<=` and the bar published at its own last millisecond is one
    millisecond short of settled, which is the smallest possible version of the same lie.
    """
    bar = _kline(_T0, "10.0")
    assert is_closed_bucket(bar, bar.close_time_ms) is False
    assert is_closed_bucket(bar, bar.close_time_ms + 1) is True


def test_a_page_read_while_every_bucket_is_still_open_publishes_nothing() -> None:
    """Reading ahead of the grid yields ZERO rows, never a partial one "to have something".

    The degenerate case is the one an availability-driven implementation gets wrong: with
    nothing settled yet, the honest answer is absence (`RN-1`), not the newest partial value.
    """
    to_rows = build_klines_to_rows()
    assert to_rows(_T0, "BTCUSDT", _measured_page()) == ()


def test_every_published_row_declares_finality_rather_than_leaving_it_unknown() -> None:
    """`is_final is True` on what survives — the source DOES declare a closed kline final.

    `SeriesRow.is_final`'s own docstring reserves `None` for "the source does not declare
    finality"; a closed kline is the opposite case, and saying so is what lets `as_of`
    (`as_of_accessor.py:420`) tell it apart from a partial row it must refuse.
    """
    to_rows = build_klines_to_rows()
    rows = to_rows(_now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page())
    assert rows
    assert all(row.is_final is True for row in rows)


# ── THE IDENTITY CONTRACT WITH `T-01.6`'s SERVED CATALOG ───────────────────────────────────


def test_the_published_series_key_id_is_the_one_the_served_catalog_registers() -> None:
    """The collector's rows land under the SAME `series_key_id` the catalog will publish.

    This is the elo of the vertical slice, and it fails SILENTLY if it breaks: `verified_by`
    is the fifteenth term of `SeriesKey` and the `sha256` of all fifteen IS the id
    (`series_key.py:226-234`). A divergence leaves `md.series` full of rows while
    `/api/v1/series-history` answers `422 UnknownSeriesKeyIdError`, with both halves looking
    healthy on their own.

    Morde: change `_KLINES_VOLUME_VERIFIED_BY` in the mapping (or the `unit`, or the
    `instrument_id`) and this fails, naming the triple.
    """
    expected = build_klines_volume_entry(
        "BTCUSDT", unit="BTC", verified_by=_CATALOG_VERIFIED_BY
    ).key
    rows = build_klines_to_rows()(
        _now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page()
    )
    assert rows
    assert {row.series_key_id for row in rows} == {expected.series_key_id(), _cvd_id()}
    assert expected.metric == KLINES_VOLUME_METRIC
    assert expected.nature is Nature.FLOW


def test_the_unit_follows_the_instrument_so_eth_is_not_labelled_in_btc() -> None:
    """`ETHUSDT` publishes under the `ETH`-denominated identity, not the `BTC` one.

    `klines_volume` carries `denom="base"`, and `domain/klines_volume_catalog.py` is explicit
    that a hardcoded `"BTC"` "would silently mislabel every non-`BTC` instrument". Two
    instruments sharing one `series_key_id` would merge two markets into one chart.
    """
    page = _measured_page()
    now = _now_with_the_last_bucket_still_open()
    eth = build_klines_to_rows()(now, "ETHUSDT", page)
    btc = build_klines_to_rows()(now, "BTCUSDT", page)
    assert eth and btc
    assert {row.series_key_id for row in eth}.isdisjoint({row.series_key_id for row in btc})
    assert {row.series_key_id for row in eth} == {
        _volume_id("ETHUSDT", "ETH"),
        _cvd_id("ETHUSDT", "ETH"),
    }


# ── GRID, PROVENANCE AND THE RAW STRING ────────────────────────────────────────────────────


def test_bucket_end_is_the_whole_minute_instant_not_the_sources_59999() -> None:
    """`bucket_end == open_time + 60000`, the grid `series_history.py` walks its X axis on.

    Morde: pass `close_time_ms` through verbatim and every volume bar sits one millisecond off
    the grid every other series in `md.series` is stamped on — admitted by `as_of`, and wrong
    on the axis in a way no exception would ever report.
    """
    rows = build_klines_to_rows()(
        _now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page()
    )
    assert all(row.bucket_end % KLINES_BUCKET_WIDTH_MS == 0 for row in rows)
    assert all(row.event_time == row.bucket_end for row in rows)


def test_the_collectors_clock_and_the_sources_clock_are_not_collapsed() -> None:
    """`available_at`/`ingested_at`/`observed_at` are OUR clock; `event_time` is the bucket.

    Collapsing them would erase the ~58 s publication lag of this endpoint from the data — the
    very quantity `ADR-006`'s staleness lenses and `RS-3.4` are about.
    """
    now = _now_with_the_last_bucket_still_open()
    rows = build_klines_to_rows()(now, "BTCUSDT", _measured_page())
    assert rows
    for row in rows:
        assert row.available_at == now
        assert row.ingested_at == now
        assert row.observed_at == now
        assert row.event_time < now
        assert row.availability_source is AvailabilitySource.OBSERVED
        assert row.provenance is Provenance.OBSERVED


def test_value_raw_is_the_exact_decimal_string_never_a_float_round_trip() -> None:
    """The published value is byte-identical to index `[5]` of the source array.

    `SPEC-001` §2.6's discipline: a `float` round trip loses the exact decimal the exchange
    quoted, and `md.series.value_raw` is `TEXT NOT NULL` precisely so it cannot.
    """
    rows = build_klines_to_rows()(
        _now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page()
    )
    assert _values_of(rows, _volume_id()) == _SETTLED_VOLUMES


def test_the_source_column_names_the_endpoint_the_rows_came_from() -> None:
    """`source`/`src_label_raw`/`observer_id` name the klines producer, not a neighbour's."""
    rows = build_klines_to_rows()(
        _now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page()
    )
    assert rows
    assert all(row.source == KLINES_ENDPOINT for row in rows)
    assert all(row.src_label_raw == KLINES_ENDPOINT for row in rows)
    assert all(row.observer_id == KLINES_OBSERVER_ID for row in rows)


# ── THE SYMBOL UNIVERSE AND THE BASE ASSET ─────────────────────────────────────────────────


def test_a_symbol_outside_the_configured_universe_yields_no_rows() -> None:
    """The owner's four-symbol universe is enforced here, like the other two producers."""
    to_rows = build_klines_to_rows()
    assert to_rows(_now_with_the_last_bucket_still_open(), "DOGEUSDT", _measured_page()) == ()


def test_the_universe_is_a_parameter_so_an_operator_can_narrow_it() -> None:
    """A caller may pass a smaller universe; anything outside it still yields nothing."""
    to_rows = build_klines_to_rows(symbols=frozenset({"BTCUSDT"}))
    now = _now_with_the_last_bucket_still_open()
    assert to_rows(now, "BTCUSDT", _measured_page())
    assert to_rows(now, "ETHUSDT", _measured_page()) == ()


# ── PHASE `02` (`T-02.3`): THE SECOND IDENTITY THAT RIDES THE SAME PAGE ────────────────────


def test_one_closed_bar_publishes_both_the_volume_row_and_the_cvd_row() -> None:
    """Each settled bar becomes TWO rows — `klines_volume` and `cvd_source`/`kline_takerbuy`.

    This is the capability phase `02` exists to demonstrate (`plano 02`, "a evidencia de que
    uma segunda identidade CONSEGUE pegar carona num coletor existente"), and it is asserted by
    IDENTITY rather than by count: `len(rows) == 6` would also pass if the mapping emitted the
    volume row twice.

    Morde: drop the CVD append and the two projections below come back `()` and `3`.
    """
    rows = build_klines_to_rows()(
        _now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page()
    )
    assert len(_values_of(rows, _volume_id())) == len(_SETTLED_VOLUMES)
    assert len(_values_of(rows, _cvd_id())) == len(_SETTLED_VOLUMES)
    assert _volume_id() != _cvd_id()


def test_the_cvd_value_is_two_times_takerbuy_minus_volume_as_an_exact_string() -> None:
    """`delta = 2 * takerBuy[9] - volume[5]`, byte-exact, never a `float` round trip.

    The numbers are the MEASURED ones `[MEDIDO 2026-09-10, BTCUSDT 1m: v=29,757 /
    takerBuy=2,626 / delta=-24,505]`, so the expected string below is the one the finding
    published rather than one recomputed to match whatever the code does.

    Morde: write the formula as `takerBuy - volume` (the sign error that looks right) and this
    reads `-27.131`; write it with `float` and it reads `-24.505000000000003`.
    """
    page = (_kline(_T0, "29.757", taker_buy="2.626"),)
    rows = build_klines_to_rows()(_T0 + 2 * KLINES_BUCKET_WIDTH_MS, "BTCUSDT", page)
    assert _values_of(rows, _cvd_id()) == ("-24.505",)
    assert _values_of(rows, _volume_id()) == ("29.757",)


def test_an_all_aggressor_buy_bucket_gives_a_delta_equal_to_its_own_volume() -> None:
    """`takerBuy == volume` -> `delta == +volume`; `takerBuy == 0` -> `delta == -volume`.

    The two extremes of the invariant, which pin the SCALE of the formula and not only its
    sign: a `delta` derived as `takerBuy - volume/2` would satisfy neither end.
    """
    now = _T0 + 2 * KLINES_BUCKET_WIDTH_MS
    all_buy = build_klines_to_rows()(now, "BTCUSDT", (_kline(_T0, "8.5", taker_buy="8.5"),))
    all_sell = build_klines_to_rows()(now, "BTCUSDT", (_kline(_T0, "8.5", taker_buy="0"),))
    assert _values_of(all_buy, _cvd_id()) == ("8.5",)
    assert _values_of(all_sell, _cvd_id()) == ("-8.5",)


def test_a_taker_buy_above_the_buckets_own_volume_is_refused_not_published() -> None:
    """Item 2.4's invariant, enforced on every bar the collector publishes.

    `takerBuy` is a PART of `volume`, so `takerBuy > volume` is a payload with no reading. Left
    unchecked it publishes a `delta` LARGER than the bucket's volume — a number that looks like
    strong signal and is not.

    Morde: delete the guard in `domain/kline_cvd.py` and this bar publishes `"11.0"` as the
    delta of a bucket whose whole traded volume was `1.0`.
    """
    page = (_kline(_T0, "1.0", taker_buy="6.0"),)
    with pytest.raises(TakerBuyExceedsVolumeError):
        build_klines_to_rows()(_T0 + 2 * KLINES_BUCKET_WIDTH_MS, "BTCUSDT", page)


def test_the_two_rows_of_a_bar_differ_only_in_identity_and_value() -> None:
    """Two readings OF THE SAME OBSERVATION: same bucket, same clocks, same provenance.

    Morde: hoist `bucket_end` out of the loop (compute it once from the newest bar, the shape
    a "small optimisation" arrives in) and every row of the page carries the LAST bucket's
    instant — which a single-bar fixture could never see, so the page below deliberately has
    three bars and asserts the SET of buckets, not only the count.

    ⚠️ A PREVIOUS VERSION OF THIS DOCSTRING CLAIMED TO FALSIFY A LATE-BINDING DEFECT, AND THAT
    CLAIM WAS FALSE. The production code bound `bucket_end` as a default argument of an inner
    closure "against late binding"; removing that binding killed NO test, because the closure
    was called in the same iteration and therefore read the current value. The mutation is what
    found it — the claim was prose that had never been run.
    """
    now = _now_with_the_last_bucket_still_open()
    rows = build_klines_to_rows()(now, "BTCUSDT", _measured_page())
    by_bucket: dict[int, list[SeriesRow]] = {}
    for row in rows:
        by_bucket.setdefault(row.bucket_end, []).append(row)
    assert sorted(by_bucket) == [_T0 + index * KLINES_BUCKET_WIDTH_MS for index in range(1, 4)]
    for pair in by_bucket.values():
        volume_row, cvd_row = pair
        assert {volume_row.series_key_id, cvd_row.series_key_id} == {_volume_id(), _cvd_id()}
        assert volume_row.value_raw != cvd_row.value_raw
        assert volume_row.bucket_end == cvd_row.bucket_end
        assert volume_row.event_time == cvd_row.event_time
        assert volume_row.observed_at == cvd_row.observed_at == now
        assert volume_row.is_final is cvd_row.is_final is True


def test_the_cvd_row_is_absent_for_the_in_progress_bucket_too() -> None:
    """`RS-3.4` cuts BOTH identities — a partial CVD is as much a lie as a partial volume.

    Morde: apply the finality cut only to the volume row and the newest, still-open bar
    publishes a CVD built from a `takerBuy` that is still growing.
    """
    rows = build_klines_to_rows()(
        _now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page()
    )
    partial_bucket_end = _T0 + 4 * KLINES_BUCKET_WIDTH_MS
    assert partial_bucket_end not in {row.bucket_end for row in rows}
    assert len(_values_of(rows, _cvd_id())) == len(_SETTLED_VOLUMES)


def test_the_cvd_identity_is_the_one_the_served_catalog_registers() -> None:
    """The writer's CVD id is the SERVED catalog's — the elo that fails silently if it breaks.

    Same failure shape `_KLINES_VOLUME_VERIFIED_BY` documents: a divergence answers `200` with
    `n_points = 0` for a series whose rows are in the table under another id.
    """
    entry = build_kline_takerbuy_entry("BTCUSDT", unit="BTC")
    rows = build_klines_to_rows()(
        _now_with_the_last_bucket_still_open(), "BTCUSDT", _measured_page()
    )
    assert entry.key.series_key_id() in {row.series_key_id for row in rows}
    assert entry.key.metric == CVD_SOURCE_METRIC
    assert entry.key.nature is Nature.FLOW
    assert entry.reconstructed_from is None
    assert entry.published_error is None
