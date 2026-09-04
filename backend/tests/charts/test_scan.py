"""`evaluate_scan` — `ADR-020` §"Contexto", `D8.1`'s regression + `ADR-022`'s anti-overfit fix."""

from __future__ import annotations

import dataclasses
import inspect

import pytest

from src.modules.charts.domain import scan as scan_module
from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.histogram import UniverseInfo, compute_histogram, percentile
from src.modules.charts.domain.histogram_recipe import DEFAULT_HISTOGRAM_RECIPE, Interpolation
from src.modules.charts.domain.observation import Fired, Insufficient, NotFired, Observation
from src.modules.charts.domain.scan import (
    EmptyScanInputError,
    MinObsNotMetError,
    ScanResult,
    ZDispersionTelemetry,
    _fires,
    _reportable_value,
    _resolve_min_obs,
    _robust_z,
    evaluate_scan,
)
from src.modules.charts.domain.threshold_spec import AbsoluteSpec, PercentileSpec, RobustZSpec
from src.modules.sentimento.domain.series_key import Nature
from tests.helpers.charts_fixtures import synthetic_btc_like_population

BTC_FIELD = FieldIdentity(metric="sum_taker_long_short_vol_ratio", unit="pct", denom="none")


def _atomic(values: list[float]) -> list[Observation]:
    """Wrap raw floats as atomic `Observation`s (`n_obs=1` each, distinct `instrument_id`).

    The conversion this ADR's tests need for specs where `n_obs` plays no role (`Absolute`
    never filters by it) or where every point is meant to carry full support.
    """
    return [Observation(instrument_id=f"SYM{i}", value=v, n_obs=1) for i, v in enumerate(values)]


def _fully_observed(values: list[float], n_obs: int) -> list[Observation]:
    """Wrap raw floats as `Observation`s, all carrying the SAME `n_obs`, above any `min_obs`."""
    return [
        Observation(instrument_id=f"SYM{i}", value=v, n_obs=n_obs) for i, v in enumerate(values)
    ]


@pytest.mark.parametrize(
    ("op", "expected_fired"),
    [(">", 5), (">=", 6), ("<", 4), ("<=", 5)],
)
def test_absolute_spec_counts_observations_that_satisfy_the_operator(
    op: str, expected_fired: int
) -> None:
    """`values=1..10`, `Absolute{pct=5}` -> each of the 4 closed operators is exercised."""
    result = evaluate_scan(
        _atomic([float(v) for v in range(1, 11)]),
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_10",
        n_universe_resolved=10,
        spec=AbsoluteSpec(pct=5.0, op=op),  # type: ignore[arg-type]
    )
    assert result.n_total == 10
    assert result.n_fired == expected_fired
    assert result.fired_share == pytest.approx(expected_fired / 10)
    assert result.n_excluded_min_obs == 0  # `Absolute` is exempt from `min_obs` — `ADR-022/D2`
    assert result.z_dispersion is None


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
    """Every observation individually under `min_obs` refuses (`SPEC-001:304`).

    `ADR-022/D2`'s degenerate case: `|X| == 0` after the per-observation filter — 3 atomic
    (`n_obs=1`) readings, none of which meets `min_obs=10`, so NOTHING survives to resolve a
    percentile from. Never resolves a percentile from too few points.
    """
    with pytest.raises(MinObsNotMetError):
        evaluate_scan(
            _atomic([1.0, 2.0, 3.0]),
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
        _fully_observed([float(v) for v in range(1, 11)], n_obs=10),
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
    assert result.n_excluded_min_obs == 0


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
            n_excluded_min_obs=0,
            per_observation=(),
            z_dispersion=None,
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


def test_reportable_value_refuses_an_unknown_spec_variant() -> None:
    """Same exhaustiveness guard, in `_reportable_value` (`ADR-022/D3`)."""
    with pytest.raises(AssertionError, match="unreachable"):
        _reportable_value(1.0, [1.0, 2.0], "not a ThresholdSpec")  # type: ignore[arg-type]


def test_z_dispersion_telemetry_refuses_when_dispersion_and_reason_agree() -> None:
    """`ZDispersionTelemetry` refuses a state where `dispersion`/`reason_null` do not disagree.

    Both set, and both `None`, are equally invalid — exactly one of the two must describe the
    telemetry (`ADR-022/D4`).
    """
    with pytest.raises(ValueError, match="disagree"):
        ZDispersionTelemetry(n_symbols=2, dispersion=1.0, reason_null="n_symbols < 4")
    with pytest.raises(ValueError, match="disagree"):
        ZDispersionTelemetry(n_symbols=5, dispersion=None, reason_null=None)


def test_robust_z_degenerate_population_returns_zero_at_the_median() -> None:
    """Every population value identical: `MAD = 0`.

    A value AT that constant scores `0.0` rather than raising a `ZeroDivisionError`.
    """
    result = evaluate_scan(
        _fully_observed([5.0, 5.0, 5.0, 5.0], n_obs=4),
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
        _fully_observed([5.0, 5.0, 5.0, 5.0, 9.0], n_obs=5),
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
        _fully_observed([*body, outlier], n_obs=11),
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
        _atomic(list(values)),
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


# ── `ADR-022` — `min_obs` por observação, `n_obs` por ponto, dispersão do `z` ───────────────


def test_adr_021_falsifier_mixed_n_obs_excludes_the_underobserved_symbol_not_the_aggregate() -> (
    None
):
    """`ADR-022`'s mandatory regression, literal.

    A population of 2: `BTCUSDT` with `n_obs=2016` (full window), `ALTUSDT` with `n_obs=300`
    (`< min_obs=576` — `rolling(2016, min_periods=576)` never filled the window in the alts).
    The aggregate-only check `T-08.6` shipped would have let both through (`n_total=2 >= 0`,
    unconditionally); `ADR-022/D2`'s per-observation filter excludes `ALTUSDT` BEFORE `_fires`
    ever runs, and `ScanResult` declares the exclusion instead of hiding it in a shrunk
    `n_total`.
    """
    result = evaluate_scan(
        [
            Observation(instrument_id="BTCUSDT", value=1.2, n_obs=2016),
            Observation(instrument_id="ALTUSDT", value=0.9, n_obs=300),
        ],
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_2",
        n_universe_resolved=2,
        spec=RobustZSpec(k=3.0, window=2016, min_obs=576, op=">"),
    )

    assert result.n_total == 1
    assert result.n_excluded_min_obs == 1
    assert Insufficient(instrument_id="ALTUSDT", n_obs=300, min_obs_required=576) in (
        result.per_observation
    )
    # Never a Fired/NotFired verdict for the excluded symbol.
    alt_verdicts = [v for v in result.per_observation if v.instrument_id == "ALTUSDT"]
    assert len(alt_verdicts) == 1
    assert isinstance(alt_verdicts[0], Insufficient)
    assert not any(
        isinstance(v, Fired | NotFired) and v.instrument_id == "ALTUSDT"
        for v in result.per_observation
    )


def test_adr_021_no_exclusion_when_every_observation_meets_min_obs() -> None:
    """The NON-falsifier baseline the ADR names as "esperado e correto".

    Half the population at `n_obs=2016`, half at `n_obs=600` — both `>= min_obs=576` — so
    `n_excluded_min_obs == 0`: nothing is dropped just because the aggregate happens to mix two
    different `n_obs` values, only because an individual one is BELOW `min_obs`.
    """
    observations = [
        Observation(instrument_id="A", value=1.0, n_obs=2016),
        Observation(instrument_id="B", value=2.0, n_obs=2016),
        Observation(instrument_id="C", value=3.0, n_obs=600),
        Observation(instrument_id="D", value=4.0, n_obs=600),
    ]
    result = evaluate_scan(
        observations,
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_4",
        n_universe_resolved=4,
        spec=RobustZSpec(k=3.0, window=2016, min_obs=576, op=">"),
    )
    assert result.n_excluded_min_obs == 0
    assert result.n_total == 4


def test_insufficient_verdict_carries_no_value_field() -> None:
    """`ADR-022/D3`'s rejected alternative: `Insufficient` never carries a computed value.

    A `low_confidence` flag on a present value was considered and refused — this asserts the
    type itself has no field a careless consumer could read as a real number.
    """
    field_names = {f.name for f in dataclasses.fields(Insufficient)}
    assert field_names == {"instrument_id", "n_obs", "min_obs_required"}


# ── `ADR-022/D4` — dispersão do `z` é telemetria, nunca segundo filtro ──────────────────────


def test_z_dispersion_is_none_for_absolute_and_percentile_specs() -> None:
    """Only `RobustZ` computes a `z` to disperse — `Absolute`/`Percentile` get `None`."""
    absolute_result = evaluate_scan(
        _atomic([float(v) for v in range(1, 11)]),
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_10",
        n_universe_resolved=10,
        spec=AbsoluteSpec(pct=5.0, op=">"),
    )
    percentile_result = evaluate_scan(
        _fully_observed([float(v) for v in range(1, 11)], n_obs=10),
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
    assert absolute_result.z_dispersion is None
    assert percentile_result.z_dispersion is None


def test_z_dispersion_is_null_with_reason_below_four_symbols() -> None:
    """`D8.5`, literal: dispersion needs `>= 4` symbols — below that, `null` + motivo."""
    result = evaluate_scan(
        _fully_observed([1.0, 2.0, 3.0], n_obs=10),
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_3",
        n_universe_resolved=3,
        spec=RobustZSpec(k=3.0, window=10, min_obs=2, op=">"),
    )
    assert result.z_dispersion is not None
    assert result.z_dispersion.n_symbols == 3
    assert result.z_dispersion.dispersion is None
    assert result.z_dispersion.reason_null == "n_symbols < 4"


def test_z_dispersion_is_the_iqr_of_surviving_z_scores() -> None:
    """`>= 4` symbols: `dispersion` is the IQR (`q75 - q25`) of the survivors' `z`.

    Computed the same way `percentile()` already computes every other quantile in this package.
    """
    values = [1.0, 2.0, 3.0, 4.0, 100.0]
    result = evaluate_scan(
        _fully_observed(values, n_obs=10),
        field=BTC_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_5",
        n_universe_resolved=5,
        spec=RobustZSpec(k=1000.0, window=10, min_obs=2, op=">"),  # k huge: nothing fires
    )
    assert result.z_dispersion is not None
    assert result.z_dispersion.n_symbols == 5
    assert result.z_dispersion.reason_null is None
    z_scores = sorted(_robust_z(v, values) for v in values)
    expected_iqr = percentile(z_scores, 75.0, Interpolation.LINEAR) - percentile(
        z_scores, 25.0, Interpolation.LINEAR
    )
    assert result.z_dispersion.dispersion == pytest.approx(expected_iqr)


def test_no_decision_function_accepts_z_dispersion_as_input() -> None:
    """`ADR-022/D4`'s falsifier: telemetry never feeds back into a firing decision.

    Nenhuma função de decisão pode aceitar `z_dispersion` como entrada, por assinatura — não
    por promessa em prosa.
    """
    for name in ("_fires", "_robust_z", "_compare", "evaluate_scan"):
        parameters = inspect.signature(getattr(scan_module, name)).parameters
        assert "z_dispersion" not in parameters, f"{name} must never accept z_dispersion as input"
