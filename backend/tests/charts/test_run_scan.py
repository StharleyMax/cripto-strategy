"""`run_scan` — reads via the SAME `ObservationSource` port `compute_distribution` uses."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.firing_rate import Window
from src.modules.charts.domain.threshold_spec import AbsoluteSpec
from src.modules.charts.use_cases.run_scan import run_scan
from src.modules.sentimento.domain.series_key import Nature

FIELD = FieldIdentity(metric="sum_taker_long_short_vol_ratio", unit="pct", denom="none")
WINDOW = Window(start_ms=0, end_ms=86_400_000)


@dataclass(frozen=True)
class FakeObservationSource:
    """Same shape as `test_compute_distribution.py`'s fake — the two use cases share a port."""

    values: Sequence[float]
    n_resolved: int

    def observed_values(
        self,
        requested_field: FieldIdentity,
        nature: Nature,
        universe: str,
        window: Window,
        knowledge_time_ms: int,
    ) -> Sequence[float]:
        """Return the fixed `values` this fake was built with."""
        return self.values

    def resolved_universe_size(self, universe: str, window: Window, knowledge_time_ms: int) -> int:
        """Return the fixed `n_resolved` this fake was built with."""
        return self.n_resolved


def test_run_scan_delegates_the_read_then_evaluates_the_spec() -> None:
    """`values=1..10`, `Absolute{5, ">"}` -> 5 of 10 fire.

    Same result `evaluate_scan` gives directly.
    """
    source = FakeObservationSource(values=[float(v) for v in range(1, 11)], n_resolved=10)

    result = run_scan(
        source,
        field=FIELD,
        nature=Nature.RATIO,
        universe="top_10",
        window=WINDOW,
        knowledge_time_ms=1_700_000_000_000,
        spec=AbsoluteSpec(pct=5.0, op=">"),
    )

    assert result.n_total == 10
    assert result.n_fired == 5
    assert result.universe.declared == "top_10"
    assert result.universe.n_resolved == 10
