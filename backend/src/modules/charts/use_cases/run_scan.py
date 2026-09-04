"""`run_scan` — `ADR-020/D7`'s orchestration for `S4`'s `scan` job: read via PORT, evaluate.

Reuses `use_cases.compute_distribution.ObservationSource` — `scan` and `distribution` read the
EXACT SAME eligible population (`D8.1`'s falsifier depends on this: `scan` and `distribution`
over the same `(field, nature, universe, window, knowledge_time)` have to agree with each
other), so this module does not define a second read port.

`ADR-022/D1`: the port now returns `Sequence[Observation]`, and `evaluate_scan` consumes that
directly — unlike `compute_distribution.py`, this module does NOT project `.value` off each
observation, because `min_obs` filtering (`ADR-022/D2`) needs the `n_obs` that only `Observation`
carries.
"""

from __future__ import annotations

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.firing_rate import Window
from src.modules.charts.domain.scan import ScanResult, evaluate_scan
from src.modules.charts.domain.threshold_spec import ThresholdSpec
from src.modules.charts.use_cases.compute_distribution import ObservationSource
from src.modules.sentimento.domain.series_key import Nature


def run_scan(
    source: ObservationSource,
    *,
    field: FieldIdentity,
    nature: Nature,
    universe: str,
    window: Window,
    knowledge_time_ms: int,
    spec: ThresholdSpec,
) -> ScanResult:
    """Read the eligible population via `source`, then count how many satisfy `spec`.

    `ADR-020` §"Contexto", `D8.1`. `ADR-022/D2`: `min_obs` filtering by observation happens
    inside `evaluate_scan`, not here — this function only reads and delegates.
    """
    observations = source.observed_values(field, nature, universe, window, knowledge_time_ms)
    n_resolved = source.resolved_universe_size(universe, window, knowledge_time_ms)
    return evaluate_scan(
        observations,
        field=field,
        nature=nature,
        universe_declared=universe,
        n_universe_resolved=n_resolved,
        spec=spec,
    )
