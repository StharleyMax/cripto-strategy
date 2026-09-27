"""`/series-history` serves `OiCandle`s chosen ONE series per bucket — `T-03.9`, `ADR-045/D2`.

`plano 03` item 3b.2: "A rota serve `OiCandle` com `derived_from` e `samples`". What this file
proves through `build_series_history_report`, the route's own use case, over the REAL catalog
rows of both regimes (`openInterestHist` 5 min and the polled 1 min series of `T-03.3`):

* both series are read, and the bucket where capture starts comes out of ONE of them;
* requesting either series' id gives the same candles;
* a polling hole at `T0` is a hole — `as_of`'s carry-forward is NOT taken as `p(T0)`;
* a fact not yet knowable by `knowledge_time` is not a reading;
* a panel that is not open interest carries `oi_candles: null`.

History values sit around `1000`, polling around `2000`, so a mixed candle cannot hide.
"""

from __future__ import annotations

import dataclasses
from decimal import Decimal

from src.modules.charts.domain.panel_grid_enablement import classify_grid_multiple
from src.modules.sentimento.domain.as_of_accessor import BarPolicy, Observation
from src.modules.sentimento.domain.oi_candle import OiCandleSource
from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_poll_entry,
    open_interest_catalog_entries,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import (
    PanelGridVerdict,
    SeriesHistoryReport,
)
from src.modules.sentimento.domain.series_key import Nature, SeriesKey
from src.modules.sentimento.use_cases.series_history import build_series_history_report

SYMBOL = "BTCUSDT"
MINUTE_MS = 60_000
FIVE_MIN_MS = 5 * MINUTE_MS
ORIGIN_MS = 1_789_200_000_000 - (1_789_200_000_000 % (4 * 60 * MINUTE_MS))

HIST_LAG_MS = 35_000
POLL_LAG_MS = 1_000

POLL = OiCandleSource.BINANCE_POLL_1M.value
HIST = OiCandleSource.BINANCE_POINT_5M.value


def _at(minute: int) -> int:
    return ORIGIN_MS + minute * MINUTE_MS


def _hist_entry() -> SeriesCatalogEntry:
    (entry,) = [
        entry
        for entry in open_interest_catalog_entries(SYMBOL).entries
        if entry.key.provider == "binance"
    ]
    return entry


def _poll_entry() -> SeriesCatalogEntry:
    return binance_open_interest_poll_entry(SYMBOL)


def _classify(*, panel_grid_ms: int, native_grid_ms: int) -> PanelGridVerdict:
    verdict = classify_grid_multiple(panel_grid_ms, native_grid_ms)
    return PanelGridVerdict(
        native_grid_ms=verdict.native_grid_ms,
        enabled=verdict.enabled,
        reason=verdict.reason.value,
        multiple=verdict.multiple,
    )


def _observations(
    key: SeriesKey, values: dict[int, float], *, lag_ms: int, late: dict[int, int] | None = None
) -> tuple[Observation, ...]:
    """One stored row per minute given; `late[minute]` overrides that row's `available_at`."""
    late = late or {}
    observations = []
    for minute, value in sorted(values.items()):
        bucket_end = _at(minute)
        available_at = late.get(minute, bucket_end + lag_ms)
        raw = f"{value:.3f}"
        observations.append(
            Observation(
                row=SeriesRow(
                    series_key_id=key.series_key_id(),
                    symbol=SYMBOL,
                    source="binance",
                    bucket_end=bucket_end,
                    event_time=bucket_end,
                    available_at=available_at,
                    availability_source=AvailabilitySource.OBSERVED,
                    ingested_at=available_at,
                    observed_at=available_at,
                    provenance=Provenance.OBSERVED,
                    src_label_raw="openInterest",
                    observer_id="test",
                    observer_region=UNKNOWN_OBSERVER_REGION,
                    is_final=None,
                    value_raw=raw,
                ),
                value=Decimal(raw),
            )
        )
    return tuple(observations)


class _ReaderBySeries:
    """A `SeriesWindowReader` that answers each `series_key_id` with its own rows, like SQL."""

    def __init__(self, rows_by_id: dict[str, tuple[Observation, ...]]) -> None:
        self._rows_by_id = rows_by_id
        self.asked_ids: list[str] = []

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        assert symbol == SYMBOL
        self.asked_ids.append(series_key_id)
        lower = window_start_ms - lookback_ms
        return tuple(
            o
            for o in self._rows_by_id.get(series_key_id, ())
            if lower <= o.row.bucket_end <= window_end_ms
        )


class _NoBounds:
    def read_bounds(self, *, series_key_id: str, symbol: str) -> tuple[int | None, int | None]:
        return (None, None)


HIST_0_TO_15 = {0: 1000.0, 5: 1010.0, 10: 1020.0, 15: 1030.0}
POLL_FROM_7 = {m: 2000.0 + m for m in range(7, 16)}


def _report(  # noqa: PLR0913 — every knob of one request, each defaulted to the base case
    *,
    requested: SeriesCatalogEntry | None = None,
    catalog_entries: tuple[SeriesCatalogEntry, ...] | None = None,
    hist_values: dict[int, float] = HIST_0_TO_15,
    poll_values: dict[int, float] = POLL_FROM_7,
    poll_late: dict[int, int] | None = None,
    interval: str = "5m",
    knowledge_time_ms: int = _at(30),
    bar_policy: BarPolicy = BarPolicy.FINAL_ONLY,
) -> tuple[SeriesHistoryReport, _ReaderBySeries]:
    hist, poll = _hist_entry(), _poll_entry()
    reader = _ReaderBySeries(
        {
            hist.key.series_key_id(): _observations(hist.key, hist_values, lag_ms=HIST_LAG_MS),
            poll.key.series_key_id(): _observations(
                poll.key, poll_values, lag_ms=POLL_LAG_MS, late=poll_late
            ),
        }
    )
    report = build_series_history_report(
        SeriesCatalog(catalog_entries if catalog_entries is not None else (hist, poll)),
        reader,
        _classify,
        _NoBounds(),
        series_key_id=(requested or hist).key.series_key_id(),
        symbol=SYMBOL,
        interval=interval,
        window_start_ms=_at(5),
        window_end_ms=_at(15),
        knowledge_time_ms=knowledge_time_ms,
        bar_policy=bar_policy,
    )
    return report, reader


def _candles(report: SeriesHistoryReport) -> list[dict[str, object]]:
    envelope = report.to_envelope(principal_id=None, server_now_ms=_at(30))
    block = envelope["oi_candles"]
    assert isinstance(block, dict)
    candles = block["candles"]
    assert isinstance(candles, list)
    return candles


def _summary(report: SeriesHistoryReport) -> list[tuple[int, str, float, float]]:
    return [
        (c["bucket_end_ms"], c["derived_from"], c["open"], c["close"])  # type: ignore[misc]
        for c in _candles(report)
    ]


def test_the_route_reads_both_regimes_and_the_capture_bucket_is_one_series() -> None:
    """DoD-5 of §03b, through the use case: `(5, 10]` is pure history, `(10, 15]` pure polling."""
    report, reader = _report()

    assert _summary(report) == [
        (_at(5), HIST, 1000.0, 1010.0),
        (_at(10), HIST, 1010.0, 1020.0),
        (_at(15), POLL, 2010.0, 2015.0),
    ]
    _first, boundary, polled = _candles(report)
    assert boundary == {
        "bucket_end_ms": _at(10),
        "open": 1010.0,
        "high": 1020.0,
        "low": 1010.0,
        "close": 1020.0,
        "open_at_ms": _at(5),
        "close_at_ms": _at(10),
        "samples": {"present": 1, "expected": 1},
        "closed": True,
        "derived_from": HIST,
    }
    assert polled["samples"] == {"present": 5, "expected": 5}
    assert (polled["open_at_ms"], polled["close_at_ms"]) == (_at(10), _at(15))
    assert _poll_entry().key.series_key_id() in reader.asked_ids


def test_requesting_the_polled_series_id_gives_the_same_candles() -> None:
    """The choice is per bucket, not per requested id: either id of the pair, same answer."""
    by_hist, _ = _report()
    by_poll, _ = _report(requested=_poll_entry())

    assert _candles(by_poll) == _candles(by_hist)


def test_a_polling_hole_at_t0_is_not_filled_by_carry_forward() -> None:
    """`p_poll(10)` missing, `p_poll(9)` present: `as_of` carries 9 forward to 10 — not `p(10)`.

    Taking the carried value as the anchor is "costurar a âncora com o último ponto antes do
    buraco" (DoD-4). The bucket `(10, 15]` must go to the history instead.
    """
    polled = {m: v for m, v in POLL_FROM_7.items() if m != 10}
    report, _ = _report(poll_values=polled)

    assert _summary(report) == [
        (_at(5), HIST, 1000.0, 1010.0),
        (_at(10), HIST, 1010.0, 1020.0),
        (_at(15), HIST, 1020.0, 1030.0),
    ]


def test_a_polled_fact_not_yet_knowable_is_not_an_anchor() -> None:
    """`p_poll(10)` published after `knowledge_time` ⇒ at that horizon polling has no `p(10)`."""
    report, _ = _report(poll_late={10: _at(40)}, knowledge_time_ms=_at(30))

    assert _summary(report)[-1] == (_at(15), HIST, 1020.0, 1030.0)


def test_intrabar_requests_get_the_same_candles_as_final_only() -> None:
    """A `POINT` reading is never partial; `bar_policy` governs `rows`, not the candles."""
    final_only, _ = _report(bar_policy=BarPolicy.FINAL_ONLY)
    intrabar, _ = _report(bar_policy=BarPolicy.INTRABAR)

    assert _candles(intrabar) == _candles(final_only)


def test_in_1m_the_history_serves_one_slot_in_five_until_polling_anchors() -> None:
    """TF `1m`: the history's `(5, 10]` yields to polling's anchors at 7, 8, 9."""
    report, _ = _report(interval="1m")

    assert [(end, src) for end, src, _o, _c in _summary(report)] == [
        (_at(5), HIST),
        *((_at(m), POLL) for m in range(8, 16)),
    ]


def test_without_the_polled_series_in_the_catalog_the_history_is_served_alone() -> None:
    """A symbol whose polled series is not cataloged: one regime, and no second read."""
    report, reader = _report(catalog_entries=(_hist_entry(),))

    assert _summary(report) == [
        (_at(5), HIST, 1000.0, 1010.0),
        (_at(10), HIST, 1010.0, 1020.0),
        (_at(15), HIST, 1020.0, 1030.0),
    ]
    assert reader.asked_ids == [_hist_entry().key.series_key_id()]


def test_a_panel_that_is_not_open_interest_carries_null() -> None:
    """`oi_candles` is explicit `null` elsewhere — never a missing key, never candles."""
    hist = _hist_entry()
    ratio = SeriesCatalogEntry(
        key=dataclasses.replace(hist.key, metric="count_long_short_ratio",
                                nature=Nature.RATIO, unit="ratio", denom="none"),
        native_grid="5min",
        native_grid_ms=FIVE_MIN_MS,
        max_staleness_ms=2 * FIVE_MIN_MS,
    )  # fmt: skip
    report, reader = _report(requested=ratio, catalog_entries=(ratio, hist, _poll_entry()))

    assert report.oi_candles is None
    assert report.to_envelope(principal_id=None, server_now_ms=_at(30))["oi_candles"] is None
    assert reader.asked_ids == [ratio.key.series_key_id()]
