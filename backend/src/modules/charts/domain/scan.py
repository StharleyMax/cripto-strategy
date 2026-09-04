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
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.histogram import UniverseInfo, percentile
from src.modules.charts.domain.histogram_recipe import Interpolation
from src.modules.charts.domain.threshold_spec import (
    AbsoluteSpec,
    PercentileSpec,
    RobustZSpec,
    ThresholdSpec,
)
from src.modules.sentimento.domain.series_key import Nature


class EmptyScanInputError(Exception):
    """A scan of zero observations does not exist — same posture as `EmptyHistogramInputError`."""


class MinObsNotMetError(Exception):
    """`SPEC-001:304`: `min_obs` unmet returns ABSENCE, never a percentile over too few points.

    `threshold-spec-bundle.ts`'s own comment names the failure this refuses: "rolling(2016,
    min_periods=576) nunca preencheu a janela nos alts e a conclusão publicada caiu" — a
    percentile or robust z-score computed over fewer than `min_obs` points is a number that
    LOOKS calibrated and is not. `PercentileSpec`/`RobustZSpec` already refuse `min_obs >
    window` at construction (`threshold_spec.py`); this is the runtime half, checked against
    the ACTUAL population size `evaluate_scan` was handed.
    """


@dataclass(frozen=True)
class ScanResult:
    """How many of `n_total` eligible observations satisfy `spec`, for one `(field, nature)`."""

    field: FieldIdentity
    nature: Nature
    spec: ThresholdSpec
    n_total: int
    n_fired: int
    universe: UniverseInfo

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


def evaluate_scan(
    values: Sequence[float],
    *,
    field: FieldIdentity,
    nature: Nature,
    universe_declared: str,
    n_universe_resolved: int,
    spec: ThresholdSpec,
) -> ScanResult:
    """Count how many of `values` satisfy `spec`.

    `values` must already be `SPEC-001` §5.11-eligible — same contract as
    `histogram.compute_histogram`. `Absolute` never checks `min_obs` — the mandate this ADR
    opens with names it directly: "o limiar é parâmetro" for `Absolute` means a LITERAL
    number, and a literal has no population
    size to be under-observed against. `Percentile`/`RobustZ` both resolve a threshold FROM
    `values`, so both are refused under `min_obs` (`MinObsNotMetError`) rather than computed
    over too few points.
    """
    n_total = len(values)
    if n_total == 0:
        raise EmptyScanInputError(
            f"evaluate_scan received zero eligible observations for field={field!r} "
            f"nature={nature!r}: refusing rather than reporting a fired_share for an empty "
            f"population"
        )
    min_obs = _resolve_min_obs(spec)
    if min_obs is not None and n_total < min_obs:
        raise MinObsNotMetError(
            f"population has {n_total} eligible observation(s), below min_obs={min_obs} "
            f"declared by {spec!r}: SPEC-001:304 requires ABSENCE here, never a threshold "
            f"resolved from too few points"
        )
    n_fired = sum(1 for value in values if _fires(value, values, spec))
    return ScanResult(
        field=field,
        nature=nature,
        spec=spec,
        n_total=n_total,
        n_fired=n_fired,
        universe=UniverseInfo(declared=universe_declared, n_resolved=n_universe_resolved),
    )
