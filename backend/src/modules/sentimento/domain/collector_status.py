"""`collector-status` envelope shape: `ADR-030`'s four formulas, projected to the wire.

`ADR-030` decides FOUR things about a series `(source, endpoint)` from `IngestRecordSource.runs()`
alone, with `now` injected: `status` (D1), `uptimePercent` (D2), `retention` (D3), `resilience`
(D4). This module holds the SHAPE those decisions land in — the dataclasses and their
`to_dict()`/`to_envelope()` projections — never the arithmetic itself, which lives in
`use_cases/collector_status.py` because it reads the port (`IngestRecordSource.runs()`) and this
module does not import that port at all.

`retention`/`resilience` are each a CLOSED set of two variants (`ADR-030` D3/D4): the series is
either judged (`unmeasured`/`not_scored`) or the judgement does not apply because the series is
`PARADO` (`not_applicable`/`unavailable`). Neither variant EVER carries the `~4,7x` or the
`1,5 d`/`7,0 d` numbers `D7.13`/`D7.12` compute in the PLAN — `ADR-030` D3/D4 is explicit that
echoing a plan constant here would "lavar constante de plano como dado de serie" (F-7/F-8).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

# The wire name of this query — `ADR-030` D5, `I-10` — parallel to
# `use_cases/ingest_health.py`'s `INGEST_HEALTH_QUERY_NAME`, and just as STABLE: it is how a
# consumer finds this envelope instead of writing its own reader for `/collector-status`.
COLLECTOR_STATUS_QUERY_NAME: Final[str] = "collector_status"

# `ADR-030` D2: the trailing window `uptimePercent` sums over — `[INFERRED: D7.15's "24h de
# desconexao aparece como rotina"]`. It travels in the envelope as `window_hours` so a reader
# never has to guess which horizon produced the number.
UPTIME_WINDOW_HOURS: Final[int] = 24

# `ADR-030` D1: `stale_after(s) = K x period(s)`. `K` is `[INFERRED: opiniao do quant-architect;
# nenhuma medicao de jitter de agenda existe]` — `ADR-030` falsifier F-3 is what moves it with a
# number, never taste.
STALE_AFTER_MULTIPLIER: Final[int] = 3

# `ADR-030` D1: below this many total runs, the median in `period(s)` has no meaning — the row
# reports `liveness.kind = "not_judged"` instead of guessing a period from too few points.
MIN_RUNS_FOR_LIVENESS: Final[int] = 3

# `ADR-030` D1: `period(s)` is the median over AT MOST the last 20 runs, so one very old
# incident never keeps dragging today's cadence.
MAX_RUNS_FOR_PERIOD: Final[int] = 20


class MalformedRunTimestampError(ValueError):
    """A run's `ended_at` that does not parse as ISO-8601 — `ADR-030` D0/F-10.

    `ADR-030` D0 is explicit: "Timestamp que nao parseia => o use case levanta
    `MalformedRunTimestampError`" — same doctrine as `UnknownVerdictError`
    (`use_cases/ingest_health.py`): refuse the whole read rather than silently drop or guess at
    the one row whose timestamp cannot be trusted.
    """


@dataclass(frozen=True)
class LivenessJudged:
    """`ADR-030` D1: the series had >= `MIN_RUNS_FOR_LIVENESS` runs, so staleness WAS judged."""

    period_s: float
    stale_after_s: float

    def to_dict(self) -> dict[str, object]:
        """Project to the two fields `ADR-030` D5's envelope example fixes for this kind."""
        return {
            "kind": "judged",
            "period_s": self.period_s,
            "stale_after_s": self.stale_after_s,
        }


@dataclass(frozen=True)
class LivenessNotJudged:
    """`ADR-030` D1: fewer than `MIN_RUNS_FOR_LIVENESS` runs — staleness is NOT judged."""

    n_runs: int

    def to_dict(self) -> dict[str, object]:
        """Project to `{"kind": "not_judged", "n_runs": ...}` — `ADR-030` D1 example (iii)."""
        return {"kind": "not_judged", "n_runs": self.n_runs}


Liveness = LivenessJudged | LivenessNotJudged


@dataclass(frozen=True)
class RetentionUnmeasured:
    """`ADR-030` D3: no per-series retention measurement exists yet — correct, not a placeholder."""

    def to_dict(self) -> dict[str, object]:
        """Project to `{"kind": "unmeasured"}` — `ADR-030` D3."""
        return {"kind": "unmeasured"}


@dataclass(frozen=True)
class RetentionNotApplicable:
    """`ADR-030` D3: the series is `PARADO`, so retention is not applicable to judge."""

    def to_dict(self) -> dict[str, object]:
        """Project to `{"kind": "not_applicable"}` — `ADR-030` D3."""
        return {"kind": "not_applicable"}


Retention = RetentionUnmeasured | RetentionNotApplicable


@dataclass(frozen=True)
class ResilienceNotScored:
    """`ADR-030` D4: no per-series resilience score exists — the `~4,7x` stays a plan constant."""

    def to_dict(self) -> dict[str, object]:
        """Project to `{"kind": "not_scored"}` — `ADR-030` D4."""
        return {"kind": "not_scored"}


@dataclass(frozen=True)
class ResilienceUnavailable:
    """`ADR-030` D4: the series is `PARADO`, so resilience is not available to score."""

    def to_dict(self) -> dict[str, object]:
        """Project to `{"kind": "unavailable"}` — `ADR-030` D4."""
        return {"kind": "unavailable"}


Resilience = ResilienceNotScored | ResilienceUnavailable

# `ADR-030` D1: the closed set this envelope emits in `F3` — `ARQUIVO`/`PENDENTE` require
# insumos outside `md.ingest_run` (`ADR-030` D1 closing bullet, F-4) and are NOT this module's
# to invent.
CollectorStatus = Literal["ATIVO", "PARADO"]


@dataclass(frozen=True)
class CollectorStatusRow:
    """One series' row of `/collector-status` — `ADR-030` D5's envelope example, verbatim.

    The first 6 fields (`series`..`statusDetail`) are `CollectorRow` **verbatim**
    (`frontend/src/features/s1-console/domain.ts:59-79`) — camelCase is the front's contract,
    not this module's style choice. Every field after `statusDetail` is an INSUMO the formula
    used, in the store's own naming (`run_id`, `ended_at`, `verdict`, snake_case), so a reader
    can re-derive the row in SQL without trusting this code (`ADR-030`'s falsifier table).
    """

    series: str
    source: str
    endpoint: str
    status: CollectorStatus
    uptime_percent: float | None
    # `str | None` since `T-06.2`, and the widening is deliberate rather than incidental: under
    # `ADR-035/D1`'s amendment a `null` `uptime_percent` covers two unrelated facts — no run at
    # all in the window, or runs that the writer closed none of — and a `null` that means two
    # things is the ambiguous `rc=0` of `ADR-012` wearing a different type. `n_runs_in_window`
    # (below, already served) separates them; this field carries the REASON, in pt-BR, because
    # it is operator microcopy (`SPEC-001` §3.8). It is NOT a new field — `D7` refused
    # DUPLICATING the metric, not using a field that is already in the envelope, already
    # validated as a nullable string by the front and already rendered by it.
    status_detail: str | None
    retention: Retention
    resilience: Resilience
    n_runs_total: int
    n_runs_in_window: int
    last_run_id: str
    last_verdict: str
    last_ended_at: str
    age_s: float
    liveness: Liveness

    def to_dict(self) -> dict[str, object]:
        """Project to the exact field set/order `ADR-030` D5's envelope example shows."""
        return {
            "series": self.series,
            "source": self.source,
            "endpoint": self.endpoint,
            "status": self.status,
            "uptimePercent": self.uptime_percent,
            "statusDetail": self.status_detail,
            "retention": self.retention.to_dict(),
            "resilience": self.resilience.to_dict(),
            "n_runs_total": self.n_runs_total,
            "n_runs_in_window": self.n_runs_in_window,
            "last_run_id": self.last_run_id,
            "last_verdict": self.last_verdict,
            "last_ended_at": self.last_ended_at,
            "age_s": self.age_s,
            "liveness": self.liveness.to_dict(),
        }


@dataclass(frozen=True)
class CollectorStatusReport:
    """What `collector_status_query` returns — `ADR-030` D5's SEPARATE envelope (`F-D6-2`/`NG-9`).

    Separate from `IngestHealthReport` on purpose: `ADR-030` D5 and `SPEC-003` §2 both say a
    field added here must never move the `sha256` `/ingest-health` computes over the 15-column
    projection (`ADR-008/DoD-2`) — two envelopes, so the one this report builds can carry
    `started_at`/`ended_at`-derived fields without the other one changing a byte.
    """

    as_of: str
    window_hours: int
    rows: tuple[CollectorStatusRow, ...]

    def to_envelope(self) -> dict[str, object]:
        """Return the nested-object shape `ADR-030` D5 fixes for the HTTP consumer."""
        return {
            "query": COLLECTOR_STATUS_QUERY_NAME,
            "as_of": self.as_of,
            "window_hours": self.window_hours,
            "n_rows": len(self.rows),
            "rows": [row.to_dict() for row in self.rows],
        }
