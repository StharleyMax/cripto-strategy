"""`count_long_short_ratio` — ONE of the four L/S series, and the measurements that fix it."""

# `SPEC-007` phase `04` items 4.1 + 4.3, `RF-2`, `RN-1`.
#
# ── WHY THIS MODULE NAMES ONE SERIES AND NOT "LONG/SHORT" ──────────────────────────────────
#
# `series_key.FORBIDDEN_METRIC_NAMES` refuses `ls_ratio` inside `SeriesKey.__post_init__`, and
# `domain/long_short_ratio_series.py` already transcribes the four real names from `SPEC-001`
# §3.1. Three of them have autocorrelation lag-1 of 0,99+ and the fourth has 0,0955, so a single
# generic row would weld series that do not even share a nature-of-ratio. This module builds the
# catalog row for exactly one of them — `COUNT_LONG_SHORT_RATIO`, the one the owner's own phrase
# names in common use and the one Binance publishes under
# `/futures/data/globalLongShortAccountRatio` — and it imports the metric NAME from
# `long_short_ratio_series` rather than respelling it, so the identity and the resampling rules
# for the same series cannot drift apart by a typo.
#
# ── THE TWO NUMBERS BELOW ARE MEASURED, NOT INHERITED ──────────────────────────────────────
#
# `T-04.1` ran BEFORE this identity was written, because correcting `interval` afterwards
# re-identifies the series (`series_key.py`'s `series_key_id()` is the `sha256` of all fifteen
# terms). What it measured, against the origin and not against a mirror:
#
#   * `[MEDIDO 2026-09-12]` `curl -s
#     "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1m&limit=30"`
#     answers `HTTP 200` with `[]` — EMPTY, not an error. `period=3m` likewise. `period=5m`
#     answers 500 points. ⇒ the `5min` floor is BINANCE's, not Coinalyze's: the `[INFERRED]` of
#     `MEDICAO-COINALYZE-TEMPO-REAL.md` §2.2 survived its falsifier, so `interval="5m"` here is
#     a measured choice and not a concession.
#
#   * `[MEDIDO 2026-09-12, n=499 gaps over limit=500]` every consecutive pair of `timestamp`s on
#     the `5min` grid is EXACTLY `300_000` ms apart — zero variance, `min gap == max gap`. That
#     inter-arrival, not the publication delay, is what `max_staleness_ms` is made of
#     (`ADR-006`/`SPEC-001` §3.2: "until the NEXT observation arrives", never "how long this one
#     took"). `OPCOES-CATALOGO-PREMIUM-INDEX.md` §F2 is the record of that confusion being made
#     once already, on `premiumIndex`, and of `2 x interval` being the value with precedent in
#     every one of the eleven existing rows.

from __future__ import annotations

from typing import Final

from src.modules.sentimento.domain.long_short_ratio_series import COUNT_LONG_SHORT_RATIO
from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

# The `interval` term, in the SPEC's short spelling. Measured above: `1m` and `3m` come back
# empty from the ORIGIN, so this is the finest grid that exists for this series anywhere.
LONG_SHORT_INTERVAL: Final[str] = "5m"

# `native_grid` — what the SOURCE emits (`CA-F2-11`), spelled the way
# `open_interest_catalog.py` already spells the same five-minute bucket. `interval` and
# `native_grid` AGREE here, which is why this series pays `GA-2`'s staircase on the served
# `1min` grid and not a second, independent resampling cost.
LONG_SHORT_NATIVE_GRID: Final[str] = "5min"

# ── THE SAME FACT AS THE LABEL ABOVE, IN MILLISECONDS — AND IT IS WHAT UNBLOCKS `DoD-2` ─────
#
# `ADR-037/D3`: the width is DECLARED beside the label, never parsed from it (`ADR-003`/FR-3
# reserves the grid-label translator to `charts`' canonical grid, and a second parser here
# would be the second implementation that item exists to forbid). The read path injects this
# as `bucket_interval_ms` (`use_cases/series_history.py`), and THIS series is the one that
# measured why it matters: with the report step (`60_000`) injected instead of the native grid,
# `D4.11`'s `age_ms >= bucket_interval_ms and not CARRY_FORWARD_BY_NATURE[RATIO]` vetoes every
# slot — `[MEDIDO 2026-09-12, ADR-037/M3: 0/61 com 60_000, 4/61 com 300_000, sobre os MESMOS
# dados e com `CARRY_FORWARD_BY_NATURE[Nature.RATIO]` intocado em `False`]`.
#
# The pair `(LONG_SHORT_NATIVE_GRID, LONG_SHORT_NATIVE_GRID_MS)` cannot drift silently:
# `tests/sentimento/test_native_grid_ms_pairs.py` enumerates every SERVED row against one
# declared table, so a row declaring `("5min", 60_000)` fails there rather than emptying a
# panel with `rc=0`.
LONG_SHORT_NATIVE_GRID_MS: Final[int] = 300_000

# `2 x interval`, on the measured inter-arrival of `300_000` ms. One missed bucket is tolerated
# as latency, two are a gap, and a gap renders as absence (`RN-1`) — never as zero. It is the
# same number every other `5m` row in this domain carries (`open_interest_catalog.py`'s
# `2 * _INTERVAL_MS`), reached here by measuring rather than by copying: `OPCOES-CATALOGO-
# PREMIUM-INDEX.md` §F2 records that the `2 x native_grid` formula, applied literally outside
# the domain it was built in, produced `2.000 ms` — a bound that refuses EVERY read.
LONG_SHORT_MAX_STALENESS_MS: Final[int] = 600_000

# ── `label_shift = 0` IS MEASURED, AND IT DIVERGES FROM THE OPEN-INTEREST ROW ON PURPOSE ────
#
# `open_interest_catalog.OPEN_INTEREST_LABEL_SHIFT_MS` is `+interval` because the Coinalyze `t`
# it was measured against is the START of the bucket (`SPEC-001` §2.1, `D6.8`). Copying that
# number here would be applying a measurement of ANOTHER source's labelling to this one. So it
# was measured directly, by polling the endpoint across a bucket boundary:
#
#   `[MEDIDO 2026-09-12, poll de 10 s, n=2 fronteiras de bucket]` the point carrying
#   `timestamp = 1789218000000` became visible at wall clock `1789218009643` (**9,6 s** after its
#   own timestamp) and the next one, `1789218300000`, at `1789218370771` (**70,8 s** after its
#   own timestamp). Both are far below the **300 s** a bucket-START label would require. ⇒ the
#   `timestamp` Binance publishes on `/futures/data/globalLongShortAccountRatio` is the instant
#   the snapshot was taken, i.e. ALREADY the end of the window it labels. There is nothing to
#   shift. (The publication delay itself VARIES between those two figures — which is exactly why
#   it is not the input to `max_staleness_ms`: `ADR-006` asks when the NEXT observation arrives,
#   and that is the rock-steady `300_000` ms above.)
#
# An EXPLICIT zero, never an unmeasured default (`klines_volume_catalog.py`'s own wording): the
# command and the two instants above are what backs it, and `_VERIFIED_BY` names the test that
# keeps it from moving in silence.
LONG_SHORT_LABEL_SHIFT_MS: Final[int] = 0

# `verified_by` is the fifteenth term of the identity, so the WRITER and the SERVED CATALOG land
# on the same `series_key_id` only while both carry this exact string. Hardcoding it HERE — the
# shape `open_interest_catalog.py` uses, rather than taking it as a caller argument — is what
# removes the drift class entirely: there is one home for the value, and both sides call the
# same builder. A divergence would answer `200` with `n_points = 0` for a table full of rows,
# which is the silent `rc=0` failure `ADR-012` names.
_VERIFIED_BY: Final[str] = (
    "test_long_short_catalog.py::test_the_five_minute_grid_is_the_origins_and_the_label_is_the_bucket_end"
)


def count_long_short_ratio_key(instrument_id: str) -> SeriesKey:
    """Build the `count_long_short_ratio` identity for `instrument_id` — `5m`, `RATIO`, `POINT`.

    `nature=RATIO` and not `STOCK`: the value is a dimensionless quotient of account counts, and
    `SPEC-001` §5.11 calls this shape "RATIO de estoque" — `last()` on the edge is the legitimate
    coarsening, `mean()`/`sum()` are not. The refusal of the wrong coarsening is NOT re-stated
    here as a branch: `long_short_ratio_series.py` already refuses it BY TYPE, and this module
    only names the identity.

    `unit="ratio"` / `denom="NA"` follows `collector_series_mapping._funding_estimado_key`, the
    existing row for the other dimensionless quantity this codebase publishes — a ratio has no
    base asset to be denominated in, and `NA` is an explicit value rather than a `NULL` in a term
    of identity (`SPEC-001` §2.1).

    `reduction=POINT` / `ts_convention=POINT_AT_BUCKET_END`: one reading per bucket, stamped at
    the instant it was taken. Measured — see `LONG_SHORT_LABEL_SHIFT_MS` for the two instants.
    """
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=COUNT_LONG_SHORT_RATIO,
        cohort="all",
        interval=LONG_SHORT_INTERVAL,
        unit="ratio",
        denom="NA",
        nature=Nature.RATIO,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=LONG_SHORT_LABEL_SHIFT_MS,
        aggregation_scope="Symbol",
        verified_by=_VERIFIED_BY,
    )


def build_count_long_short_ratio_entry(instrument_id: str) -> SeriesCatalogEntry:
    """Build the served catalog row — `SPEC-007` §4.5's "reusing is not doing nothing".

    `price_use` stays `None`: `PRICE_SOURCES` (`SPEC-001` §3.7) is a closed set of five names and
    an account-count ratio is not among them, so `resolve_price_source` must never be able to
    route a price question here. `reconstructed_from`/`published_error` stay `None` together —
    the value is read from the bucket the origin itself publishes, so there is no reconstruction
    and no reconstruction error to declare (`SeriesCatalogEntry.__post_init__` enforces that the
    two travel in pairs, in both directions).
    """
    return SeriesCatalogEntry(
        key=count_long_short_ratio_key(instrument_id),
        native_grid=LONG_SHORT_NATIVE_GRID,
        native_grid_ms=LONG_SHORT_NATIVE_GRID_MS,
        max_staleness_ms=LONG_SHORT_MAX_STALENESS_MS,
    )
