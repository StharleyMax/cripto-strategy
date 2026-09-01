"""`QF-6`: `count(q != nq)/n` and the deficit in bp, published per symbol and per day."""
#
# `SPEC-001` §1.3, `QF-6`, literal: "O catálogo publica, por símbolo e por dia, a taxa de
# divergência `count(q ≠ nq)/n` e o déficit em bp. Sem isso, `nq` é um nome sem magnitude, e a
# decisão de usá-lo não é auditável." `ADR-001`'s own measurement is the number this module has
# to reproduce EXACTLY: DOGEUSDT 16/1000 (déficit 80,56 bp), BTC/ETH/SOL/XRP 0/1000 (`docs/
# medicao-coinalyze.md`, `data/binance/rest/nq_*.json`).
#
# ── WHY `raw_nq` IS NEVER `None` HERE, UNLIKE `aggtrade_bucket_aggregate.py` ────────────────
#
# That module folds a bucket that may come from a source with NO `nq` column at all (the S3
# dump, `CL-5`) — absence is an expected, load-bearing case there. THIS module answers a
# different question: "of the trades where `nq` WAS observed, how many disagree with `q`". A
# trade with no `nq` to compare is not a divergence measurement input at all — it is `D3.8`'s
# question (`SEM_FONTE`), not this one's. Mixing the two would let an unmeasured window masquerade
# as a measured 0% divergence, which is the exact silent-zero failure this repository's `LOCF`
# rule already refuses one layer over.
#
# ── WHY THE DIVERGENCE COUNT COMPARES RAW STRINGS, NOT PARSED DECIMALS ──────────────────────
#
# `ADR-001`'s own reproduction counts `row['q'] != row['nq']` on the RAW JSON strings, and this
# module matches it bit for bit: `data/binance/rest/nq_DOGEUSDT.json` gives 16/1000 divergent by
# that comparison, `[MEDIDO]`, in `test_qnq_divergence.py`. Parsing first (`Decimal("14900") ==
# Decimal("14900.0")`) would silently collapse formatting differences the source may or may not
# ever produce — a possibility this module does not have to guess at because the string
# comparison is exact and free.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


class InvalidQnqQuantityError(Exception):
    """A trade's raw `q` or `nq` does not read as a `Decimal` — refused, never treated as zero."""


class EmptyQnqGroupError(Exception):
    """A `(symbol, day)` group has zero total `q` volume — the déficit-em-bp division refuses.

    Not reachable from `measure_qnq_divergence` on trades it grouped itself (a group only
    exists if at least one trade produced it), but named so a caller building
    `QnqDivergenceStats` by hand cannot silently divide by zero into a deficit that reads as
    `0,00 bp` for the wrong reason.
    """


@dataclass(frozen=True)
class QnqTrade:
    """One trade with BOTH quantities observed — the only input this module accepts.

    `day` is a caller-supplied calendar-day label (e.g. `"2026-08-25"`), never derived from a
    timestamp in here: `backend/pyproject.toml`'s "Natureza" contract keeps `domain` away from
    `datetime`, and turning an epoch millisecond into a calendar day is exactly the kind of
    value-bearing computation that boundary reserves for whoever owns a clock (`infra`).
    """

    symbol: str
    day: str
    raw_q: str
    raw_nq: str


@dataclass(frozen=True)
class QnqDivergenceStats:
    """`QF-6`'s published row: one `(symbol, day)`, its divergence count, and its deficit in bp."""

    symbol: str
    day: str
    n: int
    divergent_count: int
    deficit_bp: Decimal

    @property
    def divergence_ratio(self) -> Decimal:
        """`count(q != nq)/n` — `QF-6`'s literal ratio, as a fraction (not a percentage)."""
        return Decimal(self.divergent_count) / Decimal(self.n)


def measure_qnq_divergence(trades: Sequence[QnqTrade]) -> tuple[QnqDivergenceStats, ...]:
    """Group `trades` by `(symbol, day)` and compute `QF-6`'s two published numbers for each.

    Returned sorted by `(symbol, day)` — deterministic regardless of input order, the same
    reason `cvd.cvd_delta_by_bucket` sorts its fact table before returning it.
    """
    groups: dict[tuple[str, str], list[QnqTrade]] = {}
    for trade in trades:
        groups.setdefault((trade.symbol, trade.day), []).append(trade)

    return tuple(
        _measure_group(symbol, day, groups[(symbol, day)]) for symbol, day in sorted(groups)
    )


def _measure_group(symbol: str, day: str, trades: list[QnqTrade]) -> QnqDivergenceStats:
    n = len(trades)
    divergent_count = 0
    sum_q = Decimal(0)
    sum_nq = Decimal(0)
    for trade in trades:
        if trade.raw_q != trade.raw_nq:
            divergent_count += 1
        sum_q += _read_decimal(trade.raw_q, symbol=symbol, day=day, field="q")
        sum_nq += _read_decimal(trade.raw_nq, symbol=symbol, day=day, field="nq")

    if sum_q == 0:
        raise EmptyQnqGroupError(
            f"{symbol}/{day}: total q volume is 0 over {n} trade(s) — the deficit-em-bp "
            f"division has nothing to divide by"
        )
    deficit_bp = (sum_q - sum_nq) / sum_q * Decimal(10_000)

    return QnqDivergenceStats(
        symbol=symbol,
        day=day,
        n=n,
        divergent_count=divergent_count,
        deficit_bp=deficit_bp,
    )


def _read_decimal(raw: str, *, symbol: str, day: str, field: str) -> Decimal:
    try:
        return Decimal(raw)
    except InvalidOperation as exc:
        raise InvalidQnqQuantityError(
            f"{symbol}/{day}: raw_{field} {raw!r} does not read as a Decimal — refused "
            f"instead of treated as zero, which would silently understate the group's volume"
        ) from exc
