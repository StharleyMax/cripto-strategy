"""`T-04.3`: one `/futures/data/globalLongShortAccountRatio` point -> one `SeriesRow`.

The fixture below is a VERBATIM copy of a real response body `[MEDIDO 2026-09-12]`:

    curl -s "https://fapi.binance.com/futures/data/globalLongShortAccountRatio
    ?symbol=BTCUSDT&period=5m&limit=30"
    [{"symbol":"BTCUSDT","longAccount":"0.6217","longShortRatio":"1.6434",
      "shortAccount":"0.3783","timestamp":1789209000000}, ...]

That matters more than usual here: the two field names this mapping reads are the ONLY place in
the codebase that knows the payload's shape, so a fabricated fixture would have tested the
mapping against itself.
"""

from __future__ import annotations

from collections.abc import Mapping

import pytest

from src.modules.sentimento.domain.long_short_catalog import (
    build_count_long_short_ratio_entry,
    count_long_short_ratio_key,
)
from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance
from src.modules.sentimento.use_cases.collector_run_mapping import (
    LONG_SHORT_ENDPOINT,
    LONG_SHORT_OBSERVER_ID,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    MalformedLongShortPointError,
    build_long_short_to_rows,
    is_settled_point,
)

_SYMBOL = "BTCUSDT"
_BUCKET_MS = 300_000
# A real stamp from the measured body above, so the arithmetic below runs on the source's own
# grid rather than on a round number that happens to divide by five minutes.
_T0 = 1_789_209_000_000


def _point(timestamp_ms: int, ratio: str = "1.6434") -> Mapping[str, object]:
    """One point in the exact shape the endpoint publishes — five keys, two of them read."""
    return {
        "symbol": _SYMBOL,
        "longAccount": "0.6217",
        "longShortRatio": ratio,
        "shortAccount": "0.3783",
        "timestamp": timestamp_ms,
    }


def test_one_settled_point_becomes_one_row_stamped_at_its_own_instant() -> None:
    """`bucket_end == event_time == timestamp` — no shift, because the stamp IS the bucket end.

    `[MEDIDO 2026-09-12]`: the endpoint publishes a point 9,6 s / 70,8 s AFTER the instant it
    stamps it with, never the ~300 s a bucket-START label would imply, so
    `long_short_catalog.LONG_SHORT_LABEL_SHIFT_MS` is an explicit `0` and this row carries the
    source's instant unchanged.
    """
    to_rows = build_long_short_to_rows()

    rows = to_rows(_T0 + 10_000, _SYMBOL, [_point(_T0)])

    assert len(rows) == 1
    row = rows[0]
    assert row.bucket_end == _T0
    assert row.event_time == _T0
    assert row.value_raw == "1.6434"
    assert row.symbol == _SYMBOL
    assert row.source == LONG_SHORT_ENDPOINT
    assert row.src_label_raw == LONG_SHORT_ENDPOINT
    assert row.observer_id == LONG_SHORT_OBSERVER_ID
    assert row.provenance is Provenance.OBSERVED
    assert row.availability_source is AvailabilitySource.OBSERVED
    assert row.is_final is True


def test_the_collectors_clock_is_kept_separate_from_the_sources() -> None:
    """`available_at`/`ingested_at`/`observed_at` are OURS; `event_time`/`bucket_end` are theirs.

    Collapsing the two would flatten the publication delay this phase measured (9,6 s / 70,8 s)
    into nothing, which is the fact an operator needs in order to ask whether the panel is late.
    """
    received_at = _T0 + 70_800
    to_rows = build_long_short_to_rows()

    row = to_rows(received_at, _SYMBOL, [_point(_T0)])[0]

    assert (row.available_at, row.ingested_at, row.observed_at) == (received_at,) * 3
    assert row.event_time == _T0
    assert row.available_at - row.event_time == 70_800


def test_a_point_stamped_in_the_future_is_the_one_dropped() -> None:
    """⛔ THE SIGN OF THE ANTI-LOOKAHEAD CUT — the neighbours survive, the future one does not.

    Written against the SIGN and not against the existence of a filter, because `CLAUDE.md`
    records that an anti-lookahead rule of this project was already INVERTED once and propagated
    through two documents. Swapping `<=` for `>=` in `is_settled_point` turns this assertion
    inside out: it would keep exactly the one row this test says must go and drop the two it
    says must stay.
    """
    received_at = _T0 + _BUCKET_MS + 10_000
    points = [
        _point(_T0, "1.60"),
        _point(_T0 + _BUCKET_MS, "1.61"),
        _point(_T0 + 2 * _BUCKET_MS, "1.62"),
    ]
    to_rows = build_long_short_to_rows()

    rows = to_rows(received_at, _SYMBOL, points)

    assert [row.value_raw for row in rows] == ["1.60", "1.61"]
    assert [row.bucket_end for row in rows] == [_T0, _T0 + _BUCKET_MS]


def test_the_boundary_tick_counts_as_settled_because_the_instant_belongs_to_the_reading() -> None:
    """`timestamp == observed_at` survives: `POINT_AT_BUCKET_END` means the instant IS the row."""
    assert is_settled_point(_T0, _T0) is True
    assert is_settled_point(_T0 + 1, _T0) is False


def test_a_symbol_outside_the_pilot_universe_yields_no_rows() -> None:
    """The same filter the other three producers apply — `INITIAL_SYMBOLS` is the whole gate."""
    to_rows = build_long_short_to_rows()

    assert to_rows(_T0 + 10_000, "DOGEUSDT", [_point(_T0)]) == ()


def test_a_narrowed_symbol_set_is_honoured_rather_than_ignored() -> None:
    """MORDE: `symbols` is a real parameter, not decoration — `BTCUSDT` out means no rows."""
    to_rows = build_long_short_to_rows(symbols=frozenset({"ETHUSDT"}))

    assert to_rows(_T0 + 10_000, _SYMBOL, [_point(_T0)]) == ()


@pytest.mark.parametrize(
    "broken",
    [
        {"symbol": _SYMBOL, "longShortRatio": "1.64"},
        {"symbol": _SYMBOL, "timestamp": _T0},
        {"symbol": _SYMBOL, "timestamp": "1789209000000", "longShortRatio": "1.64"},
        {"symbol": _SYMBOL, "timestamp": _T0, "longShortRatio": ""},
        {"symbol": _SYMBOL, "timestamp": _T0, "longShortRatio": 1.64},
    ],
)
def test_a_point_missing_a_field_raises_instead_of_being_skipped(
    broken: Mapping[str, object],
) -> None:
    """MORDE: a payload this mapping cannot read is loud, never a silently shorter page.

    Skipping would produce a gap in `md.series` that no run record and no log line accounts for,
    and after the fact nothing distinguishes "the source did not publish this bucket" from "we
    could not read what it published".
    """
    to_rows = build_long_short_to_rows()

    with pytest.raises(MalformedLongShortPointError):
        to_rows(_T0 + 10_000, _SYMBOL, [broken])


def test_the_writer_and_the_served_catalog_land_on_one_series_key_id() -> None:
    """⛔ THE CROSS-SIDE CONTRACT. Two ids that merely look alike serve `200` with zero points.

    `verified_by` is the fifteenth term of the key, so a writer and a reader carrying two
    different strings for it produce two different `series_key_id`s — and
    `/api/v1/series-history` then answers `200` with `n_points = 0` for a table full of rows, the
    silent `rc=0` failure `ADR-012` names. This asserts the two sides by CONSTRUCTION: both call
    `count_long_short_ratio_key`, so there is nothing for them to disagree about.
    """
    to_rows = build_long_short_to_rows()

    row = to_rows(_T0 + 10_000, _SYMBOL, [_point(_T0)])[0]

    assert row.series_key_id == count_long_short_ratio_key(_SYMBOL).series_key_id()
    assert row.series_key_id == build_count_long_short_ratio_entry(_SYMBOL).key.series_key_id()


def test_every_pilot_symbol_maps_to_its_own_series_and_none_share_an_id() -> None:
    """Four symbols, four ids — the defect `series_catalog.py` records for a hardcoded unit."""
    to_rows = build_long_short_to_rows()
    ids = {
        to_rows(_T0 + 10_000, symbol, [_point(_T0)])[0].series_key_id
        for symbol in ("BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT")
    }

    assert len(ids) == 4
