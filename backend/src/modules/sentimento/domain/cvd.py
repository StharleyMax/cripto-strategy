"""`cvd_delta` as a FACT per bucket; `cvd_cum(anchor)` as a VIEW with a mandatory anchor."""
#
# `SPEC-001` §2.6, transcribed: "`cvd_delta` por bucket é anchor-free e persistido. `cvd_cum
# (anchor)` é view, e `anchor` é obrigatório: medido, mesmo dia e mesmo dado, âncora 00:00Z →
# −1265,982 BTC, 12:00Z → +399,745, 20:00Z → +1598,508 — o sinal inverte." Plan `04` item `4.8`,
# `DoD D4.7`/`D4.8`, falsifier `CA-F1-8`.
#
# ── WHY A FACT AND A VIEW ARE TWO DIFFERENT FUNCTIONS, NOT ONE WITH A DEFAULT ARGUMENT ─────
#
# `cvd_delta` does not know what "the CVD" means until an anchor picks where it starts counting
# from — three anchors on the SAME `cvd_delta` invert the sign of the total (`D4.7`, measured
# below). A default anchor would make that choice silently, which is exactly the class of
# defect `SeriesKey` (`T-04.2`) already refuses for `reduction`/`quantity_field`: `cvd_cum`
# called without an anchor is an ERROR, never a resolved default.
#
# `cvd_delta` NEVER RECALCULATES FROM `cvd_cum` — it is the fact `cvd_cum` is a view OVER, and
# the handoff for this task names the opposite (a view over a view) as the defect that would
# invert the direction of dependency `T-04.8`/front consumers expect.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Final

# `SPEC-001` §2.6, literal: "bucket por transact_time // 60000" — one minute, and it is NOT a
# parameter. A caller that wants a coarser presentation grid (5m/15m) re-aggregates these
# 1-minute facts; it does not ask this module to bucket at a different width, because the fact
# this module persists is the finest grid the contract names.
CVD_BUCKET_WIDTH_MS: Final[int] = 60_000


class InvalidCvdQuantityError(Exception):
    """A trade's raw quantity string does not read as a `Decimal` — a data defect, not a zero.

    `SPEC-001` §2.6 makes `Decimal` over the RAW STRING part of the contract; a value that does
    not parse is refused rather than silently treated as `0`, which would understate the delta
    of whichever bucket it landed in without saying so.
    """


class MissingCvdAnchorError(Exception):
    """`cvd_cum` was asked to run without an anchor — `D4.7`: an error, never a default.

    Mirrors `SeriesReadPolicy`/`as_of` (`T-04.4`): the parameter is required so that OMITTING
    the keyword argument entirely already fails at the call site with `TypeError`; this
    exception is the second layer, for the caller that received `None` from an upstream
    boundary (a wire payload, a partially-filled config) and passed it through instead of
    catching it before the domain boundary.
    """


@dataclass(frozen=True)
class CvdTrade:
    """One trade's contribution to `cvd_delta`: already resolved to ONE `quantity_field`.

    `raw_quantity` is the value AS SENT by the source (the undecoded string) — `q` or `nq`,
    whichever `SeriesKey.quantity_field` (`ADR-001`) this trade belongs to. Choosing which of
    the two source fields to read is the caller's job (`T-04.2`'s identity, `binance_
    aggtrade_payload.py`'s `read_quantity_fields`); this module only ever sees the one string
    that already won that choice, so it cannot re-introduce the `q`/`nq` weld `SPEC-001` §1.2
    closed.

    `is_buyer_maker` is the aggressor side: `SPEC-001` §2.6's own reference computation is
    `-Decimal(q) if is_buyer_maker else Decimal(q)` — the buyer being the MAKER means the
    SELLER was the aggressor, which is the negative side of the convention.
    """

    agg_id: int
    transact_time_ms: int
    raw_quantity: str
    is_buyer_maker: bool


@dataclass(frozen=True)
class CvdDeltaFact:
    """One row of the persisted fact: the signed sum of one 1-minute bucket, anchor-free.

    `bucket_start_ms` is the epoch-millisecond start of the bucket (`transact_time_ms //
    CVD_BUCKET_WIDTH_MS * CVD_BUCKET_WIDTH_MS`), so it compares directly against an `anchor_ms`
    expressed the same way — no unit conversion at the `cvd_cum` boundary.
    """

    bucket_start_ms: int
    value: Decimal


@dataclass(frozen=True)
class CvdCumPoint:
    """One point of the `cvd_cum(anchor)` view: the running total AT this bucket, inclusive."""

    bucket_start_ms: int
    cumulative_value: Decimal


def cvd_delta_by_bucket(trades: Sequence[CvdTrade]) -> tuple[CvdDeltaFact, ...]:
    """Return the persisted, anchor-free `cvd_delta` fact: one signed sum per 1-minute bucket.

    `SPEC-001` §2.6's aritmética canônica, applied literally:

    1. sum ordered by `agg_id` (never by `transact_time_ms`, never by input order) — the
       contract names the ORDER as part of the arithmetic, not only the operands;
    2. `Decimal` over the RAW string of the quantity field — never `float`, never a
       round-trip through a formatted/serialized intermediate (`D4.8`'s falsifier: the `awk`
       command published alongside this contract reproduces a WRONG total, off by +4 mBTC,
       because `OFMT=%.6g` rounds the text on the way out);
    3. bucket by `transact_time_ms // CVD_BUCKET_WIDTH_MS`, never by `agg_id`.

    Returned in ascending `bucket_start_ms` order — a fact table is read by time, and an
    unordered `dict` would make two equal results compare unequal by iteration order alone.
    """
    ordered = sorted(trades, key=lambda trade: trade.agg_id)
    totals: dict[int, Decimal] = {}
    for trade in ordered:
        bucket_index = trade.transact_time_ms // CVD_BUCKET_WIDTH_MS
        bucket_start_ms = bucket_index * CVD_BUCKET_WIDTH_MS
        signed = _signed_quantity(trade)
        totals[bucket_start_ms] = totals.get(bucket_start_ms, Decimal(0)) + signed
    return tuple(
        CvdDeltaFact(bucket_start_ms=bucket_start_ms, value=totals[bucket_start_ms])
        for bucket_start_ms in sorted(totals)
    )


def cvd_cum(
    deltas: Sequence[CvdDeltaFact],
    *,
    anchor_ms: int | None,
) -> tuple[CvdCumPoint, ...]:
    """Return the `cvd_cum(anchor)` view: the running total from `anchor_ms` onward, inclusive.

    `anchor_ms` has NO DEFAULT, so a call that omits the keyword argument already fails with
    `TypeError` before this body runs; the explicit `None` check below is the second layer, for
    a caller that received an absent anchor from a boundary this module does not control and
    forwarded it instead of refusing it first (`D4.7`: "chamar sem âncora é erro, não default").

    Buckets before `anchor_ms` are excluded entirely — they are not zeroed, they are absent
    from the view, which is what makes THREE anchors over the SAME `cvd_delta` able to invert
    the sign of the total: each drops a different prefix of the day's signed sums.
    """
    if anchor_ms is None:
        raise MissingCvdAnchorError(
            "cvd_cum requires an anchor (`SPEC-001` §2.6 / `D4.7`): three different anchors "
            "(00:00/12:00/20:00 UTC) over the SAME cvd_delta can invert the sign of the total, "
            "so there is no anchor a caller could silently inherit"
        )
    running = Decimal(0)
    points: list[CvdCumPoint] = []
    for fact in sorted(deltas, key=lambda item: item.bucket_start_ms):
        if fact.bucket_start_ms < anchor_ms:
            continue
        running += fact.value
        points.append(CvdCumPoint(bucket_start_ms=fact.bucket_start_ms, cumulative_value=running))
    return tuple(points)


def _signed_quantity(trade: CvdTrade) -> Decimal:
    """Read `trade.raw_quantity` exactly and apply the aggressor sign (`SPEC-001` §2.6)."""
    try:
        quantity = Decimal(trade.raw_quantity)
    except InvalidOperation as exc:
        raise InvalidCvdQuantityError(
            f"agg_id {trade.agg_id}: raw_quantity {trade.raw_quantity!r} does not read as a "
            f"Decimal — refused instead of treated as zero, which would silently understate "
            f"the bucket it belongs to"
        ) from exc
    return -quantity if trade.is_buyer_maker else quantity
