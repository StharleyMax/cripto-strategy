"""`compute_walk_forward_firing_rate` — `ADR-023`'s use case, wired against a fake port.

Three falsifiers `ADR-023` names directly, each pinned by its own test below:

- `D-WF2` (anti-lookahead): `knowledge_time_ms` is PINNED PER FOLD, never one value for the
  whole call — `test_each_fold_reads_calib_and_eval_as_of_its_own_fold_boundary`.
- `D-WF3` (anti-tautology): the calibrated threshold is FROZEN before it ever touches the eval
  population — `test_the_eval_side_is_scored_against_the_frozen_calib_threshold_not_recalibrated`.
- `D-WF4` (exclusion): a fold below `min_obs_calib`/`min_obs_eval` is dropped, counted, never
  filled in — `test_a_fold_below_min_obs_calib_is_excluded_and_never_reads_its_eval_side`, plus
  the "every fold excluded" refusal.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

import pytest

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.firing_rate import Window
from src.modules.charts.domain.histogram_recipe import Interpolation
from src.modules.charts.domain.observation import Observation
from src.modules.charts.domain.walk_forward import (
    InsufficientWindowForWalkForwardError,
    WalkForwardRecipe,
    WalkForwardThresholdRecipe,
)
from src.modules.charts.use_cases.compute_walk_forward_firing_rate import (
    compute_walk_forward_firing_rate,
)
from src.modules.sentimento.domain.series_key import Nature

FIELD = FieldIdentity(metric="sum_open_interest_value", unit="pct", denom="none")
UNIVERSE = "BTCUSDT"


@dataclass(frozen=True)
class FakeWalkForwardSource:
    """A time-aware double: `observed_values` answers by `(start_ms, end_ms)`, not a fixed list.

    Unlike `test_compute_distribution.py`'s `FakeObservationSource` (one fixed population for
    every call), a walk-forward fold needs DIFFERENT populations per window to be a meaningful
    test at all — this fake is keyed so each fold can be given its own calib/eval population.
    """

    values_by_window: dict[tuple[int, int], Sequence[Observation]]
    n_resolved: int = 500
    calls: list[tuple[str, int, int, int]] = field(default_factory=list)

    def observed_values(
        self,
        requested_field: FieldIdentity,
        nature: Nature,
        universe: str,
        window: Window,
        knowledge_time_ms: int,
    ) -> Sequence[Observation]:
        """Record the call and return whatever `values_by_window` maps this window to."""
        self.calls.append(("observed_values", window.start_ms, window.end_ms, knowledge_time_ms))
        return self.values_by_window.get((window.start_ms, window.end_ms), ())

    def resolved_universe_size(self, universe: str, window: Window, knowledge_time_ms: int) -> int:
        """Record the call and return the fixed `n_resolved` this fake was built with."""
        self.calls.append(
            ("resolved_universe_size", window.start_ms, window.end_ms, knowledge_time_ms)
        )
        return self.n_resolved


THRESHOLD_Q99 = WalkForwardThresholdRecipe(q=99.0, interpolation=Interpolation.LINEAR, op=">=")


def _observations(*values: float) -> tuple[Observation, ...]:
    """Build `Observation`s from bare floats — `instrument_id` distinct, `n_obs=1` (atomic).

    `ADR-022/D1`: the port returns `Sequence[Observation]`, not `Sequence[float]`; these tests
    only ever care about `.value`, so `instrument_id`/`n_obs` are filler that satisfies
    `Observation.__post_init__` without meaning anything beyond "a real reading".
    """
    return tuple(
        Observation(instrument_id=f"SYM{i}", value=value, n_obs=1) for i, value in enumerate(values)
    )


def test_each_fold_reads_calib_and_eval_as_of_its_own_fold_boundary() -> None:
    """`D-WF2`: `knowledge_time_ms` is per-fold — `calib.end_ms`/`eval.end_ms`, never one value.

    3 folds (`calib_length=2`, `eval_length=1`, `step=1`, `window=[0,5)`): each fold's calib and
    eval reads must carry a DIFFERENT `knowledge_time_ms`, and it must equal that SIDE's own
    `end_ms` — never a single "now" shared across the whole walk-forward call.
    """
    recipe = WalkForwardRecipe(
        spec_version=1,
        calib_length_ms=2,
        eval_length_ms=1,
        step_ms=1,
        min_obs_calib=1,
        min_obs_eval=1,
    )
    source = FakeWalkForwardSource(
        values_by_window={
            (0, 2): _observations(1.0, 2.0),
            (1, 3): _observations(1.0, 2.0),
            (2, 4): _observations(1.0, 2.0),
            (2, 3): _observations(0.5),
            (3, 4): _observations(0.5),
            (4, 5): _observations(0.5),
        }
    )

    compute_walk_forward_firing_rate(
        source,
        field=FIELD,
        nature=Nature.STOCK,
        universe=UNIVERSE,
        window=Window(start_ms=0, end_ms=5),
        threshold=THRESHOLD_Q99,
        recipe=recipe,
    )

    observed_calls = [call for call in source.calls if call[0] == "observed_values"]
    # calib side: knowledge_time == that fold's own calib.end_ms, one per fold, all different.
    assert ("observed_values", 0, 2, 2) in observed_calls
    assert ("observed_values", 1, 3, 3) in observed_calls
    assert ("observed_values", 2, 4, 4) in observed_calls
    # eval side: knowledge_time == that fold's own eval.end_ms, one per fold, all different.
    assert ("observed_values", 2, 3, 3) in observed_calls
    assert ("observed_values", 3, 4, 4) in observed_calls
    assert ("observed_values", 4, 5, 5) in observed_calls


def test_the_eval_side_is_scored_against_the_frozen_calib_threshold_not_recalibrated() -> None:
    """`D-WF3`: freezing calib into `AbsoluteSpec` before scoring eval — the anti-tautology guard.

    `calib_values = 1..100` -> `percentile(q=99, linear) == 99.01`. `eval_values = (50, 150,
    250)`. Scored against the FROZEN `99.01`: `fired_share = 2/3` (150 and 250 clear it, 50
    does not). A bug that recalibrated `q=99` from `eval_values` ITSELF would instead compute
    `percentile((50,150,250), 99, linear) == 248.0` and find only `250` clears it —
    `fired_share = 1/3`. The two are far enough apart (`2/3` vs `1/3`) that this test would
    fail loudly if `D-WF3`'s freeze were ever bypassed.
    """
    recipe = WalkForwardRecipe(
        spec_version=1,
        calib_length_ms=7,
        eval_length_ms=1,
        step_ms=1,
        min_obs_calib=1,
        min_obs_eval=1,
    )
    calib_values = _observations(*(float(value) for value in range(1, 101)))
    source = FakeWalkForwardSource(
        values_by_window={
            (0, 7): calib_values,
            (7, 8): _observations(50.0, 150.0, 250.0),
        }
    )

    result = compute_walk_forward_firing_rate(
        source,
        field=FIELD,
        nature=Nature.STOCK,
        universe=UNIVERSE,
        window=Window(start_ms=0, end_ms=8),
        threshold=THRESHOLD_Q99,
        recipe=recipe,
    )

    assert result.n_windows == 1
    assert result.rates == pytest.approx((2 / 3,))
    assert result.rate == pytest.approx(2 / 3)
    assert result.max_rate == pytest.approx(2 / 3)


def test_a_fold_below_min_obs_calib_is_excluded_and_never_reads_its_eval_side() -> None:
    """`D-WF4`: a fold whose calib population is too small is dropped BEFORE the eval read.

    2 folds (`calib_length=2`, `eval_length=1`, `step=1`, `window=[0,4)`, `min_obs_calib=3`):
    fold 0's calib has only 2 points (`< 3`) -> EXCLUDED, and its eval window is never queried.
    Fold 1's calib has 3 points (`>= 3`) -> computed normally.
    """
    recipe = WalkForwardRecipe(
        spec_version=1,
        calib_length_ms=2,
        eval_length_ms=1,
        step_ms=1,
        min_obs_calib=3,
        min_obs_eval=1,
    )
    source = FakeWalkForwardSource(
        values_by_window={
            (0, 2): _observations(1.0, 2.0),  # fold 0 calib: 2 points, below min_obs_calib=3
            (1, 3): _observations(1.0, 2.0, 3.0),  # fold 1 calib: 3 points, meets the floor
            (3, 4): _observations(5.0),  # fold 1 eval
        }
    )

    result = compute_walk_forward_firing_rate(
        source,
        field=FIELD,
        nature=Nature.STOCK,
        universe=UNIVERSE,
        window=Window(start_ms=0, end_ms=4),
        threshold=THRESHOLD_Q99,
        recipe=recipe,
    )

    assert result.n_windows == 1
    assert result.excluded_windows == 1
    eval_calls = [
        call
        for call in source.calls
        if call[0] == "observed_values" and (call[1], call[2]) == (2, 3)
    ]
    assert eval_calls == []  # fold 0's eval window [2, 3) was never queried


def test_a_fold_below_min_obs_eval_is_excluded_after_its_calib_was_read() -> None:
    """`D-WF4`: the eval-side floor excludes a fold too, counted the same way as the calib floor."""
    recipe = WalkForwardRecipe(
        spec_version=1,
        calib_length_ms=2,
        eval_length_ms=1,
        step_ms=1,
        min_obs_calib=1,
        min_obs_eval=2,
    )
    source = FakeWalkForwardSource(
        values_by_window={
            (0, 2): _observations(1.0, 2.0),
            (2, 3): _observations(5.0),  # eval: 1 point, below min_obs_eval=2
        }
    )

    with pytest.raises(InsufficientWindowForWalkForwardError):
        compute_walk_forward_firing_rate(
            source,
            field=FIELD,
            nature=Nature.STOCK,
            universe=UNIVERSE,
            window=Window(start_ms=0, end_ms=3),
            threshold=THRESHOLD_Q99,
            recipe=recipe,
        )


def test_every_fold_excluded_refuses_rather_than_returning_an_empty_result() -> None:
    """`D-WF4`/`D-WF1` share one refusal type: zero usable folds is the same fact either way."""
    recipe = WalkForwardRecipe(
        spec_version=1,
        calib_length_ms=2,
        eval_length_ms=1,
        step_ms=1,
        min_obs_calib=1000,
        min_obs_eval=1,
    )
    source = FakeWalkForwardSource(
        values_by_window={(0, 2): _observations(1.0, 2.0), (2, 3): _observations(5.0)}
    )

    with pytest.raises(InsufficientWindowForWalkForwardError):
        compute_walk_forward_firing_rate(
            source,
            field=FIELD,
            nature=Nature.STOCK,
            universe=UNIVERSE,
            window=Window(start_ms=0, end_ms=3),
            threshold=THRESHOLD_Q99,
            recipe=recipe,
        )


def test_the_partition_formula_reproduces_d8_2_s_n_23_end_to_end() -> None:
    """`D8.2`'s own arithmetic (`floor((30-7-1)/1)+1 == 23`), run through the FULL use case.

    Every fold is handed the SAME calib/eval populations here (a flat fixture, not `D8.2`'s
    real BTC/30d numbers — those require the raw dataset this repository does not version, see
    `CLAUDE.md` "Dado bruto não é versionado") — so `rate == max_rate` is EXPECTED here, and the
    point of this test is `n_windows == 23`/`excluded_windows == 0` end-to-end, not the specific
    rate value.
    """
    day_ms = 86_400_000
    recipe = WalkForwardRecipe(
        spec_version=1,
        calib_length_ms=7 * day_ms,
        eval_length_ms=1 * day_ms,
        step_ms=1 * day_ms,
        min_obs_calib=1,
        min_obs_eval=1,
    )
    calib_values = _observations(*(float(value) for value in range(1, 101)))
    eval_values = _observations(250.0)  # clears calib's frozen q=99 threshold (≈99.01) every fold

    class FlatSource:
        def observed_values(
            self,
            requested_field: FieldIdentity,
            nature: Nature,
            universe: str,
            window: Window,
            knowledge_time_ms: int,
        ) -> Sequence[Observation]:
            span = window.end_ms - window.start_ms
            return calib_values if span == recipe.calib_length_ms else eval_values

        def resolved_universe_size(
            self, universe: str, window: Window, knowledge_time_ms: int
        ) -> int:
            return 500

    result = compute_walk_forward_firing_rate(
        FlatSource(),
        field=FIELD,
        nature=Nature.STOCK,
        universe=UNIVERSE,
        window=Window(start_ms=0, end_ms=30 * day_ms),
        threshold=THRESHOLD_Q99,
        recipe=recipe,
    )

    assert result.n_windows == 23
    assert result.excluded_windows == 0
    assert len(result.rates) == 23
    assert result.rate == pytest.approx(1.0)
    assert result.max_rate == pytest.approx(1.0)
