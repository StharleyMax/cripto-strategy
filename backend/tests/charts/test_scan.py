"""`evaluate_scan` — `ADR-020` §"Contexto", `D8.1`'s regression."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.histogram import UniverseInfo, compute_histogram
from src.modules.charts.domain.histogram_recipe import DEFAULT_HISTOGRAM_RECIPE, Interpolation
from src.modules.charts.domain.scan import (
    EmptyScanInputError,
    MinObsNotMetError,
    ScanResult,
    _fires,
    _resolve_min_obs,
    evaluate_scan,
)
from src.modules.charts.domain.threshold_spec import AbsoluteSpec, PercentileSpec, RobustZSpec
from src.modules.sentimento.domain.series_key import Nature
from tests.helpers.charts_fixtures import synthetic_btc_like_population

BTC_FIELD = FieldIdentity(metric="sum_taker_long_short_vol_ratio", unit="pct", denom="none")


@pytest.mark.parametrize(
    ("op", "expected_fired"),
    [(">", 5), (">=", 6), ("<", 4), ("<=", 5)],
)
def test_absolute_spec_counts_observations_that_satisfy_the_operator(
    op: str, expected_fired: int
) -> None:
    """`values=1..10`, `Absolute{pct=5}` -> each of the 4 closed operators is exercised."""
    result = evaluate_scan(
        [float(v) for v in range(1, 11)],
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_10",
        n_universe_resolved=10,
        spec=AbsoluteSpec(pct=5.0, op=op),  # type: ignore[arg-type]
    )
    assert result.n_total == 10
    assert result.n_fired == expected_fired
    assert result.fired_share == pytest.approx(expected_fired / 10)


def test_empty_population_refuses() -> None:
    """Zero eligible observations refuses — same posture as `compute_histogram`."""
    with pytest.raises(EmptyScanInputError):
        evaluate_scan(
            [],
            field=BTC_FIELD,
            nature=Nature.RATIO,
            universe_declared="top_10",
            n_universe_resolved=10,
            spec=AbsoluteSpec(pct=5.0, op=">"),
        )


def test_percentile_spec_below_min_obs_refuses() -> None:
    """A population smaller than `min_obs` refuses (`SPEC-001:304`).

    Never resolves a percentile from too few points.
    """
    with pytest.raises(MinObsNotMetError):
        evaluate_scan(
            [1.0, 2.0, 3.0],
            field=BTC_FIELD,
            nature=Nature.RATIO,
            universe_declared="top_3",
            n_universe_resolved=3,
            spec=PercentileSpec(
                q=90.0,
                window=10,
                scope="CrossSection",
                min_obs=10,
                interpolation=Interpolation.LINEAR,
                op=">",
            ),
        )


def test_percentile_spec_resolves_a_threshold_from_the_population() -> None:
    """A population meeting `min_obs` resolves `q` as an actual cross-sectional threshold."""
    result = evaluate_scan(
        [float(v) for v in range(1, 11)],
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_10",
        n_universe_resolved=10,
        spec=PercentileSpec(
            q=80.0,
            window=10,
            scope="CrossSection",
            min_obs=5,
            interpolation=Interpolation.LINEAR,
            op=">",
        ),
    )
    # rank = 0.8*9 = 7.2 -> between index 7 (8.0) and 8 (9.0), linear -> 8.8; {9, 10} fire.
    assert result.n_fired == 2


def test_scan_result_refuses_more_fired_than_total() -> None:
    """Constructing `ScanResult` directly with `n_fired > n_total` refuses.

    The same defensive invariant `HistogramResult` carries, exercised here since
    `evaluate_scan` itself can never produce such a result by construction.
    """
    with pytest.raises(ValueError, match="n_fired"):
        ScanResult(
            field=BTC_FIELD,
            nature=Nature.RATIO,
            spec=AbsoluteSpec(pct=5.0, op=">"),
            n_total=5,
            n_fired=6,
            universe=UniverseInfo(declared="top_5", n_resolved=5),
        )


def test_resolve_min_obs_refuses_an_unknown_spec_variant() -> None:
    """The exhaustiveness guard in `_resolve_min_obs` fires on an unknown variant.

    Proof the guard is reachable, not merely written.
    """
    with pytest.raises(AssertionError, match="unreachable"):
        _resolve_min_obs("not a ThresholdSpec")  # type: ignore[arg-type]


def test_fires_refuses_an_unknown_spec_variant() -> None:
    """Same exhaustiveness guard, in `_fires`."""
    with pytest.raises(AssertionError, match="unreachable"):
        _fires(1.0, [1.0, 2.0], "not a ThresholdSpec")  # type: ignore[arg-type]


def test_robust_z_degenerate_population_returns_zero_at_the_median() -> None:
    """Every population value identical: `MAD = 0`.

    A value AT that constant scores `0.0` rather than raising a `ZeroDivisionError`.
    """
    result = evaluate_scan(
        [5.0, 5.0, 5.0, 5.0],
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="degenerate",
        n_universe_resolved=4,
        spec=RobustZSpec(k=3.0, window=4, min_obs=2, op=">="),
    )
    # z=0.0 for every point; `>= 3.0` never fires.
    assert result.n_fired == 0


def test_robust_z_degenerate_population_with_one_outlier_is_infinite() -> None:
    """Every value equal except one: the outlier's `MAD`-normalized score is `+inf`.

    Which fires against ANY finite `k`.
    """
    result = evaluate_scan(
        [5.0, 5.0, 5.0, 5.0, 9.0],
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="near_degenerate",
        n_universe_resolved=5,
        spec=RobustZSpec(k=3.0, window=5, min_obs=2, op=">"),
    )
    assert result.n_fired == 1


def test_robust_z_spec_fires_on_the_outlier_and_not_the_body() -> None:
    """A tight cluster around `0` plus one clear outlier: `RobustZ{k=3}` fires ONLY on it."""
    body = [0.0, 0.1, -0.1, 0.05, -0.05, 0.02, -0.02, 0.0, 0.03, -0.03]
    outlier = 50.0
    result = evaluate_scan(
        [*body, outlier],
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="synthetic_cluster",
        n_universe_resolved=11,
        spec=RobustZSpec(k=3.0, window=11, min_obs=5, op=">"),
    )
    assert result.n_fired == 1
    assert result.n_total == 11


# ── `ADR-020`/`D8.1`'s own falsifier: `scan` and `distribution` agree ──────────────────────


def test_d8_1_falsifier_absolute_5_over_btc_finds_zero_rows_matching_distribution_max() -> None:
    """`D8.1`, literal: "`scan` com `Absolute{5.0}` sobre BTC/30d -> 0 linhas".

    And `distribution` mostra `max = 2,4017`. Over a SYNTHETIC BTC-like population whose
    maximum is planted at exactly `2,4017` (`tests/helpers/charts_fixtures.py` — the raw
    dataset is not versioned), `scan` with
    `Absolute{pct=5.0, op=">"}` finds ZERO rows (`2,4017 < 5.0`), and `compute_histogram` over
    the SAME population reports that same `2,4017` as its right overflow's `extreme` — the two
    read paths have to agree, because they read the same population.
    """
    values = synthetic_btc_like_population(maximum=2.4017)

    scan_result = evaluate_scan(
        values,
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="BTCUSDT",
        n_universe_resolved=1,
        spec=AbsoluteSpec(pct=5.0, op=">"),
    )
    assert scan_result.n_fired == 0

    histogram_result = compute_histogram(
        values,
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="BTCUSDT",
        n_universe_resolved=1,
        recipe=DEFAULT_HISTOGRAM_RECIPE,
    )
    assert max(values) == 2.4017
    assert histogram_result.overflow_right.extreme == 2.4017
    assert histogram_result.overflow_right.extreme < 5.0  # consistent with scan finding 0 rows
