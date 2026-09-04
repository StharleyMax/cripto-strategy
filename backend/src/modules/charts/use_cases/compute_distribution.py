"""`compute_distribution` — read via PORT, then hand off to the pure `histogram` domain.

`ADR-020/D2`'s orchestration. `ADR-020/D7`, literal: "`use_cases/` lê via PORTA (protocolo),
não concretiza store." This
module defines the read PORT (`ObservationSource`) and calls it; the concrete adapter over
TimescaleDB (`ADR-002/D4`) is explicitly out of THIS task's scope — `ADR-020`'s own file tree
marks `charts/infra/` "fora de escopo aqui — a PORTA é decisão deste ADR, a query SQL é do
builder [de uma task futura]."
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.firing_rate import Window
from src.modules.charts.domain.histogram import HistogramResult, compute_histogram
from src.modules.charts.domain.histogram_recipe import HistogramRecipe
from src.modules.sentimento.domain.series_key import Nature


class ObservationSource(Protocol):
    """Read port over ELIGIBLE field observations — never a materialized `LOCF` value.

    `ADR-020/D2` step 1: "de todas as observações de `field` sobre `universe`/`window`, lidas
    `as of knowledge_time`, mantém só as que a política de ausência de `nature` classifica como
    valor real — nunca um `LOCF` de `FLOW`, nunca uma observação além do trilho de vigência de
    `STOCK`." `SPEC-001` §5.11 fixes that SAME policy for a single-instant read; an
    implementation of this port over a WINDOW must uphold the identical rule — this is the
    CONTRACT the port exists to state, the same way `use_cases.ingest_health.IngestRecordSource`
    documents "never over a log" instead of re-deriving it in code that has no way to check a
    SQL adapter's own query.
    """

    def observed_values(
        self,
        field: FieldIdentity,
        nature: Nature,
        universe: str,
        window: Window,
        knowledge_time_ms: int,
    ) -> Sequence[float]:
        """Return every §5.11-eligible observation of `field` over `universe`/`window`.

        As of `knowledge_time_ms`.
        """
        ...

    def resolved_universe_size(self, universe: str, window: Window, knowledge_time_ms: int) -> int:
        """Return how many instruments `universe` actually resolved to.

        As of `knowledge_time_ms` (`D8.8`: every cross-symbol metric declares its own `n`).
        """
        ...


def compute_distribution(
    source: ObservationSource,
    *,
    field: FieldIdentity,
    nature: Nature,
    universe: str,
    window: Window,
    knowledge_time_ms: int,
    recipe: HistogramRecipe,
) -> HistogramResult:
    """Read the eligible population via `source`, then run `ADR-020/D2` steps 2-4 over it."""
    values = source.observed_values(field, nature, universe, window, knowledge_time_ms)
    n_resolved = source.resolved_universe_size(universe, window, knowledge_time_ms)
    return compute_histogram(
        values,
        field=field,
        nature=nature,
        universe_declared=universe,
        n_universe_resolved=n_resolved,
        recipe=recipe,
    )
