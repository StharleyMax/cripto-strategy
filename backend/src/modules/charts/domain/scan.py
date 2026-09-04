"""`evaluate_scan` — the cross-sectional threshold check `S4`'s `scan` job runs.

`ADR-020`'s own mandate, cited verbatim in the despacho that opened this ADR: "entregue a
distribuição; o limiar é parâmetro. Limiar absoluto é um filtro 'não-BTC' disfarçado de sinal."
`scan` answers "que taxa de disparo um limiar produziria" — for an already-chosen
`ThresholdSpec` (`threshold_spec.py`, reused field-for-field from `T-08.5`), over the SAME
cross-sectional population `histogram.compute_histogram` reads (`ADR-020/D7`: `run_scan.py`
"reusa `ThresholdSpec` — não reimplementa union type").

This module does not decide WHICH threshold to use — that stays the operator's `ThresholdSpec`,
untouched. It answers, for a GIVEN spec, how many of the eligible observations satisfy it.

`D8.1`'s own regression: `scan` with `Absolute{5.0}` over BTC/30d finds `0` rows, and
`distribution` over the same population reports `max = 2,4017` — the two have to agree, because
`2,4017 < 5.0` under every one of the four operators this module supports. `test_scan.py` pins
that exact cross-check.

`ADR-022` extends this module: `min_obs` is a property of the OBSERVATION, not the aggregate
(`D2`). `Sequence[float]` could not express `n_obs`/`instrument_id` per point, which is exactly
why a mixed population (BTC full-window, alts near-empty) never denounced itself under the
aggregate-only check `T-08.6` shipped — the defect only appears per symbol, per point. `_fires`,
`_compare`, `_median`, `_robust_z` and `_resolve_min_obs` are UNCHANGED by `ADR-022`: they still
operate on raw `float` populations, now fed the `.value` of the observations that survive the
per-point `min_obs` filter.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.histogram import UniverseInfo, percentile
from src.modules.charts.domain.histogram_recipe import Interpolation
from src.modules.charts.domain.observation import (
    Fired,
    Insufficient,
    NotFired,
    Observation,
    ObservationVerdict,
)
from src.modules.charts.domain.threshold_spec import (
    AbsoluteSpec,
    PercentileSpec,
    RobustZSpec,
    ThresholdSpec,
)
from src.modules.sentimento.domain.series_key import Nature

#: `ADR-022/D8.5`, literal: dispersion needs at least this many surviving symbols to be an
#: informative statistic rather than an IQR computed over 2 or 3 points fingindo ser dispersão.
MIN_SYMBOLS_FOR_Z_DISPERSION = 4


class EmptyScanInputError(Exception):
    """A scan of zero observations does not exist — same posture as `EmptyHistogramInputError`."""


class MinObsNotMetError(Exception):
    """`SPEC-001:304`: `min_obs` unmet returns ABSENCE, never a percentile over too few points.

    `ADR-022/D2` moves the check from the AGGREGATE input to the POST-FILTER remainder: every
    observation whose own `n_obs < min_obs` is pulled out first (as an `Insufficient` verdict,
    never fed to `_fires`), and this error fires only when NOTHING survives that filter — a
    population that had entries, but none of them individually carried enough real observations
    to trust a percentile or robust z-score resolved from it. A population where at least one
    observation survives is reported as a normal `ScanResult` with `n_excluded_min_obs` and
    `per_observation` naming exactly what was dropped and why (`ADR-022`'s own falsifier: 1 of 2
    observations surviving `min_obs=576` still produces a `ScanResult`, not a refusal).
    """


@dataclass(frozen=True)
class ZDispersionTelemetry:
    """Dispersion of the robust z-score across surviving symbols — `ADR-022/D4`, telemetry only.

    Never read by `_fires`/`_robust_z`/`_compare`: no function in this module accepts it as
    input, by signature, not by promise in prose (`ADR-022/D4`'s own falsifier). `IQR` — not
    standard deviation — for the same robustness reason `ADR-020` already chose a percentile
    over a mean-based statistic: one symbol with an absurd `z` cannot dominate the number that
    says "the others are dispersed". Below `MIN_SYMBOLS_FOR_Z_DISPERSION` symbols, `dispersion`
    is `None` with the reason written (`D8.5`), never a number computed over 2 or 3 points.
    """

    n_symbols: int
    dispersion: float | None
    reason_null: str | None

    def __post_init__(self) -> None:
        """Refuse a telemetry where `dispersion`/`reason_null` do not disagree about which holds."""
        if (self.dispersion is None) == (self.reason_null is None):
            raise ValueError(
                f"dispersion={self.dispersion!r} and reason_null={self.reason_null!r} must "
                f"disagree about which is set: exactly one of the two describes this telemetry"
            )


@dataclass(frozen=True)
class ScanResult:
    """How many of `n_total` eligible observations satisfy `spec`, for one `(field, nature)`.

    `ADR-022/D2`/`D8.8`: `n_total` is now the population that SURVIVED the per-observation
    `min_obs` filter, not the raw input size; `n_excluded_min_obs` names how many were dropped,
    a declared number rather than a silent shrink (same discipline `UniverseInfo` already
    applies one layer up). `per_observation` is the discriminated verdict per input observation
    (`ADR-022/D3`); `z_dispersion` is `None` for `Absolute`/`Percentile` — only `RobustZ`
    computes a `z` to disperse (`ADR-022/D4`).
    """

    field: FieldIdentity
    nature: Nature
    spec: ThresholdSpec
    n_total: int
    n_fired: int
    universe: UniverseInfo
    n_excluded_min_obs: int
    per_observation: tuple[ObservationVerdict, ...]
    z_dispersion: ZDispersionTelemetry | None

    def __post_init__(self) -> None:
        """Refuse a result where more observations fired than exist."""
        if self.n_fired > self.n_total:
            raise ValueError(
                f"n_fired={self.n_fired} cannot exceed n_total={self.n_total}: a firing count "
                f"is a subset of the population it was measured over"
            )

    @property
    def fired_share(self) -> float:
        """The firing rate of this ONE cross-section — `n_fired / n_total`."""
        return self.n_fired / self.n_total


def _compare(value: float, op: str, threshold: float) -> bool:
    """Apply one of the four closed `Operator` symbols — `threshold_spec.OPERATORS`."""
    if op == ">":
        return value > threshold
    if op == ">=":
        return value >= threshold
    if op == "<":
        return value < threshold
    # op == "<=" — the fourth and last member of the closed set; `AbsoluteSpec.__post_init__`
    # (and its siblings) already refuse any other string before this function ever runs.
    return value <= threshold


def _median(values: Sequence[float]) -> float:
    """Return the 50th percentile, linear-interpolated — `numpy.median`'s own convention."""
    return percentile(values, 50.0, Interpolation.LINEAR)


def _robust_z(value: float, population: Sequence[float]) -> float:
    """Return the robust z-score of `value` against `population`.

    `(value - median) / (1.4826*MAD)`. `1.4826` is the constant that makes the median absolute
    deviation a consistent estimator of the standard deviation UNDER NORMALITY — the standard
    robust-statistics convention (Huber, Rousseeuw & Croux). A `MAD` of exactly zero (every
    population point equal, or `value` the only distinct one) has no scale to divide by: this
    function returns `0.0` when `value`
    itself sits at the median (no deviation to report) and `+inf`/`-inf` otherwise, rather than
    raising — a `ZeroDivisionError` here would be a spurious REFUSAL for a degenerate but
    perfectly legitimate population (e.g. a field that is entirely one point mass).
    """
    med = _median(population)
    mad = _median([abs(point - med) for point in population])
    if mad == 0.0:
        if value == med:
            return 0.0
        return float("inf") if value > med else float("-inf")
    return (value - med) / (1.4826 * mad)


def _resolve_min_obs(spec: ThresholdSpec) -> int | None:
    """Return the declared `min_obs` for a variant that has one, else `None` (`Absolute`)."""
    if isinstance(spec, AbsoluteSpec):
        return None
    if isinstance(spec, PercentileSpec | RobustZSpec):
        return spec.min_obs
    raise AssertionError(f"unreachable: unknown ThresholdSpec variant {spec!r}")


def _fires(value: float, population: Sequence[float], spec: ThresholdSpec) -> bool:
    """Whether ONE observation satisfies `spec`, given the population it is scanned against."""
    if isinstance(spec, AbsoluteSpec):
        return _compare(value, spec.op, spec.pct)
    if isinstance(spec, PercentileSpec):
        threshold = percentile(population, spec.q, spec.interpolation)
        return _compare(value, spec.op, threshold)
    if isinstance(spec, RobustZSpec):
        return _compare(_robust_z(value, population), spec.op, spec.k)
    raise AssertionError(f"unreachable: unknown ThresholdSpec variant {spec!r}")


def _reportable_value(value: float, population: Sequence[float], spec: ThresholdSpec) -> float:
    """Return the quantity a `Fired`/`NotFired` verdict reports (`ADR-022/D3`).

    `Absolute`/`Percentile` compare the raw `value` against a literal or percentile-resolved
    threshold, so the raw value is what a table row shows; `RobustZ` compares the z-score
    itself, so THAT is what gets reported — the same statistic `_fires` used to decide, not
    recomputed differently.
    """
    if isinstance(spec, RobustZSpec):
        return _robust_z(value, population)
    if isinstance(spec, AbsoluteSpec | PercentileSpec):
        return value
    raise AssertionError(f"unreachable: unknown ThresholdSpec variant {spec!r}")


def _z_dispersion(z_values: Sequence[float]) -> ZDispersionTelemetry:
    """IQR of `z_values` across surviving symbols, `null` + motivo below `D8.5`'s floor.

    `ADR-022/D4`: this is a SIBLING field of `ScanResult`, computed from the SAME `R` that
    already produced `n_fired`/`per_observation` — it never feeds back into a decision.
    """
    n_symbols = len(z_values)
    if n_symbols < MIN_SYMBOLS_FOR_Z_DISPERSION:
        return ZDispersionTelemetry(
            n_symbols=n_symbols, dispersion=None, reason_null="n_symbols < 4"
        )
    q75 = percentile(z_values, 75.0, Interpolation.LINEAR)
    q25 = percentile(z_values, 25.0, Interpolation.LINEAR)
    return ZDispersionTelemetry(n_symbols=n_symbols, dispersion=q75 - q25, reason_null=None)


def evaluate_scan(
    observations: Sequence[Observation],
    *,
    field: FieldIdentity,
    nature: Nature,
    universe_declared: str,
    n_universe_resolved: int,
    spec: ThresholdSpec,
) -> ScanResult:
    """Count how many of `observations` satisfy `spec`.

    `observations` must already be `SPEC-001` §5.11-eligible — same contract as
    `histogram.compute_histogram`. `ADR-022/D2`: before anything else, every observation whose
    `n_obs < spec.min_obs` is pulled out as `Insufficient` (`Absolute` is exempt — a literal
    threshold has no population to subsample, `_resolve_min_obs` returns `None` for it). `_fires`
    only ever sees the SURVIVING remainder. `Percentile`/`RobustZ` both resolve a threshold FROM
    the population, so both are subject to this filter; a population where NOTHING survives it
    refuses (`MinObsNotMetError`) rather than computing anything from an empty remainder.
    """
    if len(observations) == 0:
        raise EmptyScanInputError(
            f"evaluate_scan received zero observations for field={field!r} nature={nature!r}: "
            f"refusing rather than reporting a fired_share for an empty population"
        )

    min_obs = _resolve_min_obs(spec)
    insufficient: list[Insufficient]
    if min_obs is None:
        survivors = list(observations)
        insufficient = []
    else:
        survivors = [obs for obs in observations if obs.n_obs >= min_obs]
        insufficient = [
            Insufficient(instrument_id=obs.instrument_id, n_obs=obs.n_obs, min_obs_required=min_obs)
            for obs in observations
            if obs.n_obs < min_obs
        ]

    if not survivors:
        raise MinObsNotMetError(
            f"all {len(insufficient)} observation(s) had n_obs below min_obs={min_obs} declared "
            f"by {spec!r}: SPEC-001:304 requires ABSENCE here, never a threshold resolved from "
            f"an empty post-filter population (ADR-022/D2)"
        )

    population = [obs.value for obs in survivors]
    verdicts: list[ObservationVerdict] = list(insufficient)
    z_values: list[float] = []
    n_fired = 0
    for obs in survivors:
        fired = _fires(obs.value, population, spec)
        reportable = _reportable_value(obs.value, population, spec)
        if isinstance(spec, RobustZSpec):
            z_values.append(reportable)
        if fired:
            n_fired += 1
            verdicts.append(
                Fired(
                    instrument_id=obs.instrument_id,
                    z_or_percentile_value=reportable,
                    n_obs=obs.n_obs,
                )
            )
        else:
            verdicts.append(
                NotFired(
                    instrument_id=obs.instrument_id,
                    z_or_percentile_value=reportable,
                    n_obs=obs.n_obs,
                )
            )

    return ScanResult(
        field=field,
        nature=nature,
        spec=spec,
        n_total=len(survivors),
        n_fired=n_fired,
        universe=UniverseInfo(declared=universe_declared, n_resolved=n_universe_resolved),
        n_excluded_min_obs=len(insufficient),
        per_observation=tuple(verdicts),
        z_dispersion=_z_dispersion(z_values) if isinstance(spec, RobustZSpec) else None,
    )
