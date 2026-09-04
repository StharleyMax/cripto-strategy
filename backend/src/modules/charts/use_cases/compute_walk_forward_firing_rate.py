"""`compute_walk_forward_firing_rate` — `ADR-023/D-WF6`'s second, dedicated entry point.

`compute_firing_rate` (unchanged, `T-08.6`) only ever builds the `in_sample` degenerate case
(`calib_window == eval_window`) and refuses any other pair by name. This module is the NEW
entry point `ADR-023` opens for the walk-forward rule: it partitions `window` into folds
(`domain.walk_forward.partition_folds`, `D-WF1`), reads each side of each fold via the SAME
`ObservationSource` port `compute_distribution` already uses (`ADR-020/D7`) with a
`knowledge_time_ms` PINNED PER FOLD (`D-WF2`, the anti-lookahead guard — never one value for
the whole call), freezes the calib-derived percentile into a literal `AbsoluteSpec` before it
ever touches the eval side (`D-WF3`, the anti-tautology guard), and folds the per-fold rates
into the extended `WalkForwardFiringRate` (`D-WF5`).

Two entry points, not one branching on argument shape — `D-WF6`'s own reasoning: giving
`compute_firing_rate` a `source`/`recipe` it does not need today would change the signature of
a caller already in production (`T-08.6`) for a branch it never exercises.

`ADR-022/D1` (`T-08.7`): `ObservationSource.observed_values` now returns `Sequence[Observation]`,
not a bare `Sequence[float]`. The calib side projects `.value` off each observation before
`percentile` (same move `compute_distribution.py` makes — `percentile` never gained an
`Observation`-aware overload); the eval side is handed to `evaluate_scan` UNPROJECTED, exactly
like `run_scan.py`, because `min_obs` filtering (`ADR-022/D2`) needs the `n_obs` that only
`Observation` carries.
"""

from __future__ import annotations

import statistics

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.firing_rate import WalkForwardFiringRate, Window
from src.modules.charts.domain.histogram import percentile
from src.modules.charts.domain.scan import evaluate_scan
from src.modules.charts.domain.threshold_spec import AbsoluteSpec
from src.modules.charts.domain.walk_forward import (
    InsufficientWindowForWalkForwardError,
    WalkForwardRecipe,
    WalkForwardThresholdRecipe,
    partition_folds,
)
from src.modules.charts.use_cases.compute_distribution import ObservationSource
from src.modules.sentimento.domain.series_key import Nature


def compute_walk_forward_firing_rate(
    source: ObservationSource,
    *,
    field: FieldIdentity,
    nature: Nature,
    universe: str,
    window: Window,
    threshold: WalkForwardThresholdRecipe,
    recipe: WalkForwardRecipe,
) -> WalkForwardFiringRate:
    """Compute the OOS walk-forward firing rate `D8.2` asked for, fold by fold.

    Per fold `i` (`D-WF3`'s own per-fold recipe):

    1. Read `calib_values` over `fold(i).calib_window`, `knowledge_time_ms =
       fold(i).calib_window.end_ms` (`D-WF2`: as of the instant the eval side BEGINS, never
       "now"). Fewer than `recipe.min_obs_calib` -> fold EXCLUDED (`D-WF4`).
    2. `threshold_value = percentile(calib_population, threshold.q, threshold.interpolation)`,
       where `calib_population` is `.value` projected off each `calib_values` observation
       (`ADR-022/D1`), frozen into `AbsoluteSpec(pct=threshold_value, op=threshold.op)` — a
       LITERAL from here on; `evaluate_scan` never recomputes a percentile for `AbsoluteSpec`
       (`scan.py`), which is what makes the anti-tautology guarantee hold by type, not by
       discipline.
    3. Read `eval_values` over `fold(i).eval_window`, `knowledge_time_ms =
       fold(i).eval_window.end_ms`. Fewer than `recipe.min_obs_eval` -> fold EXCLUDED.
    4. `fold_result = evaluate_scan(eval_values, spec=frozen, ...)`; `fold_result.fired_share`
       is this fold's rate.

    Every fold excluded -> `InsufficientWindowForWalkForwardError` (`D-WF4`: same fact as
    `partition_folds`'s own guard, population empty either before or after the split).
    """
    folds = partition_folds(window, recipe)

    rates: list[float] = []
    excluded_windows = 0
    for fold in folds:
        calib_knowledge_time_ms = fold.calib_window.end_ms
        calib_values = source.observed_values(
            field, nature, universe, fold.calib_window, calib_knowledge_time_ms
        )
        if len(calib_values) < recipe.min_obs_calib:
            excluded_windows += 1
            continue

        calib_population = [observation.value for observation in calib_values]
        threshold_value = percentile(calib_population, threshold.q, threshold.interpolation)
        frozen_spec = AbsoluteSpec(pct=threshold_value, op=threshold.op)

        eval_knowledge_time_ms = fold.eval_window.end_ms
        eval_values = source.observed_values(
            field, nature, universe, fold.eval_window, eval_knowledge_time_ms
        )
        if len(eval_values) < recipe.min_obs_eval:
            excluded_windows += 1
            continue

        n_universe_resolved = source.resolved_universe_size(
            universe, fold.eval_window, eval_knowledge_time_ms
        )
        fold_result = evaluate_scan(
            eval_values,
            field=field,
            nature=nature,
            universe_declared=universe,
            n_universe_resolved=n_universe_resolved,
            spec=frozen_spec,
        )
        rates.append(fold_result.fired_share)

    if not rates:
        raise InsufficientWindowForWalkForwardError(
            f"all {len(folds)} fold(s) built from window={window!r} were excluded for "
            f"insufficient population (min_obs_calib={recipe.min_obs_calib}, "
            f"min_obs_eval={recipe.min_obs_eval}): walk-forward requires at least one "
            f"effectively computed fold"
        )

    return WalkForwardFiringRate(
        total_window=window,
        recipe=recipe,
        threshold=threshold,
        n_windows=len(rates),
        excluded_windows=excluded_windows,
        rates=tuple(rates),
        rate=statistics.mean(rates),
        max_rate=max(rates),
    )
