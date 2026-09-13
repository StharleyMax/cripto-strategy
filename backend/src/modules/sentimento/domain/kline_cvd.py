"""`delta_cvd = 2 * takerBuyBaseVol - volume`, read off the bucket the origin itself publishes."""

# Phase `02` items 2.1 + 2.4 (`SPEC-007` `GA-7`, `ADR-036/D5` revised, `RF-1`).
#
# ── WHY THIS ARITHMETIC NEEDS NO SECOND ENDPOINT, WHICH IS THE WHOLE POINT OF THE PHASE ────
#
# `/fapi/v1/klines` returns a 12-field array in which index `[5]` is `volume` (everything that
# traded in the bucket) and index `[9]` is `takerBuyBaseVol` (the part of it where the BUYER
# was the aggressor). The seller-aggressor part is therefore `volume - takerBuy`, and the
# signed order-flow delta of the bucket is
#
#     delta = takerBuy - takerSell = takerBuy - (volume - takerBuy) = 2 * takerBuy - volume
#
# `[MEDIDO 2026-09-10, BTCUSDT 1m: v=29,757 / takerBuy=2,626 / delta=-24,505]`. The identity is
# the same `2*bv - v` the Coinalyze reconstruction uses, and the cross-check that retired
# `ADR-036/D5` found Coinalyze's `bv` to BE this `takerBuyBaseVol`, exact in 116 of 120 buckets
# `[MEDIDO 2026-09-10, n=120, `handoff/ACHADO-KLINES-CVD.md`]`. So the third-party hop bought
# nothing, and `data/` needs no `aggTrades` for CVD — the premise the infra note vetoes.
#
# ── THIS IS NOT A RECONSTRUCTION, AND THE CLAIM WAS FALSIFIED BEFORE IT WAS WRITTEN ────────
#
# `T-02.1` ran `scripts/cvd-klines-falsifier/falsify_reconstructed_from.py` over the three UTC
# days for which this repository holds the canonical `aggTrade` dump, comparing this expression
# against `domain/cvd.cvd_delta_by_bucket` of the dump: `n=4.320` buckets, `276` maximal runs of
# divergent buckets, **zero** of them with a residual, and the day total identical to the
# thousandth of a BTC on all three days `[MEDIDO 2026-09-12,
# `gates/T-02.1-falsificador-reconstructed-from.md`]`. Every divergence MOVES quantity between
# two adjacent minutes (a boundary trade attributed to `i` by one side and `i+1` by the other);
# none creates or destroys any. That is bucket aggregation, not approximation — hence
# `reconstructed_from=None` on the catalog row this module feeds.
#
# ── `Decimal` OVER THE RAW STRING, NEVER `float` ───────────────────────────────────────────
#
# The same refusal `cvd.py` already documents with a measured falsifier: the published `awk`
# one-liner reproduces a total off by +4 mBTC because `OFMT=%.6g` rounds the text on the way
# out. The exchange sends decimal STRINGS and this module reads them as `Decimal` unchanged, so
# `value_raw` carries the exact quantity the source quoted rather than a base-2 approximation
# of it.
#
# ── DOMAIN, NOT infra: no socket, no clock, no catalog ─────────────────────────────────────
#
# Identity lives in `cvd_source_catalog.build_kline_takerbuy_entry`, the HTTP call in
# `infra/binance_klines_client.py`, and the row in `use_cases/collector_series_mapping.py`.
# This module is only the arithmetic and the invariant that guards it.

from __future__ import annotations

from decimal import Decimal, InvalidOperation

__all__ = [
    "InvalidKlineQuantityError",
    "TakerBuyExceedsVolumeError",
    "kline_cvd_delta",
]


class InvalidKlineQuantityError(Exception):
    """A kline quantity string does not read as a `Decimal`, so no delta can be derived."""


class TakerBuyExceedsVolumeError(Exception):
    """`takerBuyBaseVol > volume`: the aggressor-buy part cannot exceed the whole bucket."""


def kline_cvd_delta(*, volume: str, taker_buy_base_volume: str) -> Decimal:
    """Return `2 * takerBuyBaseVol - volume` for one bucket, refusing an impossible pair.

    ⛔ THE INVARIANT IS `takerBuy <= volume`, AND IT IS CHECKED RATHER THAN ASSUMED (item 2.4).
    `takerBuy` is a PART of `volume` — the share of the bucket where the buyer was the
    aggressor — so a `takerBuy` above `volume` is not a large CVD, it is a payload this module
    cannot interpret. Left unchecked it would surface as a `delta` LARGER THAN THE BUCKET'S OWN
    VOLUME, a number that looks like signal and is not; the analogous `bv <= v` on the
    Coinalyze side held 30/30 `[DOC: plano `02` item 2.4]`, and this side is measured over the
    backfill window in the phase gate rather than assumed from that.

    Negative quantities are refused for the same reason and by the same guard: a traded volume
    below zero has no reading, and `0 <= takerBuy <= volume` is one comparison chain, not two
    rules that could drift apart.

    Returns a `Decimal`; the caller stringifies it for `value_raw`, so the row carries the exact
    quantity the exchange quoted and never a `float`'s nearest binary neighbour.
    """
    parsed_volume = _quantity(volume, "volume")
    parsed_taker_buy = _quantity(taker_buy_base_volume, "takerBuyBaseVol")
    if not 0 <= parsed_taker_buy <= parsed_volume:
        raise TakerBuyExceedsVolumeError(
            f"takerBuyBaseVol = {taker_buy_base_volume!r} is not within [0, volume = "
            f"{volume!r}]: the aggressor-buy share is a PART of the bucket's volume, so a "
            f"value outside that range makes `2 * takerBuy - volume` exceed the bucket itself "
            f"— refused instead of published as signal"
        )
    return 2 * parsed_taker_buy - parsed_volume


def _quantity(raw: str, field: str) -> Decimal:
    """Read one kline quantity string exactly, refusing anything that is not a decimal."""
    try:
        return Decimal(raw)
    except InvalidOperation as exc:
        raise InvalidKlineQuantityError(
            f"{field} {raw!r} does not read as a Decimal — refused instead of treated as zero, "
            f"which would silently misstate the bucket it belongs to"
        ) from exc
