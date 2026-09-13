"""`sum_liquidation` — TWO rows per instrument, and collapsing them would erase the signal.

`T-05.3`, plan `05` item 5.2, `ADR-036/D4`. Liquidation has TWO LEGS and both sources separate
them: `liquidation-history` returns `l` and `s` per bucket (`MEDICAO §2`), and `!forceOrder@arr`
carries the side on the order. `cohort` is ALREADY a term of identity (`cohort="all"` on every
existing series), so the two legs are two `SeriesKey`s — never one row carrying a net.

WHY SUMMING THEM WOULD BE THE DEFECT AND NOT A SIMPLIFICATION. A long liquidation is forced
selling and a short liquidation is forced buying. Their sum is a "liquidation volume" that moves
identically whether the market just flushed longs, flushed shorts, or flushed both — which is
precisely the discrimination the metric exists to provide (`RF-2`).
"""

from __future__ import annotations

from typing import Final

from src.modules.sentimento.domain.series_catalog import (
    SeriesCatalog,
    SeriesCatalogEntry,
    build_series_catalog,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

# ── `denom` AND `unit`: MEASURED BY `T-05.1`, NOT INFERRED ─────────────────────────────────
#
# `SPEC-007` §4.3 carried `[INFERRED: quote]`. `T-05.1` measured it and the inference was right
# in the LABEL and incomplete in the PATH: the provider's DEFAULT (`convert_to_usd=false`)
# returns BASE, and only `convert_to_usd=true` returns the USD notional
# `[MEDIDO 2026-09-12, gates/falsificador-denom-liquidacao.md: BTC 0.003 vs DOGE 947120 sem o
#  parametro; 231.85 vs 80533.61 com ele; preco implicito bate o markPrice da Binance em
#  3,6-23,6 bp, n=4 pares]`.
#
# ⛔ SO THE COLLECTOR MUST SEND `convert_to_usd=true`. This constant is not decoration: it is
# the one place that pairing is written down, and `T-05.5`'s path builder reads it from here so
# the identity and the request cannot drift apart in silence.
CONVERT_TO_USD_REQUIRED: Final[bool] = True

# The USD notional, not USDT: Coinalyze's `convert_to_usd` publishes USD and this repository
# does not restate a third party's unit as something it did not say.
_UNIT: Final[str] = "USD"
_DENOM: Final[str] = "quote"

_INTERVAL: Final[str] = "1m"
_INTERVAL_MS: Final[int] = 60_000

# `native_grid` is a property of the SOURCE (`CA-F2-11`) and Coinalyze spells this grid `1min`
# in its own `interval` parameter — the same string `coinalyze_daily_series.py` already uses.
NATIVE_GRID: Final[str] = "1min"

# THE SAME FACT AS `NATIVE_GRID`, in milliseconds, DECLARED here instead of parsed from the
# label (`ADR-037/D3`): the read path injects this as `bucket_interval_ms`, and a second
# grid-label parser is what `ADR-003`/FR-3 reserves to `charts`' canonical grid. The pair is
# enumerated over every SERVED row by `tests/sentimento/test_native_grid_ms_pairs.py`, which is
# what refuses a divergent declaration.
NATIVE_GRID_MS: Final[int] = 60_000

# ── `label_shift = +interval`, AND IT IS MEASURED HERE RATHER THAN BORROWED ────────────────
#
# `SPEC-001` §2.1 states Coinalyze's `label_shift` is `+interval`, and `D6.8` PROVED it for
# `open-interest-history`. Reusing that proof for a DIFFERENT endpoint would be an assumption
# wearing a measurement's clothes, so `T-05.2`'s retention sweep settled it for THIS one:
#
#     interval=daily, at 2026-09-12T14:14Z, newest bucket t = 2026-09-12T00:00:00Z
#
# The day 2026-09-12 was still IN PROGRESS. A bucket-END convention cannot emit `t` for a
# bucket that has not ended, so `t` is the bucket's START
# `[MEDIDO 2026-09-12, gates/retencao-liquidation-history.md, n=5 intervalos]`. A series whose
# `t` is the start carries `label_shift = +interval` to reach the end-labelled grid.
#
# The same observation is the evidence for `RS-3.4`: the newest bucket is PARTIAL by
# construction, and writing it as final would publish a number that is still growing.
LIQUIDATION_LABEL_SHIFT_MS: Final[int] = _INTERVAL_MS

# Twice the native grid, the same bound `open_interest_catalog.py` uses: a reader may `LOCF` at
# most one missed bucket before the row is stale (`SPEC-001` §3.2).
#
# ⚠️ AND FOR THIS SERIES `LOCF` IS A TYPE ERROR, NOT A TUNING CHOICE. The series is SPARSE:
# only 20,2% of 1-minute buckets carry a liquidation at all
# `[MEDIDO 2026-09-12, n=14.344 buckets possiveis, 2.900 preenchidos]`. Absence is `SEM_PONTO`
# and NEVER zero (plan item 5.4) — `nature=FLOW` is what makes carrying the last value forward
# wrong here, and this number bounds staleness of a WRITTEN point, not a licence to invent one.
MAX_STALENESS_MS: Final[int] = 2 * _INTERVAL_MS

# The two legs. Closed on purpose: a third cohort would be a third series with its own
# requirement, not a value someone may pass in.
LONG: Final[str] = "long"
SHORT: Final[str] = "short"
COHORTS: Final[tuple[str, str]] = (LONG, SHORT)

_VERIFIED_BY: Final[str] = (
    "test_liquidation_catalog.py::test_the_catalog_has_two_rows_one_per_cohort_never_a_sum"
)


class UnknownLiquidationCohortError(Exception):
    """A `cohort` outside the two legs the sources actually publish."""


def coinalyze_liquidation_key(cohort: str, *, instrument_id: str = "BTCUSDT") -> SeriesKey:
    """Build ONE of the two liquidation series — `cohort` has no default, on purpose.

    Same control as `coinalyze_open_interest_key`'s `reduction` (`D6.7`): a caller that omits
    the term gets an error naming it, never a leg picked in silence. Here the stakes are
    higher than a wrong row — a silent default would publish long liquidations under a key
    that a reader is entitled to read as "the liquidations".
    """
    if cohort not in COHORTS:
        raise UnknownLiquidationCohortError(
            f"unknown liquidation cohort {cohort!r}; the sources publish exactly "
            f"{COHORTS!r} — `l` and `s` of `liquidation-history`, and the order side of "
            f"`!forceOrder@arr`"
        )
    return SeriesKey(
        provider="coinalyze",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric="sum_liquidation",
        cohort=cohort,
        interval=_INTERVAL,
        unit=_UNIT,
        denom=_DENOM,
        # FLOW, not STOCK: the bucket carries what was liquidated DURING it. This is also what
        # makes a missing bucket `SEM_PONTO` instead of zero — a STOCK may be carried forward,
        # a FLOW may not.
        nature=Nature.FLOW,
        ts_convention=TsConvention.AGGREGATE_OVER_BUCKET,
        reduction=Reduction.SUM,
        # Not derived from `aggTrade`. AN EXPLICIT VALUE, NEVER `NULL` (`SPEC-001` §2.1).
        quantity_field=QuantityField.NA,
        label_shift=LIQUIDATION_LABEL_SHIFT_MS,
        aggregation_scope="Symbol",
        verified_by=_VERIFIED_BY,
    )


def liquidation_catalog_entries(instrument_id: str = "BTCUSDT") -> SeriesCatalog:
    """Build the TWO real `series_catalog` rows for `sum_liquidation`, one per cohort.

    ── `published_error` IS `None`, AND THAT IS A MEASURED REFUSAL ────────────────────────

    `SPEC-001` §3.3 gates publication of a RECONSTRUCTION on `(median, p99, n)`. This series is
    not a reconstruction, and `DoD 6c` of plan `05` records why it also has no oracle to
    measure one against: it is the ONLY third-party series of the feature and the ONLY one
    without a second source — Binance has no REST liquidation endpoint, and `!forceOrder@arr`,
    which would be the only comparison, is off the critical path by `ADR-036/D4` and has
    written nothing (`5` runs, all `REJECTED`, `n_written = 0`
    `[MEDIDO 2026-09-12 em md.ingest_run]`).

    Inventing a `(median, p99, n)` here would publish a fidelity nobody measured, which is
    worse than publishing none. `ADR-036/D6` escalates the fidelity question to the
    `quant-architect`; until that returns, this field stays empty and the emptiness is the
    honest signal.
    """
    return build_series_catalog(
        [
            SeriesCatalogEntry(
                key=coinalyze_liquidation_key(cohort, instrument_id=instrument_id),
                native_grid=NATIVE_GRID,
                native_grid_ms=NATIVE_GRID_MS,
                max_staleness_ms=MAX_STALENESS_MS,
            )
            for cohort in COHORTS
        ]
    )
