"""One candle, one series — the `ADR-045/D2-bis` choice between the two open-interest regimes."""

# `plano 03` item 3b.2, `T-03.9`, `SPEC-009` §6.2 ("Regra de fonte por bucket"), `RN-6`.
#
# ── THE RULE, `ADR-045/D2-bis`, LITERAL ─────────────────────────────────────────────────────────
#
#     "Se o bucket do TF tem ponto de polling em `T0`, ele é montado SÓ com a série de polling;
#      se não tem, SÓ com a série `openInterestHist`. Nunca se mistura âncora de uma série com
#      amostras da outra, porque o corpo viraria diferença entre fontes, e não variação de
#      contratos (`RN-1`)."
#
# So this module never builds a candle. It calls `project_oi_candles` (`ADR-045/D1`, `T-03.8`)
# ONCE PER SERIES — each call sees the readings of ONE series and nothing else — and only then
# chooses, per bucket, WHICH series' candle is served. A candle that mixes the two cannot come
# out of here because no code path in this module ever holds readings of both series in the
# same list. That is the "Morde" of `plano 03` §03b DoD-5 ("montar âncora do histórico com
# amostras do polling") stated as structure instead of as a check.
#
# ── THE DECISION IS ON `p_poll(T0)`, NOT ON "DID POLLING PRODUCE A CANDLE" ─────────────────────
#
# Two consequences, both literal readings of the rule and both pinned by tests:
#
#   * A polled candle WITHOUT the boundary anchor (`open_at_ms > T0`, the "first reading of S"
#     row of `ADR-045/D1`) is NEVER served: without `p_poll(T0)` the bucket belongs to the
#     history. This is exactly the bucket where capture starts mid-bucket, where the tempting
#     wrong answer is the history's `p(T0)` as open and polling's samples as the rest.
#   * A bucket WITH `p_poll(T0)` but with no polled reading inside `(T0, T1]` has no candle at
#     all — it does NOT fall back to the history. "Só com a série de polling" leaves nothing to
#     fall back to; a fallback there would make the source of a bucket depend on the CONTENTS of
#     the other series, which is the mixing the rule forbids by another road.
#
# ── TF `1m`: THE TWO REGIMES HAVE DIFFERENT BUCKET WIDTHS ──────────────────────────────────────
#
# The effective bucket is `max(TF, g)` (`oi_candle.effective_timeframe_ms`, `SPEC-009` §6.5): in
# TF `1m` the polled bucket is 1 minute and the historical one is 5 minutes ("1 slot de cada 5").
# For TF >= `5m` the widths are equal and the rule above is applied bucket by bucket, verbatim.
# For TF `1m`, a 5-minute historical candle spans FIVE 1-minute buckets, so "the bucket has
# `p_poll(T0)`" is asked of each of them: the historical candle is served only if NONE of the
# polled 1-minute buckets inside its span starts on a polled reading. This is the same rule
# (polling owns every bucket it anchors), and it is what keeps the served candles' intervals
# `(bucket_end_ms - width, bucket_end_ms]` pairwise DISJOINT — without it, a polled 1-minute
# candle and a 5-minute historical candle would both claim the same minutes, and the pane would
# count the same contracts twice. `[INFERRED: application of D2-bis to unequal widths; the ADR
# only states the rule for "o bucket do TF". Owner of the visual form of the pre-capture stretch
# in `1m` and of the boundary mark: `design_gate` + `quant-architect`, `[Q-DG-3]`, `T-03.12`.]`
#
# ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────
#
# * It does not read `md.series`, `as_of`, or a clock (`use_cases/series_history.py` does the
#   read and hands readings in; `now_ms` is an argument, used only for `closed`).
# * It does not measure whether the two series are the same grandeza — that is falsifier 4 of
#   `ADR-045` (`T-03.10`), a measurement over real rows, not a property of this choice.

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.oi_candle import (
    OiCandle,
    OiCandleSource,
    OiReading,
    effective_timeframe_ms,
    oi_candle_source,
    project_oi_candles,
)
from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_key,
    binance_open_interest_poll_key,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import SeriesKey

# The key builder of each regime, from the catalog module that owns the keys — never a
# transcribed `metric`/`interval` literal. `verified_by` enters `series_key_id()`, so only the
# builder the WRITER also uses lands on the same series.
_KEY_BUILDER_BY_SOURCE: Final[dict[OiCandleSource, Callable[..., SeriesKey]]] = {
    OiCandleSource.BINANCE_POLL_1M: binance_open_interest_poll_key,
    OiCandleSource.BINANCE_POINT_5M: binance_open_interest_key,
}

_OTHER_REGIME: Final[dict[OiCandleSource, OiCandleSource]] = {
    OiCandleSource.BINANCE_POLL_1M: OiCandleSource.BINANCE_POINT_5M,
    OiCandleSource.BINANCE_POINT_5M: OiCandleSource.BINANCE_POLL_1M,
}


class OiRegimeMismatchError(Exception):
    """The two regimes were handed in wrong: swapped slots, two symbols, or neither series."""


class OiRegimeGridError(Exception):
    """The historical bucket is not a whole number of polled buckets, so the two cannot tile."""


@dataclass(frozen=True)
class OiRegimeReadings:
    """ONE series' catalog row and its point readings, as `project_oi_candles` takes them."""

    entry: SeriesCatalogEntry
    readings: tuple[OiReading, ...]


@dataclass(frozen=True)
class OiCandleSourceDeclaration:
    """What one `derived_from` value means in THIS response — `SPEC-009` §6.5, on the wire.

    `bucket_interval_ms` is the declaration §6.5 asks for ("declarando
    `bucket_interval_ms = 300000`" for the history in TF `1m`): with two regimes in one
    response, the width of a candle is a property of its SOURCE, not of the panel, so it is
    declared once per source here rather than repeated on every candle — the `OiCandle` row stays
    exactly the ten fields of `SPEC-009` §6.4. `series_key_id` names the series the candles of
    that source were projected from (`RF-5`: unit and name come from the served `SeriesKey`).
    """

    derived_from: OiCandleSource
    series_key_id: str
    native_grid_ms: int
    bucket_interval_ms: int

    def to_wire(self) -> dict[str, object]:
        """Project onto the `oi_candles.sources[i]` object, `derived_from` as its string value."""
        return {
            "derived_from": self.derived_from.value,
            "series_key_id": self.series_key_id,
            "native_grid_ms": self.native_grid_ms,
            "bucket_interval_ms": self.bucket_interval_ms,
        }


@dataclass(frozen=True)
class OiCandleReport:
    """The `oi_candles` block of `GET /series-history`: the sources, then the candles.

    `candles` is in ascending `bucket_end_ms`, each one from exactly ONE source, and their
    intervals `(bucket_end_ms - bucket_interval_ms(source), bucket_end_ms]` are pairwise
    disjoint. `sources` lists only the series that took part (a symbol whose polled series is
    not cataloged carries one source).
    """

    timeframe_ms: int
    sources: tuple[OiCandleSourceDeclaration, ...]
    candles: tuple[OiCandle, ...]

    def to_wire(self) -> dict[str, object]:
        """Project onto the `oi_candles` object of the envelope."""
        return {
            "timeframe_ms": self.timeframe_ms,
            "sources": [source.to_wire() for source in self.sources],
            "candles": [candle.to_wire() for candle in self.candles],
        }


def other_regime_key(key: SeriesKey) -> tuple[OiCandleSource, SeriesKey]:
    """Return the OTHER regime's source and key, for the same instrument as `key`.

    Raises what `oi_candle_source` raises for a key that is not one of the two OI sources.
    """
    other = _OTHER_REGIME[oi_candle_source(key)]
    return other, _KEY_BUILDER_BY_SOURCE[other](instrument_id=key.instrument_id)


def project_one_series_per_bucket(
    *,
    poll: OiRegimeReadings | None,
    hist: OiRegimeReadings | None,
    timeframe_ms: int,
    now_ms: int,
) -> OiCandleReport:
    """Apply `ADR-045/D2-bis`: each served bucket is projected from ONE series only.

    `poll` must be the `binance_poll_1m` series and `hist` the `binance_point_5m` one — the
    slots are checked, not trusted, because swapping them inverts the rule without any other
    symptom. Either may be `None` (a series that is not cataloged), never both.

    Raises:
        OiRegimeMismatchError: a series in the wrong slot, the two slots on different
            instruments, or both slots empty.
        OiRegimeGridError: the historical bucket is not a whole multiple of the polled one.

    """
    if poll is None and hist is None:
        raise OiRegimeMismatchError(
            "neither open-interest series was given: there is no regime to choose from"
        )
    _require_slot(poll, OiCandleSource.BINANCE_POLL_1M)
    _require_slot(hist, OiCandleSource.BINANCE_POINT_5M)
    if poll is not None and hist is not None:
        _require_same_instrument(poll.entry.key, hist.entry.key)

    sources: list[OiCandleSourceDeclaration] = []
    served: list[OiCandle] = []

    poll_bucket_ms: int | None = None
    poll_instants: frozenset[int] = frozenset()
    if poll is not None:
        poll_bucket_ms = effective_timeframe_ms(timeframe_ms, poll.entry.native_grid_ms)
        poll_instants = frozenset(reading.instant_ms for reading in poll.readings)
        sources.append(_declare(poll, OiCandleSource.BINANCE_POLL_1M, poll_bucket_ms))
        served.extend(
            candle
            for candle in project_oi_candles(
                poll.entry, poll.readings, timeframe_ms=timeframe_ms, now_ms=now_ms
            )
            # `D2-bis`: polling owns the bucket only through `p_poll(T0)`.
            if candle.open_at_ms == candle.bucket_end_ms - poll_bucket_ms
        )

    if hist is not None:
        hist_bucket_ms = effective_timeframe_ms(timeframe_ms, hist.entry.native_grid_ms)
        if poll_bucket_ms is not None and hist_bucket_ms % poll_bucket_ms != 0:
            raise OiRegimeGridError(
                f"historical bucket of {hist_bucket_ms} ms is not a whole number of polled "
                f"buckets of {poll_bucket_ms} ms: the two regimes would not tile the axis"
            )
        sources.append(_declare(hist, OiCandleSource.BINANCE_POINT_5M, hist_bucket_ms))
        served.extend(
            candle
            for candle in project_oi_candles(
                hist.entry, hist.readings, timeframe_ms=timeframe_ms, now_ms=now_ms
            )
            if not _polling_anchors_inside(
                bucket_end_ms=candle.bucket_end_ms,
                bucket_ms=hist_bucket_ms,
                poll_bucket_ms=poll_bucket_ms,
                poll_instants=poll_instants,
            )
        )

    served.sort(key=lambda candle: candle.bucket_end_ms)
    return OiCandleReport(timeframe_ms=timeframe_ms, sources=tuple(sources), candles=tuple(served))


def _polling_anchors_inside(
    *,
    bucket_end_ms: int,
    bucket_ms: int,
    poll_bucket_ms: int | None,
    poll_instants: frozenset[int],
) -> bool:
    """Return whether any polled bucket inside `(bucket_end - bucket_ms, bucket_end]` has `p(T0)`.

    With equal widths this is the one question `D2-bis` asks of the bucket — "is there a polled
    point at `T0`?". With the historical bucket `k` polled buckets wide (TF `1m`), it is asked of
    each of the `k` polled buckets it spans.
    """
    if poll_bucket_ms is None:
        return False
    start_ms = bucket_end_ms - bucket_ms
    return any(
        polled_start in poll_instants
        for polled_start in range(start_ms, bucket_end_ms, poll_bucket_ms)
    )


def _declare(
    regime: OiRegimeReadings, source: OiCandleSource, bucket_ms: int
) -> OiCandleSourceDeclaration:
    """Declare one source that took part, with the bucket width its candles were built on."""
    return OiCandleSourceDeclaration(
        derived_from=source,
        series_key_id=regime.entry.key.series_key_id(),
        native_grid_ms=regime.entry.native_grid_ms,
        bucket_interval_ms=bucket_ms,
    )


def _require_slot(regime: OiRegimeReadings | None, expected: OiCandleSource) -> None:
    """Refuse a series whose own `derived_from` is not the slot it was passed in."""
    if regime is None:
        return
    actual = oi_candle_source(regime.entry.key)
    if actual is not expected:
        raise OiRegimeMismatchError(
            f"the {expected.value} slot received a {actual.value} series: swapping the two "
            f"regimes inverts ADR-045/D2-bis without any other symptom"
        )


def _require_same_instrument(poll_key: SeriesKey, hist_key: SeriesKey) -> None:
    """Refuse two regimes of different instruments — one candle is one symbol's contracts."""
    if poll_key.instrument_id != hist_key.instrument_id:
        raise OiRegimeMismatchError(
            f"polled series is {poll_key.instrument_id!r} and historical series is "
            f"{hist_key.instrument_id!r}: a candle of one symbol cannot be chosen against "
            f"another symbol's series"
        )
