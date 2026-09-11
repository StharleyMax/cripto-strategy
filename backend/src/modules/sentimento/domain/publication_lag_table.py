"""Measured publication lag PER ENDPOINT — the `p99_lag` term `SPEC-001` §5.2's formula needs."""
# `D16` (owner, 2026-09-11) chose option `2` of `E1`: backfill rows stop stamping `available_at`
# with the instant of OUR fetch and start stamping `bucket_end + <publication lag of that
# endpoint>`, labelled `availability_source = MODELED`. `E1`'s own table declares the
# precondition, literal: *"exige atraso MEDIDO por endpoint antes de qualquer linha (`SPEC-001`
# §5.2 proibe `event_time + interval`, o default 361x otimista)"*. THIS MODULE IS THAT
# PRECONDITION AND NOTHING ELSE — it writes nothing, no write path imports it yet, and the
# backfill stamp is deliberately untouched by the task that created it.
#
# ## What was measured, and with which command — `[MEDIDO 2026-09-11T19:4xZ]`
#
# Read-only, against the live production database (`deploy-postgres-1`, up 3 d). Nothing seeded,
# nothing written. The window is FROZEN at `bucket_end < 1789155360000` (2026-09-11 19:36:00 UTC)
# so the numbers below still reproduce after the collector keeps running:
#
#     docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' -c "
#     with g as (select series_key_id, available_at, count(*) nb from md.series group by 1,2),
#          live as (select s.* from md.series s
#                     join g on g.series_key_id = s.series_key_id
#                           and g.available_at = s.available_at and g.nb = 1
#                    where s.bucket_end < 1789155360000)
#     select source, count(*) n,
#            min(bucket_end), max(bucket_end),
#            min(available_at-bucket_end),
#            percentile_disc(0.50) within group (order by available_at-bucket_end),
#            percentile_disc(0.95) within group (order by available_at-bucket_end),
#            percentile_disc(0.99) within group (order by available_at-bucket_end),
#            max(available_at-bucket_end)
#       from live group by 1 order by 1;"
#     # /fapi/v1/klines       | 4079  | ... | 1353 | 30979 | 56999 | 59361 | 59999
#     # /fapi/v1/premiumIndex | 34752 | ... | -100 |   968 |  1625 |  1758 |  1895
#
# ## Why `nb = 1` (fan-out), and NOT `available_at - bucket_end <= 300000`
#
# The obvious filter — "lag under 5 minutes is live" — is CIRCULAR: it uses the quantity being
# measured to define the population it is measured over, and it truncates the very tail `p99`
# reads. It also separates nothing, because the lag histogram of `md.series` has no gap at
# 300 s: `24` rows in `180-300 s`, `60` in `300-600 s`, `600` in `10-60 min` — a continuous ramp,
# which is what importing a contiguous history in one request looks like.
#
# The non-circular separator is the FAN-OUT of a single `available_at` instant over one
# `series_key_id`. A live poll reveals exactly ONE newly closed bucket; a backfill request stamps
# the same fetch instant onto every bucket it returns. Measured, over all `159.984` rows:
#
#     # ... select s.source, g.nb, count(*) from md.series s join g on ... group by 1,2
#     # /fapi/v1/klines        nb=1 -> 4.075   nb=2 -> 210   nb=1079/1080/1500 -> 120.951
#     # /fapi/v1/premiumIndex  nb=1 -> 34.752  (no other fan-out exists: this endpoint has no
#     #                                         history path, so 100% of its rows are live)
#
# `nb = 1` keeps the klines live rows and drops `120.951` backfill rows without ever looking at
# the lag. `nb = 2` (210 rows) is the ambiguous middle — a live poll that caught up after a gap,
# or a two-bucket backfill — and it is EXCLUDED rather than guessed at, the same way
# `availability_lag.classify_transitions` refuses to count a first read as a sample.
#
# ## Q1 — why `p99`, and not `p50`, `p95` or `max`
#
# The statistic is not a free choice here. `SPEC-001` §5.2 already fixed it inside the MODELED
# formula it writes out in full ("`available_at_MODELED = proximo ponto da grade nativa >=
# (bucket_end + p99_lag(endpoint, observer_region) + margem)`"), and `availability_lag_stats`
# already carries it as a named constant (`LAG_STAT_NAME = "p99"`) for a reason that was measured
# rather than argued: mean and median are "otimistas em metade dos casos", and mislabelling a
# bucket by one step "inverte o sinal do delta-OI de 15 min em 21,96% das janelas (n=8.629)". An
# optimistic `available_at` is lookahead — the exact defect `D16` is paid to avoid.
#
# `max` fails from the other side, and the measurement says how little it would buy: the klines
# `max` is `59.999` ms against a `p99` of `59.361` ms — `638` ms apart, `1,06%` — while `max` is
# hostage to a single stalled poll. Paying for that hostage to gain `638` ms of pessimism is a bad
# trade, and `SPEC-001`'s round-UP to the native grid absorbs the difference anyway: `59.361` and
# `59.999` round to the same grid point, `bucket_end + 60 s`. So `p99` it is — and this table
# reuses `availability_lag_stats.LAG_STAT_NAME` instead of spelling a second `"p99"` of its own,
# because two spellings of one decision is how the two drift apart.
#
# ## Q2 — the lag does NOT drift; a constant scalar is a valid model
#
# Per-hour `p99`, over hours with `n >= 100`: `premiumIndex` `74` hours, klines `18`. Splitting
# each series in half and comparing the halves — the cheapest test that separates drift from
# noise — gives `0,13%` of difference for BOTH endpoints: `1767,1` vs `1764,8` ms for
# `premiumIndex`, `59.228,9` vs `59.306,9` ms for klines (excluding the truncated final hour).
# There is no trend.
#
# The hourly AMPLITUDE is wide for `premiumIndex` (`1.521`..`1.895` ms, `21,1%`) and that is
# sampling noise, not drift — provably so, because it SHRINKS as `n` grows, which drift does not:
# at `n ~ 480/hour` the `p99` is the ~5th largest reading of the hour and swings `21,1%`; at
# `n ~ 11.400/day` the four daily `p99` values are `1.793 / 1.753 / 1.740 / 1.809` ms, a spread of
# `69` ms (`3,9%`) whose sign alternates.
#
# klines is measured over `17,9` hours (`1` day) because its live collector only started on
# 2026-09-11 — the hour-to-hour answer holds, the day-to-day one is NOT yet available for this
# endpoint, and saying so is cheaper than implying a 4-day window it does not have.
#
# ## Q3 — per ENDPOINT, not per symbol
#
# Per-symbol `p99`, same window (`n ~ 1.020` and `~ 8.688` per symbol):
#
#     # klines        BTCUSDT 59.248  ETHUSDT 59.430  LINKUSDT 59.531  SOLUSDT 59.361  -> 283 ms
#     # premiumIndex  BTCUSDT  1.740  ETHUSDT  1.758  LINKUSDT  1.774  SOLUSDT  1.774  ->  34 ms
#
# The spread across symbols is `283` ms on `59.361` (`0,48%`) and `34` ms on `1.758` (`1,93%`) —
# in both cases SMALLER than the same endpoint's own hour-to-hour noise (`1,4%` and `21,1%`). A
# per-symbol table would be fitting noise, and would owe a remeasurement for every symbol the
# universe gains. One value per endpoint lies to none of the four symbols measured.
#
# ## The caveat a consumer MUST carry: this is an OBSERVER lag, poll resolution included
#
# `available_at` in `md.series` is the instant OUR collector could first know, which is what
# `SPEC-001` §2.2 defines it to be — so the number here is `publication delay + our own poll
# phase`, and for klines the phase is almost all of it. The evidence is the shape: klines lag is
# near-uniform over `[1.353, 59.999]` ms with mean `30.944` and standard deviation `16.687` ms,
# and `60.000 / sqrt(12) = 17.321` — the signature of a phase uniform over a 60 s poll period laid
# on top of a small constant. `lag_min_ms` is therefore the tighter upper bound on the ENDPOINT's
# own delay (`1.353` ms for klines), and `poll_phase_share` below reports how much of
# `lag_p99_ms` is our sampling rather than theirs: `96,7%` for klines, `3,1%` for `premiumIndex`.
#
# Using the observer lag anyway is not sloppiness, it is the point: a MODELED backfill row has to
# claim exactly what our LIVE path would have known at the same bucket, or it becomes MORE
# optimistic than our own capture — lookahead measured against ourselves. Erring late is the
# direction `SPEC-001` §5.2 mandates ("o erro e sempre pessimista").
#
# `premiumIndex` reads as the opposite regime — `3,1%` of poll phase against `96,7%` — and the
# reason is NOT that its collector is aligned to the grid. It is not aligned: it closes its cycle
# with the same post-work `stop_event.wait(interval_s)` (`infra/collectors_cli.py`), and the drift
# is measurable from this very table — `34.752` rows at `8` rows per cycle is `4.344` cycles over
# a `262.496` s window, i.e. `60,441` s per cycle against a declared cadence of `60,0` s.
#
# The phase does not show up here because the STATISTIC CANNOT CARRY IT, not because it is absent.
# For this endpoint `_build_row` stamps `bucket_end = reading.source_time`
# (`use_cases/collector_series_mapping.py:232`), so `available_at - bucket_end` collapses to
# `received_at - source_time` — the network round trip, and nothing else. Our poll phase is
# ALGEBRAICALLY absent from the column: this number would be identical under a perfect scheduler
# and under one drifting an hour a day. That is absence of instrument, not absence of evidence.
# In klines `bucket_end` comes from the VENUE's grid (`close_time_ms`), which is why the phase
# does appear there.
#
# `lag_min_ms = -100` ms (`424` of `34.752` rows, `1,22%`) therefore has one possible cause, and
# it is not the poll schedule: `bucket_end` is Binance's clock when it answered, `available_at` is
# ours when we received, and reception is always LATER than the stamp. A negative value can only
# be SKEW between the two clocks. Negative is recorded, not clamped — clamping would hide a real
# clock fact behind a zero.

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

# Reused, never respelled: the statistic this table reports is the SAME decision
# `availability_lag_stats` already carries for the live lag table, and `SPEC-001` §5.2 writes
# `p99_lag(endpoint, observer_region)` into the MODELED formula under that very name.
from src.modules.sentimento.domain.availability_lag_stats import LAG_STAT_NAME

PUBLICATION_LAG_STAT_NAME: Final[str] = LAG_STAT_NAME

# A nearest-rank `p99` is the `ceil(0.99 * n)`-th smallest reading: at `n = 1.000` it is already
# only the 10th largest, and below that the tail a MODELED stamp rests on is a handful of
# readings. `[INFERRED: SPEC-001 §5.2 requires the lag to be MEASURED but fixes no minimum n;
# this floor is where "measured" stops being distinguishable from "sampled twice"]`. Both
# endpoints below clear it by 4x and 34x.
MIN_PUBLICATION_LAG_SAMPLES: Final[int] = 1_000

# The drift answer (Q2) is computed by splitting the per-hour series in half, so a window of
# fewer than 12 whole hours cannot produce two halves of >= 6 points each. `[INFERRED: same
# shape as clock_skew_tolerance.MIN_CALIBRATION_SPAN_DAYS — a refusal beats a number measured
# over a span too short to show a trend]`.
MIN_PUBLICATION_LAG_WINDOW_HOURS: Final[int] = 12

_MS_PER_HOUR: Final[int] = 60 * 60 * 1000


class UnmeasuredPublicationLagError(Exception):
    """An endpoint with no measured lag — refused, never defaulted to a neighbour's value.

    `SPEC-001` §5.2 is literal about what happens to an endpoint without a measured `lag_ms`:
    it writes `available_at = NULL`, `availability_source = MODELED`, and the series is born in
    quarantine. A `.get(endpoint, <some other endpoint's lag>)` here would replace that
    quarantine with a silent guess, which is exactly the `361x` optimistic default `SPEC-001`
    §5.2 forbids by name. A caller that catches this exception writes `NULL`; it does not pick
    a number.
    """


@dataclass(frozen=True)
class MeasuredPublicationLag:
    """One endpoint's publication lag, with the accounting that makes the number auditable.

    Every field except `endpoint` is an OUTPUT of the measurement quoted in this module's
    docstring — `sample_n`, the window and `poll_resolution_ms` travel with `lag_p99_ms`
    because a bare scalar cannot be checked by anyone downstream, and `E1` requires every
    backtest report to declare the lag model its numbers are conditional on.
    """

    endpoint: str
    lag_p99_ms: int
    lag_min_ms: int
    lag_max_ms: int
    sample_n: int
    poll_resolution_ms: int
    window_start_ms: int
    window_end_ms: int
    symbols: tuple[str, ...]
    measured_on: str

    def __post_init__(self) -> None:
        """Refuse a record whose own fields contradict the measurement it claims to report."""
        if not self.lag_min_ms <= self.lag_p99_ms <= self.lag_max_ms:
            raise ValueError(
                f"{self.endpoint}: lag_p99_ms={self.lag_p99_ms} falls outside "
                f"[{self.lag_min_ms}, {self.lag_max_ms}] — a percentile of a sample cannot lie "
                f"outside that sample's own range"
            )
        if self.sample_n < MIN_PUBLICATION_LAG_SAMPLES:
            raise ValueError(
                f"{self.endpoint}: sample_n={self.sample_n} is under "
                f"MIN_PUBLICATION_LAG_SAMPLES={MIN_PUBLICATION_LAG_SAMPLES} — a p99 read off a "
                f"tail that thin is not a measured lag"
            )
        if self.window_end_ms <= self.window_start_ms:
            raise ValueError(
                f"{self.endpoint}: window [{self.window_start_ms}, {self.window_end_ms}] does "
                f"not move forward in time"
            )
        if self.window_hours < MIN_PUBLICATION_LAG_WINDOW_HOURS:
            raise ValueError(
                f"{self.endpoint}: window_hours={self.window_hours:.2f} is under "
                f"MIN_PUBLICATION_LAG_WINDOW_HOURS={MIN_PUBLICATION_LAG_WINDOW_HOURS} — too "
                f"short to tell a stable lag from one measured mid-drift"
            )
        if self.poll_resolution_ms <= 0:
            raise ValueError(
                f"{self.endpoint}: poll_resolution_ms={self.poll_resolution_ms} — the observer's "
                f"own sampling period is part of this lag and cannot be zero or negative"
            )
        if not self.symbols:
            raise ValueError(
                f"{self.endpoint}: symbols is empty — a lag with no symbol behind it names no "
                f"universe, and Q3 (per endpoint vs per symbol) stops being answerable"
            )

    @property
    def window_hours(self) -> float:
        """Return how many hours of `bucket_end` the measurement window spans."""
        return (self.window_end_ms - self.window_start_ms) / _MS_PER_HOUR

    @property
    def poll_phase_share(self) -> float:
        """Return the fraction of `lag_p99_ms` that is OUR poll phase, not the endpoint's delay.

        `(lag_p99_ms - lag_min_ms) / poll_resolution_ms`. Near `1.0` the reading is dominated by
        how often we look (klines: `0,967`); near `0.0` it is the endpoint's own publication
        delay that got measured (`premiumIndex`: `0,031`). DISPLAYED, never used to "correct"
        `lag_p99_ms` downward — subtracting our own phase would make the MODELED stamp earlier
        than our live path ever knew, which is the lookahead `D16` exists to avoid.
        """
        return (self.lag_p99_ms - self.lag_min_ms) / self.poll_resolution_ms


# Keyed by `md.series.source` — the same string the ingest path already writes and the same one
# every measurement above groups by, so a consumer joins on a column it already holds.
ENDPOINT_PUBLICATION_LAG: Final[dict[str, MeasuredPublicationLag]] = {
    "/fapi/v1/klines": MeasuredPublicationLag(
        endpoint="/fapi/v1/klines",
        lag_p99_ms=59_361,
        lag_min_ms=1_353,
        lag_max_ms=59_999,
        sample_n=4_079,
        poll_resolution_ms=60_000,
        window_start_ms=1_789_090_860_000,
        window_end_ms=1_789_155_300_000,
        symbols=("BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT"),
        measured_on="2026-09-11",
    ),
    "/fapi/v1/premiumIndex": MeasuredPublicationLag(
        endpoint="/fapi/v1/premiumIndex",
        lag_p99_ms=1_758,
        lag_min_ms=-100,
        lag_max_ms=1_895,
        sample_n=34_752,
        poll_resolution_ms=60_000,
        window_start_ms=1_788_892_807_000,
        window_end_ms=1_789_155_303_000,
        symbols=("BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT"),
        measured_on="2026-09-11",
    ),
}


def publication_lag_for_endpoint(endpoint: str) -> MeasuredPublicationLag:
    """Return the measured publication lag of `endpoint`, or refuse.

    Raises `UnmeasuredPublicationLagError` for any endpoint absent from
    `ENDPOINT_PUBLICATION_LAG` — see that exception's docstring for why the alternative (a
    default) is the failure mode `SPEC-001` §5.2 forbids by name.
    """
    try:
        return ENDPOINT_PUBLICATION_LAG[endpoint]
    except KeyError as exc:
        raise UnmeasuredPublicationLagError(
            f"endpoint {endpoint!r} has no measured publication lag: `D16` requires the lag to "
            f"be measured per endpoint before any row is stamped MODELED, and this endpoint has "
            f"never been measured — write available_at=NULL and let the series be quarantined"
        ) from exc
