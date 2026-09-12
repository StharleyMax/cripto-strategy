"""`SeriesHistoryReport`: the 3-level envelope `GET /series-history` serves (`SPEC-006 §5.2`).

`ADR-005/D3` fixes the three levels — session (1x per screen), panel (1x per series) and cell
(per point) — and `ADR-034/D1`/`D5` fix the exact field names for this route, snake_case,
epoch-ms: `session`/`panel`/`rows`/`knowledge_time`/`bar_policy`. This module owns only the
PROJECTION (a pure function of already-computed values); it never calls `as_of` and never talks
to a store — `use_cases/series_history.py` is what builds one of these from a `SeriesCatalogEntry`
and a sequence of `AsOfReading`.

`session.principal_id`/`session.server_now_ms` are NOT known here: this module has no clock and
no notion of an authenticated caller (`backend/pyproject.toml` forbids `domain` from importing
`time`), so `to_envelope` takes them as parameters, supplied by the route (`src.api`, the one
layer allowed to ask the wall clock what time it is).
"""

from __future__ import annotations

from dataclasses import dataclass

from src.modules.sentimento.domain.as_of_accessor import BarPolicy


@dataclass(frozen=True)
class SeriesHistoryRow:
    """One row of the `rows` array — the discriminated pair of `ADR-034/D5`, on the grid.

    `event_time` is the GRID INSTANT (the `t` the use case asked `as_of` about), never the raw
    `event_time` column of the winning observation — a history response has exactly one row per
    grid step, and the grid step is what a chart's X axis needs, not the source's own stamp.
    `available_at` is `None` exactly when `value`/`absence` says there is no point, matching the
    example in `SPEC-006 §5.2` line 2.
    """

    event_time: int
    available_at: int | None
    value: str | None
    absence: str | None

    def to_wire(self) -> dict[str, object]:
        """Project onto the exact field names `SPEC-006 §5.2` writes, snake_case, verbatim."""
        return {
            "event_time": self.event_time,
            "available_at": self.available_at,
            "value": self.value,
            "absence": self.absence,
        }


@dataclass(frozen=True)
class PanelGridVerdict:
    """How the REPORT's grid relates to the series' NATIVE grid — `ADR-037/D4`, on the wire.

    `ADR-026/D1` owns the classification itself (`charts`' `classify_grid_multiple`), and this
    module deliberately does NOT import it: `backend/pyproject.toml`'s "Fronteira de contexto"
    contract forbids `src.modules.sentimento` from importing `src.modules.charts`. This type is
    the PORT's return shape — the three fields `GridMultipleVerdict` publishes, with `reason`
    already projected onto its string value — so the verdict crosses the context boundary as a
    published contract instead of an import. The adapter that builds one is the composition
    root (`src.main`), which is the layer allowed to see both contexts.

    ⚠️ IT IS NOT A SECOND CLASSIFIER. No branch of `ADR-026/D1`'s rule is re-expressed here:
    this carries a verdict someone else computed. A second `if panel_grid_ms < native_grid_ms`
    in this file would be the duplication the boundary exists to prevent, not this dataclass.

    Why the response needs it at all (`ADR-037/D4`): `/series-history` serves a fixed 1-minute
    report grid (`ADR-034/D6`), so a series whose native grid is 5 minutes comes back as a
    STAIRCASE — 4 of every 5 slots repeat one observation (`ADR-037`/M3: 48 of 61). `SPEC-007`
    §8.2/`RN-S1` instructs the DoD to divide the DOM's point count by 5 because of exactly
    this; without the verdict in the envelope, the API serves a number it does not qualify, and
    "1 real bar and 5 repeated lines" passes a `N>=5` check that `RN-S1` itself fears.
    """

    native_grid_ms: int
    enabled: bool
    reason: str
    multiple: int | None

    def to_wire(self) -> dict[str, object]:
        """Project onto the `panel.grid_multiple` object, `reason` as its string value."""
        return {"enabled": self.enabled, "reason": self.reason, "multiple": self.multiple}


@dataclass(frozen=True)
class SeriesHistoryReport:
    """Everything `GET /series-history` needs to answer one request (`SPEC-006 §5.2`).

    `panel_source`/`panel_nature`/`panel_unit` are the catalog-derived, per-screen-panel facts
    `ADR-005/D3`'s "painel" level asks for; `rows` is the "célula" level, one entry per grid
    instant in the requested window.
    """

    panel_series_key_id: str
    panel_source: str
    panel_nature: str
    panel_unit: str
    panel_grid: PanelGridVerdict
    rows: tuple[SeriesHistoryRow, ...]
    knowledge_time: int
    bar_policy: BarPolicy

    def to_envelope(self, *, principal_id: str | None, server_now_ms: int) -> dict[str, object]:
        """Return the 3-level envelope, byte-stable for the same inputs (`ADR-005/D1`'s cache).

        `principal_id`/`server_now_ms` are threaded through rather than read from a clock or an
        auth context HERE — the same reason `AsOfReading.knowledge_time` is echoed rather than
        recomputed (plan item 4.10): a value this response depends on has to be visible in its
        own signature, not implicit in when the function happened to run.
        """
        return {
            "session": {"principal_id": principal_id, "server_now_ms": server_now_ms},
            "panel": {
                "series_key_id": self.panel_series_key_id,
                "source": self.panel_source,
                "nature": self.panel_nature,
                "unit": self.panel_unit,
                # `ADR-037/D4`: the report's grid is fixed at 1 minute (`ADR-034/D6`) while the
                # series' own grid is a catalog fact, so the two have to be READABLE APART on
                # the wire. `native_grid_ms` is the width the read path injected as
                # `bucket_interval_ms`; `grid_multiple` says what that implies for the rows —
                # `upsampling` is the named state for "4 of every 5 slots repeat one bucket".
                "native_grid_ms": self.panel_grid.native_grid_ms,
                "grid_multiple": self.panel_grid.to_wire(),
            },
            "rows": [row.to_wire() for row in self.rows],
            "knowledge_time": self.knowledge_time,
            "bar_policy": self.bar_policy.value,
        }
