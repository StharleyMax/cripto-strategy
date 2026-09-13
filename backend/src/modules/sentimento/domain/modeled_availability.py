"""`ADR-038/D1`: the MODELED `available_at` is the next NATIVE GRID point, and it is invariant."""

# `SPEC-001` §5.2, literal, is the formula this module implements:
#
#     available_at_MODELED = proximo ponto da grade nativa
#                            >= ( bucket_end + p99_lag(endpoint, observer_region) + margem )
#
# with "arredondamento sempre PARA CIMA". `domain/live_availability_write.py` owns the OTHER
# branch of the same section — the endpoint with NO measured `lag_ms`, which writes
# `available_at = NULL` — and its docstring says, verbatim, that this branch "is a different
# computation (grid resolution, a margin, `LagSummaryRow.lag_p99_ms`) that this module refuses
# rather than approximates". This module is that computation. The two are complementary and
# neither may answer for the other.
#
# ── WHY A GRID OF `300_000` DISSOLVES THE PRE-CONDITION INSTEAD OF NEGOTIATING IT ────────────
#
# `ADR-038` §3: rounding UP to the native grid makes the stamp a STEP FUNCTION of the lag. On a
# grid of `G`, EVERY value of `p99_lag + margem` in `(0, G]` lands on the SAME grid point,
# `bucket_end + G`. So for an endpoint whose plausible lag band is contained in `(0, G]`, the
# stamp does not depend on the exact value of a quantity this repository cannot measure today —
# it is invariant over the whole band. That is a demonstrable property, NOT a dispensation from
# measuring, and `stamps_over_band` below is what demonstrates it rather than asserting
# it in prose.
#
# ⛔ AND IT IS EXACTLY WHY klines IS NOT IN THIS TABLE. `/fapi/v1/klines` has a native grid of
# `60_000` and a measured `p99` of `61_071 ms` `[MEDIDO 2026-09-12, ADR-038 §0, n=696 buckets da
# janela estavel `bucket_end >= 1789243200000`]` — OUTSIDE `(0, 60_000]`. The invariance argument
# does not reach it, the stamp WOULD move with the lag, and stamping it here would be affirming
# knowledge nobody had. `OPCOES-D16`/`O1`/`O4` own klines; this module refuses it
# (`EndpointHasNoGridInvariantStampError`) instead of extending an argument past its evidence.
#
# ⛔ AND THE SECOND ENDPOINT `ADR-038` §3 NAMES IS NOT HERE EITHER — MEASURED, NOT ASSUMED.
#
# `ADR-038` §3 extends `D1` to `/futures/data/globalLongShortAccountRatio` on the grounds that it
# shares the `300_000 ms` grid. The grid is the same; the NATURE is not, and the read does not
# survive it. `as_of_accessor.py:328` vetoes a read when
#
#     age_ms >= policy.bucket_interval_ms  and  not CARRY_FORWARD_BY_NATURE[nature]
#
# and `CARRY_FORWARD_BY_NATURE[Nature.RATIO]` is `False` (`Nature.STOCK` is `True`). A row
# stamped `available_at = bucket_end + G` is admissible only from `t >= bucket_end + G`, so its
# `age_ms = t - bucket_end` is `>= G` at EVERY instant it is readable at all. For a nature that
# does not carry forward, the veto therefore fires always — it is an arithmetic identity, not a
# property of any particular dataset.
#
# Measured, driving the REAL mapper and the REAL `as_of` over the REAL store, `61` slots of
# 1 min at `knowledge_time = agora`, BTCUSDT `[MEDIDO 2026-09-12, n = 2.016 linhas OI / 1.000
# RATIO; controles C0 = 0/61 e C1 = 61/61]`:
#
#     offset  |  openInterestHist (STOCK)  |  globalLongShortAccountRatio (RATIO)
#      34.532 |          61/61             |          61/61
#      66.712 |          61/61             |          48/61   <- the value ADR-038 §1.2 simulated
#     150.000 |          61/61             |          36/61
#     299.999 |          61/61             |          12/61
#     300.000 |          61/61             |           0/61   <- the value `D1` actually produces
#
# ⇒ For `STOCK` the read is invariant over the whole band, exactly as `D1` argues. For `RATIO` it
# is NOT: `D1`'s round-up lands precisely on the discontinuity, and `ADR-038` §1.2 never measured
# its own decision for this endpoint — row `F` of that table simulated the RAW lag (`+66.712`),
# which is not what rounding UP to the native grid emits. Applying `D1` here would take the live
# panel from `4/61` to `0/61` (`2/61` to `0/61` on the 5-min grid the panel draws): a measured
# REGRESSION. So this module refuses the entry instead of shipping it, and the question goes back
# to `ADR-038`'s author — see `docs/context/cinco-metricas-do-core/gates/ADR-038-D1-builder.md`.
#
# ── THE REFUSALS ARE IN THE CONSTRUCTOR, NOT IN A REVIEW COMMENT ─────────────────────────────
#
# `GridInvariantEndpoint.__post_init__` refuses `lag_upper_bound_ms > native_grid_ms` (the klines
# case: `(60_000, 61_071)` raises) AND a nature that does not carry forward (the RATIO case).
# Neither can be written down as a valid entry at all. `CLAUDE.md` records that an anti-lookahead
# rule of this project was already INVERTED once and propagated through two documents before
# anyone noticed — so the properties that keep this decision honest are spelled as a signature
# that cannot express the wrong case, the same shape
# `live_availability_write.resolve_unmeasured_endpoint_availability` uses for its own branch.

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.as_of_accessor import CARRY_FORWARD_BY_NATURE
from src.modules.sentimento.domain.provenance import AvailabilitySource
from src.modules.sentimento.domain.series_key import Nature

# The one `availability_source` a row stamped by this module ever carries. Named rather than
# inlined at the two write sites so the falsifier asserts against IT: a row whose `available_at`
# is COMPUTED may not claim `OBSERVED`, which is the whole consequence `ADR-038`/`D1` accepts
# ("todo consumidor le `availability_source`").
MODELED_AVAILABILITY_SOURCE: Final[AvailabilitySource] = AvailabilitySource.MODELED


class InvalidGridInvariantEndpointError(Exception):
    """An endpoint was declared where `ADR-038`/`D1`'s argument does not in fact hold.

    Two ways to get here, and the module header measures both. `lag_upper_bound_ms` exceeding
    `native_grid_ms` is the klines case: past one grid step the STAMP stops being invariant. A
    nature that does not carry forward is the RATIO case: the stamp is invariant but the READ is
    not, because `as_of` vetoes `age_ms >= bucket_interval_ms` for such a nature and a stamp of
    exactly one grid makes that condition hold at every readable instant.
    """


class EndpointHasNoGridInvariantStampError(Exception):
    """A caller asked for the `D1` stamp of an endpoint that `D1` does not cover."""


@dataclass(frozen=True)
class GridInvariantEndpoint:
    """One endpoint whose MODELED stamp is invariant over its whole plausible lag band.

    `lag_upper_bound_ms` is NOT a measured `p99` and is not pretending to be one: it is the
    UPPER END of the band the invariance has to cover, and the only thing `D1` needs is that the
    band fits inside one native grid step. Declaring the bound rather than a point estimate is
    what keeps the honest `[NAO MEDIDO: p99 de openInterestHist]` of `ADR-038` §8 visible in the
    code instead of laundered into a number that looks measured.

    `evidence` carries the observation that puts the real lag well inside the band, with its
    `n`, so a reader does not have to leave the file to see how far from the edge it sits.

    `nature` is the `SeriesKey` term of the series this endpoint writes, and it is a FIELD rather
    than a lookup because it is the term that decides whether the invariance survives the READ —
    see the table in the module header. Declaring it beside the grid is what lets the constructor
    refuse the `RATIO` case instead of a reviewer having to notice it.
    """

    endpoint: str
    native_grid_ms: int
    lag_upper_bound_ms: int
    nature: Nature
    evidence: str

    def __post_init__(self) -> None:
        """Refuse an entry where `D1`'s invariance does not reach the read — `ADR-038` §3."""
        if not CARRY_FORWARD_BY_NATURE[self.nature]:
            raise InvalidGridInvariantEndpointError(
                f"endpoint {self.endpoint!r} writes a {self.nature.value!r} series, which does "
                f"not carry forward: a stamp of exactly one native grid makes `age_ms >= "
                f"bucket_interval_ms` hold at every instant the row is readable, so `as_of` "
                f"vetoes every slot and the panel reads 0 of 61 instead of the 48 of 61 that "
                f"`ADR-038` §1.2 simulated with the RAW lag. `D1` buys nothing here and costs "
                f"the slots the endpoint already had — the decision goes back to `ADR-038`"
            )
        if self.native_grid_ms <= 0:
            raise InvalidGridInvariantEndpointError(
                f"native_grid_ms = {self.native_grid_ms} is not positive: there is no grid to "
                f"round up to, so `SPEC-001` §5.2's formula has no answer"
            )
        if self.lag_upper_bound_ms <= 0:
            raise InvalidGridInvariantEndpointError(
                f"lag_upper_bound_ms = {self.lag_upper_bound_ms} is not positive: a band that "
                f"includes zero claims a consumer could know a bucket at the instant it ended"
            )
        if self.lag_upper_bound_ms > self.native_grid_ms:
            raise InvalidGridInvariantEndpointError(
                f"endpoint {self.endpoint!r} declares a lag band up to "
                f"{self.lag_upper_bound_ms} ms on a native grid of {self.native_grid_ms} ms: "
                f"past one grid step the MODELED stamp is no longer invariant over the band, so "
                f"`ADR-038`/`D1`'s argument does not cover it (this is the klines case — "
                f"grid 60000, p99 61071 — and it belongs to `OPCOES-D16`/`O4`, not here)"
            )

    @property
    def modeled_stamp_offset_ms(self) -> int:
        """Return the constant offset this endpoint's stamp adds to a grid-aligned `bucket_end`.

        It is one native grid step, and that is the invariance restated as a number rather than
        as an argument: every lag in `(0, native_grid_ms]` rounds up to the same point.
        """
        return self.native_grid_ms


# ── THE TABLE. ONE ENDPOINT, AND THE TWO ABSENCES ARE THE POINT ──────────────────────────────
#
# `ADR-038` §3, literal: "`D1` vale para `/futures/data/openInterestHist` e para
# `/futures/data/globalLongShortAccountRatio` ... **Nao vale para klines**".
#
# klines is absent because its lag band leaves the grid (`61_071 > 60_000`). The long/short ratio
# is absent because its NATURE leaves the read (`CARRY_FORWARD_BY_NATURE[RATIO] is False`), which
# `ADR-038` did not measure and which the table in the module header does — `0/61` against the
# `4/61` the endpoint has today. Both absences are enforced by `__post_init__`, so neither can be
# re-added without the arithmetic being confronted.
#
# The grid value is the SAME `300_000` the catalog already declares
# (`open_interest_catalog._NATIVE_GRID_MS`), and `test_modeled_availability.py` pins it against
# that constant rather than against a literal typed twice — a grid that drifted here and not
# there would move the stamp of every future row while both files still read correctly alone.
GRID_INVARIANT_ENDPOINTS: Final[Mapping[str, GridInvariantEndpoint]] = {
    entry.endpoint: entry
    for entry in (
        GridInvariantEndpoint(
            endpoint="/futures/data/openInterestHist",
            native_grid_ms=300_000,
            lag_upper_bound_ms=300_000,
            nature=Nature.STOCK,
            evidence=(
                "the only lag ever observed for this endpoint is 34532 ms, 8,7x inside the "
                "band [MEDIDO 2026-09-12, ADR-038 §1.1a, n=4 poll instants over 12 live rows]; "
                "the p99 itself is [NAO MEDIDO] because no live collector exists yet (ADR-038 "
                "§7.3), and §3 argues why its exact value cannot change this stamp. The READ is "
                "invariant too, measured over the whole band: 61/61 at every offset from 34532 "
                "to 300000 [MEDIDO 2026-09-12, n=2016 linhas, 61 slots, kt=agora]"
            ),
        ),
    )
}


def modeled_available_at(
    *, bucket_end_ms: int, native_grid_ms: int, lag_with_margin_ms: int
) -> int:
    """Return the next native grid point at or after `bucket_end_ms + lag_with_margin_ms`.

    This is `SPEC-001` §5.2 verbatim, including "arredondamento sempre PARA CIMA". The grid is
    anchored at the epoch — the same anchoring `md.series` buckets already carry
    (`bucket_end % 300_000 == 0` for both endpoints of `GRID_INVARIANT_ENDPOINTS`, `[MEDIDO
    2026-09-12, collector_series_mapping.py §open interest, n=12 pontos]`) — so "next grid
    point" is `ceil(target / grid) * grid` and not `bucket_end + k * grid`, which would silently
    answer something else for a `bucket_end` that is off-grid.

    ⛔ THE DIRECTION OF THE ROUNDING IS THE ANTI-LOOKAHEAD RULE. Rounding DOWN, or to the
    nearest, would stamp a row as knowable BEFORE the lag had elapsed — lookahead written into
    the store, the exact failure `SPEC-001` §5.2 measured as 361x optimistic for the
    `event_time + interval` default. `test_modeled_availability.py` pins the direction by
    sweeping the band, so flipping `ceil` to `floor` fails a test rather than a chart.
    """
    if native_grid_ms <= 0:
        raise InvalidGridInvariantEndpointError(
            f"native_grid_ms = {native_grid_ms} is not positive: there is no grid to round up to"
        )
    if lag_with_margin_ms <= 0:
        raise InvalidGridInvariantEndpointError(
            f"lag_with_margin_ms = {lag_with_margin_ms} is not positive: `SPEC-001` §5.2 adds a "
            f"lag AND a margin to `bucket_end`, and a non-positive sum would round to the "
            f"bucket's own instant — a consumer knowing a bucket the moment it ended"
        )
    target = bucket_end_ms + lag_with_margin_ms
    return -(-target // native_grid_ms) * native_grid_ms


def modeled_available_at_for_endpoint(*, endpoint: str, bucket_end_ms: int) -> int:
    """Return the `ADR-038`/`D1` MODELED stamp for `endpoint`, or refuse the endpoint.

    An endpoint outside `GRID_INVARIANT_ENDPOINTS` raises instead of falling back to any
    default. That refusal is the whole point: klines reaching a silent fallback here would
    reproduce, with a different number, the `event_time + interval` default that `SPEC-001` §5.2
    exists to forbid.
    """
    entry = GRID_INVARIANT_ENDPOINTS.get(endpoint)
    if entry is None:
        raise EndpointHasNoGridInvariantStampError(
            f"endpoint {endpoint!r} is not covered by `ADR-038`/`D1`: only "
            f"{sorted(GRID_INVARIANT_ENDPOINTS)} have a lag band contained in one native grid "
            f"step, and no other endpoint gets a MODELED stamp from this module"
        )
    return modeled_available_at(
        bucket_end_ms=bucket_end_ms,
        native_grid_ms=entry.native_grid_ms,
        lag_with_margin_ms=entry.lag_upper_bound_ms,
    )


def stamps_over_band(entry: GridInvariantEndpoint, *, bucket_end_ms: int, step_ms: int) -> set[int]:
    """Return every distinct stamp `entry` produces as the lag sweeps its whole band.

    The band is `(0, lag_upper_bound_ms]`, walked in `step_ms` increments with both ends
    included. `ADR-038`/`D1` is true for this endpoint exactly when this set has ONE element —
    that is the invariance, computed rather than argued, and it is what the falsifier calls.
    """
    if step_ms <= 0:
        raise InvalidGridInvariantEndpointError(
            f"step_ms = {step_ms} is not positive: a sweep that does not advance would report "
            f"invariance it never tested"
        )
    lags = list(range(1, entry.lag_upper_bound_ms + 1, step_ms))
    if lags[-1] != entry.lag_upper_bound_ms:
        lags.append(entry.lag_upper_bound_ms)
    return {
        modeled_available_at(
            bucket_end_ms=bucket_end_ms,
            native_grid_ms=entry.native_grid_ms,
            lag_with_margin_ms=lag,
        )
        for lag in lags
    }
