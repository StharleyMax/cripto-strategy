"""Per-(symbol, 1-min bucket) fold of one `aggTrade` stream — `ADR-001`/6, never a captured tick."""
#
# `ADR-001`/6, literal: "F0 persiste o agregado por bucket de 1 min — Σq_buy · Σq_sell · Σnq_buy
# · Σnq_sell · tx · btx · agg_id_min · agg_id_max — direto do stream. Não é captura de tick."
# `SPEC-001` §1.4 repeats the same eight terms as the bucket-of-1-min row `CL-5` needs
# preserved: `nq` lives in a 48 h REST window and in no history at all (the S3 dump has seven
# columns, `nq` is not one of them), so the bucket total is what survives past the window —
# never the tick.
#
# ── WHY `tx`/`btx` MATCH A MEASUREMENT ALREADY MADE, NOT A GUESS ───────────────────────────
#
# `docs/medicao-coinalyze.md`'s reconciliation over 699 real buckets settles the convention
# with a number: "`tx` da Coinalyze == nº de aggTrades do dump" and "`btx` == nº de aggTrades
# com `is_buyer_maker=false`", both 699/699 exact. `btx` counts the BUY side (the taker bought,
# `is_buyer_maker=False`, `cvd.py`'s own sign convention), never the maker side. This module
# inherits that exact convention instead of inventing a second one under the same two names.
#
# ── WHY THIS IS A NEW TYPE, NOT A WIDENING OF `AggTradeTick`/`CvdTrade` ────────────────────
#
# `aggtrade_contiguity.AggTradeTick` deliberately carries only `agg_id` + `transact_time_ms`
# (identity and order, `plano 04` item 4.3's scope, and no more). `cvd.CvdTrade` carries ONE
# already-resolved quantity, because `SeriesKey.quantity_field` (`ADR-001`) picks `q` OR `nq`
# upstream of it — that module could never express "the same trade, both quantities at once."
# This module's whole point is the opposite: `ADR-001`/6's row carries `Σq_*` AND `Σnq_*` side
# by side, from ONE trade. Widening either existing type would hand its other consumer a field
# it never asked for; a new type is the shape the task actually needs.
#
# ── WHY THE GAP DETECTOR IS A DELEGATION, NOT A SECOND ENGINE ──────────────────────────────
#
# `D3.5`, literal: "detector de buraco é contiguidade, nunca taxa". `aggtrade_contiguity.py`
# (`T-04.3`, already in `master`) proved exactly this invariant on 8.873.078 real rows — 0
# jumps inside a captured day, 1 named jump across the one day never captured. Re-deriving that
# proof here would be the "não duplique a lógica de unicidade que já existe lá" the handoff
# names; `require_contiguous` below instead ADAPTS this module's wider trade shape into the
# narrow `AggTradeTick` that module already reads, and calls its two functions unchanged.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Final

from src.modules.sentimento.domain.aggtrade_contiguity import (
    AggTradeTick,
    detect_agg_id_gaps,
    require_unique_agg_ids,
)

# The same 1-minute grid `cvd.py` folds `cvd_delta` on (`SPEC-001` §1.4/§2.6: "bucket de 1
# min"). Imported, not retyped: two files hand-writing `60_000` under two names is the exact
# second implementation the accessor's own canonical-grid note (`T-04.4`, plan 04 item 4.5)
# already refuses ("UMA funcao, dona de charts" — the same argument, one bucket-width constant
# instead of a second parser). `ADR-001`/6's bucket and `cvd.py`'s bucket are the SAME bucket,
# not two decisions that happen to agree today.
from src.modules.sentimento.domain.cvd import CVD_BUCKET_WIDTH_MS

BUCKET_WIDTH_MS: Final[int] = CVD_BUCKET_WIDTH_MS


class InvalidBucketQuantityError(Exception):
    """A trade's raw `q` or `nq` does not read as a `Decimal` — refused, never folded as zero."""


class AggTradeGapError(Exception):
    """The trades handed to the fold are not contiguous by `agg_id` — refused before summing.

    `ADR-001`/6's row is a sum taken DIRECT from the stream; folding across an unnoticed hole
    would publish a bucket total that silently excludes whatever fell in the gap — the same
    failure `plano 04` item 4.3 names for a tick reader, one layer up. Raised by
    `require_contiguous`, which delegates the actual detection to `aggtrade_contiguity.py`.
    """


class PartialNqBucketError(Exception):
    """One bucket has `nq` on SOME trades and not others — a state `ADR-001`/6 never names.

    A live capture carries `nq` on every trade or (per `binance_aggtrade_payload.py`'s own
    three-way split) on none that a message ever arrived for; a dump replay carries it on
    none, ever (`CL-5`). Anything strictly between — this many of `tx` but not all — is not a
    semantics this module is authorized to invent: `docs/medicao-ws-aggtrade-nq.md`, "Decisões
    que não são desta task", item 1, names exactly this as a `quant-architect` question (does a
    null-per-trade `nq` become zero, absence, or inherit `q`). Refusing loudly here is what
    keeps that question from being answered by accident, in one direction, by whichever bucket
    happens to hit it first.
    """


@dataclass(frozen=True)
class AggTradeBucketTrade:
    """One `aggTrade`, carrying BOTH quantities at once — what `ADR-001`/6's row folds.

    `raw_nq` is `None` for a trade whose source never carries the field at all — the S3 dump's
    case (`CL-5`: seven columns, `nq` is not one of them). This is deliberately COARSER than
    `binance_aggtrade_payload.FieldPresence`'s three-way `ABSENT`/`NULL`/`VALUED`: that
    distinction is `D3.9`'s question, about ONE message on a live socket. This module asks
    "can this trade contribute to `Σnq_*` at all", and both `ABSENT` and `NULL` answer "no" to
    that question alike — a caller reading a live capture where the source is known to publish
    `nq` as `NULL` on some messages resolves what THAT means (`quant-architect`'s open
    question) before ever building one of these.
    """

    agg_id: int
    transact_time_ms: int
    raw_q: str
    raw_nq: str | None
    is_buyer_maker: bool
    """`cvd.CvdTrade`'s own convention: the buyer being the MAKER means the SELLER was the
    aggressor — `True` contributes to the SELL side, `False` to the BUY side."""


@dataclass(frozen=True)
class AggTradeBucketAggregate:
    """One row of `ADR-001`/6's fact, for ONE `(symbol, 1-min bucket)`.

    `sum_nq_buy`/`sum_nq_sell` are `None` TOGETHER, never one alone: `aggregate_by_bucket`
    raises `PartialNqBucketError` rather than let one of the pair be a real sum while the other
    is a lie about completeness. `nq_trade_count` names how many of `tx` trades contributed —
    `0` (the dump-replay case) and `tx` (the live-capture case) are the only values that ever
    reach a caller; anything else is refused before this type is even built.
    """

    symbol: str
    bucket_start_ms: int
    sum_q_buy: Decimal
    sum_q_sell: Decimal
    sum_nq_buy: Decimal | None
    sum_nq_sell: Decimal | None
    nq_trade_count: int
    tx: int
    btx: int
    agg_id_min: int
    agg_id_max: int


@dataclass(frozen=True)
class BucketAggIdGap:
    """One discontinuity BETWEEN two adjacent buckets' `agg_id` ranges — never inside one.

    Mirrors `aggtrade_contiguity.AggIdGap`'s convention exactly: `n_missing = to - from`, ONE
    MORE than the count of ids strictly between the two ranges — the same width `plano 04`
    D4.4 states for the tick-level gap, applied here to the SEAM between two independently
    folded buckets.
    """

    from_bucket_start_ms: int
    to_bucket_start_ms: int
    from_agg_id_max: int
    to_agg_id_min: int
    n_missing: int


def require_contiguous(trades: Sequence[AggTradeBucketTrade]) -> None:
    """Refuse a duplicate or missing `agg_id` among `trades`, by DELEGATION — `D3.5`.

    Builds the narrow `AggTradeTick` view (`agg_id` + `transact_time_ms`) that
    `aggtrade_contiguity.py` already reads, so this function adds no second gap-detection
    engine — only the adaptation from this module's wider trade shape to that one's. `plano 04`
    item 4.3's own fixture proof (8.873.078 rows, 0 internal jumps, 1 named jump at the one day
    never captured) is the proof this delegation inherits, unchanged.
    """
    ticks = tuple(
        AggTradeTick(agg_id=trade.agg_id, transact_time_ms=trade.transact_time_ms)
        for trade in trades
    )
    require_unique_agg_ids(ticks)
    gaps = detect_agg_id_gaps(ticks)
    if gaps:
        first = gaps[0]
        raise AggTradeGapError(
            f"{len(gaps)} discontinuidade(s) de agg_id antes do fold em bucket — a primeira: "
            f"{first.from_agg_id} -> {first.to_agg_id} (n_missing={first.n_missing}). "
            f"ADR-001/6 soma DIRETO do stream; agregar por cima de um buraco publicaria um "
            f"total que exclui em silencio o que caiu nele"
        )


def aggregate_by_bucket(
    symbol: str,
    trades: Sequence[AggTradeBucketTrade],
) -> tuple[AggTradeBucketAggregate, ...]:
    """Fold ONE symbol's trades into `ADR-001`/6's per-1-min-bucket rows.

    RAISES `AggTradeGapError` if the `agg_id`s are not contiguous (`D3.5`, via
    `require_contiguous`) — including the sort-order check `detect_agg_id_gaps` already makes,
    so this function does not additionally re-check order itself. RAISES
    `PartialNqBucketError` if any resulting bucket mixes trades with and without `nq`.

    Returned in ascending `bucket_start_ms` order, the same convention `cvd.cvd_delta_by_bucket`
    uses for its fact table.
    """
    if not trades:
        return ()
    require_contiguous(trades)

    grouped: dict[int, list[AggTradeBucketTrade]] = {}
    for trade in trades:
        bucket_start = (trade.transact_time_ms // BUCKET_WIDTH_MS) * BUCKET_WIDTH_MS
        grouped.setdefault(bucket_start, []).append(trade)

    return tuple(
        _fold_bucket(symbol, bucket_start, grouped[bucket_start])
        for bucket_start in sorted(grouped)
    )


def detect_bucket_agg_id_gaps(
    sorted_aggregates: Sequence[AggTradeBucketAggregate],
) -> tuple[BucketAggIdGap, ...]:
    """Find every place where one bucket's `agg_id_max` does not immediately precede the next's.

    `agg_id_min` — the SEAM `aggregate_by_bucket` does not itself protect once two independent
    fixtures (e.g. two different days, read and folded separately) are placed side by side.

    `require_contiguous` already guarantees no gap INSIDE a single call's input; this function
    is for the caller who folds day-by-day and wants to know whether the DAYS themselves
    connect — `plano 04`'s own missing-day case (`2026-08-22`), expressed at the bucket grain.

    RAISES if `sorted_aggregates` is not already in non-decreasing `bucket_start_ms` order,
    mirroring `detect_agg_id_gaps`'s own refusal to guess at a caller's intended order.
    """
    gaps: list[BucketAggIdGap] = []
    for previous, current in zip(sorted_aggregates, sorted_aggregates[1:], strict=False):
        if current.bucket_start_ms < previous.bucket_start_ms:
            raise ValueError(
                f"aggregates are not sorted by bucket_start_ms: {previous.bucket_start_ms} "
                f"then {current.bucket_start_ms} — detect_bucket_agg_id_gaps only reads an "
                f"already-ordered sequence"
            )
        delta = current.agg_id_min - previous.agg_id_max
        if delta != 1:
            gaps.append(
                BucketAggIdGap(
                    from_bucket_start_ms=previous.bucket_start_ms,
                    to_bucket_start_ms=current.bucket_start_ms,
                    from_agg_id_max=previous.agg_id_max,
                    to_agg_id_min=current.agg_id_min,
                    n_missing=delta,
                )
            )
    return tuple(gaps)


def _fold_bucket(
    symbol: str,
    bucket_start_ms: int,
    trades: list[AggTradeBucketTrade],
) -> AggTradeBucketAggregate:
    """Sum one bucket's trades — `Σq_buy · Σq_sell · Σnq_buy · Σnq_sell · tx · btx`."""
    sum_q_buy = Decimal(0)
    sum_q_sell = Decimal(0)
    sum_nq_buy = Decimal(0)
    sum_nq_sell = Decimal(0)
    nq_trade_count = 0
    btx = 0
    agg_ids = [trade.agg_id for trade in trades]

    for trade in trades:
        q = _read_decimal(trade.raw_q, agg_id=trade.agg_id, field="q")
        if trade.is_buyer_maker:
            sum_q_sell += q
        else:
            sum_q_buy += q
            btx += 1
        if trade.raw_nq is not None:
            nq_trade_count += 1
            nq = _read_decimal(trade.raw_nq, agg_id=trade.agg_id, field="nq")
            if trade.is_buyer_maker:
                sum_nq_sell += nq
            else:
                sum_nq_buy += nq

    tx = len(trades)
    if nq_trade_count not in (0, tx):
        raise PartialNqBucketError(
            f"{symbol} bucket {bucket_start_ms}: {nq_trade_count}/{tx} trades carry nq — "
            f"ADR-001/6 folds a bucket where nq is present on every trade or none; a partial "
            f"bucket has no semantics this module is authorized to invent (quant-architect "
            f"question, docs/medicao-ws-aggtrade-nq.md)"
        )

    return AggTradeBucketAggregate(
        symbol=symbol,
        bucket_start_ms=bucket_start_ms,
        sum_q_buy=sum_q_buy,
        sum_q_sell=sum_q_sell,
        sum_nq_buy=sum_nq_buy if nq_trade_count else None,
        sum_nq_sell=sum_nq_sell if nq_trade_count else None,
        nq_trade_count=nq_trade_count,
        tx=tx,
        btx=btx,
        agg_id_min=min(agg_ids),
        agg_id_max=max(agg_ids),
    )


def _read_decimal(raw: str, *, agg_id: int, field: str) -> Decimal:
    """Read a quantity string EXACTLY — `Decimal`, never `float` (`SPEC-001` §2.6's own rule)."""
    try:
        return Decimal(raw)
    except InvalidOperation as exc:
        raise InvalidBucketQuantityError(
            f"agg_id {agg_id}: raw_{field} {raw!r} does not read as a Decimal — refused "
            f"instead of treated as zero, which would silently understate the bucket"
        ) from exc
