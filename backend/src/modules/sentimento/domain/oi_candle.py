"""Project point open-interest readings onto `OiCandle`s — `ADR-045/D1`, keyed on one trio."""

# `plano 03` item 3b.1, `T-03.8`, `SPEC-009` §6.3-§6.4, `RN-2`, `RN-5` (corrected). One pure
# function, two regimes: the `openInterestHist` series (native grid 5 min, before the collector
# existed) and the polled series (native grid 1 min, `T-03.1`..`T-03.4`) are BOTH of the trio
# `(STOCK, POINT, POINT_AT_BUCKET_END)` (`SPEC-009` §6.2), so they go through the same code with a
# different `g`.
#
# ── THE DEFINITION, `ADR-045/D1`, FOR BUCKET `B = (T0, T1]` ─────────────────────────────────────
#
# With `S = {p(t) : T0 < t <= T1}` the readings inside the bucket:
#
#     close  = p(T1); if absent, the last reading of S
#     open   = p(T0), the boundary anchor, WHEN a reading exists exactly at T0 (holes in B or not)
#     open   = the first reading of S, when there is no p(T0) AND |S| >= 2
#     NO CANDLE when S is empty (`RN-2`), or when there is no p(T0) and |S| == 1 — a doji there
#               would be a zero fabricated out of absence, the class `RN-4` forbids
#     high / low = max / min of {open} ∪ S — a LOWER BOUND on the true range (`RN-6`)
#
# Why `open` is NOT "the first of S" (the `RN-5` of `PRD-009`): with `TF == g`, `|S| == 1`, so
# `open == close` always and every candle comes out neutral — the pane goes blind to exactly
# "is OI coming in" (`ADR-045` §Contexto, `LIQ-1` §Q3).
#
# ── THE ANCHOR IS `p(T0)` EXACTLY, AND NEVER "THE LAST READING BEFORE `T0`" ─────────────────────
#
# Stitching the anchor to the last reading before a hole (`plano 03` §03b DoD-4, "Morde: costurar a
# âncora com o último ponto antes do buraco") gives the bucket after a hole a body that spans the
# whole hole: the variation of contracts over an interval nobody observed, drawn as if it
# happened inside one bucket. The lookup below is an exact `dict` hit on `T0`, so an absent `T0`
# can only fall through to the first-reading branch or to no candle — never to an older reading.
#
# ── THE KEY IS THE TRIO, AND ANY OTHER TRIO FAILS HIGH (`ADR-045/D2`) ───────────────────────────
#
# Same principle as `series_reduction.UncoveredReductionPairError`: a series that reaches this
# projection without being a point-at-bucket-end stock is refused by NAME, never projected. The
# Coinalyze OI (`OHLC_OVER_BUCKET`, four series) is the concrete case: its `OPEN` column is NOT
# `p(T0)` (`o(t) == c(t-300)` in only 6 of 2.141 pairs, `series_key.py:117-125`), so feeding it
# here would publish a wrong open under a right-looking name.
#
# ── `g` COMES FROM THE SERIES, DECLARED, NEVER PARSED (`ADR-037/D3`) ────────────────────────────
#
# `T-03.8`'s title says "a grade nativa `g` vem do `SeriesKey`". The key's own `interval` term is a
# LABEL (`"5m"`, `"1m"`), and `ADR-037/D3` forbids deriving a width from it by name ("NEVER
# PARSED FROM"): the width is `SeriesCatalogEntry.native_grid_ms`, declared beside the label by
# every catalog builder. So this function takes the ENTRY — the series' key plus its declared
# grid — and reads the trio from `entry.key` and `g` from `entry.native_grid_ms`. Nothing here
# takes `g` from the caller, which is the point: a caller cannot pair the 5-minute series with a
# 1-minute `g`.
#
# ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────
#
# * It does not choose between the two series (`ADR-045/D2-bis`, "one candle, one series") —
#   that is `T-03.9`. It projects ONE series; `derived_from` is resolved from that series' key,
#   so a candle cannot name a source it was not built from.
# * It does not read `md.series`, a clock, or the network. `now_ms` arrives as an argument and is
#   used only for `closed`.
# * It does not model availability: `bucket_end_ms` is not the instant the value becomes known
#   (`ADR-045` §Fora desta ADR, `modeled_availability.py`). The pane decides nothing.

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_key,
    binance_open_interest_poll_key,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import BucketCoverage
from src.modules.sentimento.domain.series_key import (
    Nature,
    Reduction,
    SeriesKey,
    TsConvention,
)

# `ADR-045/D2`: the ONE trio this projection is defined over. A tuple, compared as a whole, so
# no caller can pass two of the three terms and have the third defaulted.
OI_CANDLE_TRIO: Final[tuple[Nature, Reduction, TsConvention]] = (
    Nature.STOCK,
    Reduction.POINT,
    TsConvention.POINT_AT_BUCKET_END,
)


class OiCandleSource(Enum):
    """`derived_from` — the closed enum of `SPEC-009` §6.4, which closes `RN-6`.

    `coinalyze_ohlc_5m` is NOT a member: it left together with the refused `O-2`
    (`SPEC-009` §6.4, last row).
    """

    BINANCE_POLL_1M = "binance_poll_1m"
    """`/fapi/v1/openInterest`, polled once per minute on the 1-minute grid (`O-4`)."""

    BINANCE_POINT_5M = "binance_point_5m"
    """`/futures/data/openInterestHist`, the 5-minute point history (the regime before capture)."""


def _source_identity(key: SeriesKey) -> tuple[str, str, str]:
    """Return the three terms that tell the two OI series apart: `(provider, metric, interval)`.

    `instrument_id` is left out on purpose — the two sources are the same per symbol — and so
    are the trio terms, which `_require_trio` already checked before this is ever consulted.
    """
    return (key.provider, key.metric, key.interval)


# Built FROM the catalog builders, never transcribed: a rename of the polled metric in
# `open_interest_catalog.py` moves this table with it instead of leaving a stale literal that
# makes every polled candle fail as "unknown source". `BTCUSDT` is only the probe symbol —
# `_source_identity` drops `instrument_id`.
_DERIVED_FROM_BY_SOURCE: Final[dict[tuple[str, str, str], OiCandleSource]] = {
    _source_identity(binance_open_interest_poll_key(instrument_id="BTCUSDT")): (
        OiCandleSource.BINANCE_POLL_1M
    ),
    _source_identity(binance_open_interest_key(instrument_id="BTCUSDT")): (
        OiCandleSource.BINANCE_POINT_5M
    ),
}


class UncoveredOiCandleTrioError(Exception):
    """The series is not `(STOCK, POINT, POINT_AT_BUCKET_END)` — fail HIGH (`ADR-045/D2`)."""

    def __init__(self, key: SeriesKey) -> None:
        """Name the exact trio that reached the projection, and the one it requires."""
        self.key = key
        super().__init__(
            f"OiCandle is defined only over (nature=STOCK, reduction=POINT, "
            f"ts_convention=POINT_AT_BUCKET_END) — ADR-045/D2; got (nature={key.nature.value}, "
            f"reduction={key.reduction.value}, ts_convention={key.ts_convention.value}) for "
            f"metric '{key.metric}' of provider '{key.provider}'. Another trio needs its own "
            f"decision, never this projection by default."
        )


class UnknownOiCandleSourceError(Exception):
    """The series has the right trio but is neither of the two sources `derived_from` names."""

    def __init__(self, key: SeriesKey) -> None:
        """Name the `(provider, metric, interval)` that has no `derived_from` value."""
        self.key = key
        super().__init__(
            f"no derived_from value for (provider={key.provider}, metric={key.metric}, "
            f"interval={key.interval}): SPEC-009 §6.4 closes derived_from over "
            f"{sorted(source.value for source in OiCandleSource)} — a third source needs the "
            f"enum widened by decision, not a guessed label"
        )


class InvalidOiReadingsError(Exception):
    """The readings violate the projection's input contract (order, grid, finiteness)."""


class TimeframeOffNativeGridError(Exception):
    """The effective timeframe is not a positive whole multiple of the series' native grid."""


@dataclass(frozen=True)
class OiReading:
    """One point reading `p(t)`: the open interest AT `instant_ms`, in the series' own unit."""

    instant_ms: int
    value: float


@dataclass(frozen=True)
class OiCandle:
    """The `OiCandle` contract of `SPEC-009` §6.4 — one bucket `(T0, T1]` of the effective TF.

    `__post_init__` enforces the two invariants §6.4 states as rules of the contract, so a
    candle that breaks them cannot exist, whoever builds it:
    `low <= min(open, close) <= max(open, close) <= high`, and `open_at_ms != close_at_ms`.
    """

    bucket_end_ms: int
    open: float
    high: float
    low: float
    close: float
    open_at_ms: int
    close_at_ms: int
    samples: BucketCoverage
    closed: bool
    derived_from: OiCandleSource

    def __post_init__(self) -> None:
        """Refuse a candle that violates the ordering or the one-instant rule of §6.4."""
        if not (self.low <= min(self.open, self.close) <= max(self.open, self.close) <= self.high):
            raise ValueError(
                f"OiCandle at bucket_end_ms={self.bucket_end_ms} breaks "
                f"low <= min(open, close) <= max(open, close) <= high: "
                f"o={self.open} h={self.high} l={self.low} c={self.close} (SPEC-009 §6.4)"
            )
        if self.open_at_ms == self.close_at_ms:
            raise ValueError(
                f"OiCandle at bucket_end_ms={self.bucket_end_ms} has open_at_ms == close_at_ms "
                f"== {self.open_at_ms}: a one-reading candle is a zero made of absence "
                f"(SPEC-009 §6.4, ADR-045/D1)"
            )


def oi_candle_source(key: SeriesKey) -> OiCandleSource:
    """Resolve `derived_from` from the series itself — never a label written by the caller.

    Raises `UncoveredOiCandleTrioError` for a key outside the trio, and
    `UnknownOiCandleSourceError` for a key inside it that is neither known source.
    """
    _require_trio(key)
    try:
        return _DERIVED_FROM_BY_SOURCE[_source_identity(key)]
    except KeyError:
        raise UnknownOiCandleSourceError(key) from None


def effective_timeframe_ms(timeframe_ms: int, native_grid_ms: int) -> int:
    """Return the bucket width the candles are built on: `max(TF, g)`, a multiple of `g`.

    `SPEC-009` §6.5: in TF `1m` over the 5-minute history, the OI is served "em 1 slot de cada
    5, declarando `bucket_interval_ms = 300000`" — a bucket narrower than the native grid would
    hold at most one reading and, by `ADR-045/D1`, never a candle. A TF that is wider than `g`
    but not a whole multiple of it would split native slots between buckets; it is refused.
    """
    if timeframe_ms <= 0 or native_grid_ms <= 0:
        raise TimeframeOffNativeGridError(
            f"timeframe_ms={timeframe_ms} and native_grid_ms={native_grid_ms} must be positive"
        )
    effective = max(timeframe_ms, native_grid_ms)
    if effective % native_grid_ms != 0:
        raise TimeframeOffNativeGridError(
            f"timeframe_ms={timeframe_ms} is not a whole multiple of the native grid "
            f"{native_grid_ms} ms: a bucket boundary would fall between two native slots"
        )
    return effective


def project_oi_candles(
    entry: SeriesCatalogEntry,
    readings: Sequence[OiReading],
    *,
    timeframe_ms: int,
    now_ms: int,
) -> tuple[OiCandle, ...]:
    """Project ONE series' point readings onto `OiCandle`s of the effective timeframe.

    `readings` must be in strictly ascending `instant_ms`, each on the series' native grid
    (`instant_ms % g == 0`) with a finite value — anything else raises
    `InvalidOiReadingsError` instead of being sorted, deduplicated or snapped here, because an
    off-grid instant would silently never match `T0` and turn every anchor into a first-reading
    open. Buckets are UTC-epoch aligned (`T1 % TF_eff == 0`), the same alignment
    `use_cases/series_history.py::_INTERVAL_STEP_MS` uses. Returned in ascending
    `bucket_end_ms`; a bucket without a candle under `ADR-045/D1` is simply absent.

    `closed` is `bucket_end_ms <= now_ms`: the bucket's closing instant has arrived.
    """
    key = entry.key
    derived_from = oi_candle_source(key)
    grid_ms = entry.native_grid_ms
    bucket_ms = effective_timeframe_ms(timeframe_ms, grid_ms)
    expected = bucket_ms // grid_ms
    _require_valid_readings(readings, grid_ms=grid_ms)

    value_at: dict[int, float] = {reading.instant_ms: reading.value for reading in readings}
    buckets: dict[int, list[OiReading]] = {}
    for reading in readings:
        # `(T0, T1]`: a reading exactly on a boundary closes the bucket that ENDS there.
        bucket_end = -(-reading.instant_ms // bucket_ms) * bucket_ms
        buckets.setdefault(bucket_end, []).append(reading)

    candles: list[OiCandle] = []
    for bucket_end, inside in buckets.items():
        candle = _project_bucket(
            bucket_end_ms=bucket_end,
            bucket_ms=bucket_ms,
            inside=inside,
            value_at=value_at,
            expected=expected,
            now_ms=now_ms,
            derived_from=derived_from,
        )
        if candle is not None:
            candles.append(candle)
    return tuple(candles)


def _project_bucket(
    *,
    bucket_end_ms: int,
    bucket_ms: int,
    inside: Sequence[OiReading],
    value_at: dict[int, float],
    expected: int,
    now_ms: int,
    derived_from: OiCandleSource,
) -> OiCandle | None:
    """Apply `ADR-045/D1` to one bucket; `None` is the "no candle" row of that table."""
    bucket_start_ms = bucket_end_ms - bucket_ms
    anchor = value_at.get(bucket_start_ms)
    if anchor is not None:
        open_value, open_at_ms = anchor, bucket_start_ms
    elif len(inside) >= 2:
        open_value, open_at_ms = inside[0].value, inside[0].instant_ms
    else:
        return None

    last = inside[-1]
    close_value, close_at_ms = last.value, last.instant_ms
    values = [open_value, *(reading.value for reading in inside)]
    return OiCandle(
        bucket_end_ms=bucket_end_ms,
        open=open_value,
        high=max(values),
        low=min(values),
        close=close_value,
        open_at_ms=open_at_ms,
        close_at_ms=close_at_ms,
        samples=BucketCoverage(present=len(inside), expected=expected),
        closed=bucket_end_ms <= now_ms,
        derived_from=derived_from,
    )


def _require_trio(key: SeriesKey) -> None:
    """Raise `UncoveredOiCandleTrioError` unless the key is exactly `OI_CANDLE_TRIO`."""
    if (key.nature, key.reduction, key.ts_convention) != OI_CANDLE_TRIO:
        raise UncoveredOiCandleTrioError(key)


def _require_valid_readings(readings: Sequence[OiReading], *, grid_ms: int) -> None:
    """Refuse unordered, duplicated, off-grid or non-finite readings — never repair them."""
    previous: int | None = None
    for reading in readings:
        if reading.instant_ms % grid_ms != 0:
            raise InvalidOiReadingsError(
                f"reading at instant_ms={reading.instant_ms} is off the native grid of "
                f"{grid_ms} ms: p(T0) is looked up by exact instant, so an off-grid reading "
                f"would silently drop every anchor it should have been"
            )
        if previous is not None and reading.instant_ms <= previous:
            raise InvalidOiReadingsError(
                f"readings must be strictly ascending in instant_ms: {reading.instant_ms} "
                f"follows {previous}"
            )
        if not math.isfinite(reading.value):
            raise InvalidOiReadingsError(
                f"reading at instant_ms={reading.instant_ms} has non-finite value "
                f"{reading.value}: min/max over it would break low <= open/close <= high"
            )
        previous = reading.instant_ms
