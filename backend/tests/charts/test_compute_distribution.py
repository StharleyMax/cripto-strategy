"""`compute_distribution` — reads via the `ObservationSource` PORT, never concretizes a store.

`ADR-020/D7`: "`use_cases/` lê via PORTA (protocolo), não concretiza store." The fake below is
the test double that stands in for the (out-of-scope) TimescaleDB adapter — it exists ONLY in
`tests/`, and this module never imports anything infra-shaped.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.firing_rate import Window
from src.modules.charts.domain.histogram_recipe import DEFAULT_HISTOGRAM_RECIPE
from src.modules.charts.use_cases.compute_distribution import compute_distribution
from src.modules.sentimento.domain.series_key import Nature

FIELD = FieldIdentity(metric="sum_open_interest_value", unit="pct", denom="none")
WINDOW = Window(start_ms=0, end_ms=86_400_000)


@dataclass(frozen=True)
class FakeObservationSource:
    """An in-memory double of the read PORT.

    `ADR-020/D7`'s "não concretiza store", honored: this fake is not a store, it is a fixed
    answer handed to the use case under test.
    """

    values: Sequence[float]
    n_resolved: int
    calls: list[tuple[str, str, int]] = field(default_factory=list)

    def observed_values(
        self,
        requested_field: FieldIdentity,
        nature: Nature,
        universe: str,
        window: Window,
        knowledge_time_ms: int,
    ) -> Sequence[float]:
        """Record the call and return the fixed `values` this fake was built with."""
        self.calls.append(("observed_values", universe, knowledge_time_ms))
        return self.values

    def resolved_universe_size(self, universe: str, window: Window, knowledge_time_ms: int) -> int:
        """Record the call and return the fixed `n_resolved` this fake was built with."""
        self.calls.append(("resolved_universe_size", universe, knowledge_time_ms))
        return self.n_resolved


def test_compute_distribution_delegates_the_read_then_calls_the_domain_histogram() -> None:
    """The use case reads via the port and hands the result straight to `compute_histogram`."""
    source = FakeObservationSource(values=[1.0, 2.0, 3.0, 4.0, 5.0], n_resolved=487)

    result = compute_distribution(
        source,
        field=FIELD,
        nature=Nature.STOCK,
        universe="top_500",
        window=WINDOW,
        knowledge_time_ms=1_700_000_000_000,
        recipe=DEFAULT_HISTOGRAM_RECIPE,
    )

    assert result.n_total == 5
    assert result.universe.declared == "top_500"
    assert result.universe.n_resolved == 487


def test_compute_distribution_passes_the_declared_axes_to_the_port() -> None:
    """`universe` and `knowledge_time_ms` reach the port UNCHANGED.

    Reproducibility (`SPEC-001` §7) depends on the read actually using the axes the caller
    declared.
    """
    source = FakeObservationSource(values=[10.0, 20.0], n_resolved=2)

    compute_distribution(
        source,
        field=FIELD,
        nature=Nature.STOCK,
        universe="BTCUSDT",
        window=WINDOW,
        knowledge_time_ms=1_700_000_000_000,
        recipe=DEFAULT_HISTOGRAM_RECIPE,
    )

    assert ("observed_values", "BTCUSDT", 1_700_000_000_000) in source.calls
    assert ("resolved_universe_size", "BTCUSDT", 1_700_000_000_000) in source.calls
