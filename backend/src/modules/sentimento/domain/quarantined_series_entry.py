"""One row this one-shot writes: a captured series, still raw, born quarantined."""

# Ties together the three domain pieces a store needs to persist one symbol's series without
# losing anything: the points themselves (`coinalyze_daily_series.DailyPoint`), the requirement
# verdict that says whether this symbol met `CA-F0-13`'s floor, and the quarantine terms that
# say WHY the row is isolated (`quarantine_terms.QuarantineTerms`) rather than just THAT it is.
#
# This module has no I/O and no clock: `received_at` and `run_id` arrive as arguments, exactly
# like `domain/ingest_record.py`'s `IngestRun` does for the same reason — a caller in `infra`
# reads the real clock once and passes the value in, so this dataclass is trivially testable
# with a fixed string.

from __future__ import annotations

import json
from dataclasses import dataclass

from src.modules.sentimento.domain.coinalyze_daily_series import (
    DailyPoint,
    SeriesKind,
    SeriesRequirementVerdict,
)
from src.modules.sentimento.domain.quarantine_terms import QuarantineTerms


@dataclass(frozen=True)
class QuarantinedSeriesEntry:
    """One symbol's one series, raw, with the verdict and the quarantine terms attached."""

    source: str
    series_kind: SeriesKind
    binance_symbol: str
    coinalyze_symbol: str
    points: tuple[DailyPoint, ...]
    requirement_verdict: SeriesRequirementVerdict
    quarantine: QuarantineTerms
    received_at: str
    run_id: str

    def points_json(self) -> str:
        """Serialize every raw point as a JSON array — the bytes a store persists verbatim.

        `sort_keys=False` preserves the field order the provider sent, and every point's `raw`
        dict rides through untouched: this is the "grava cru" half of the contract, not a
        re-encoding through typed fields that could drop something the provider added.
        """
        return json.dumps([dict(point.raw) for point in self.points], ensure_ascii=True)

    @property
    def n_points(self) -> int:
        """Return how many points this entry carries — the same count the verdict was built on."""
        return len(self.points)

    @property
    def available_at(self) -> str | None:
        """Return `None` always, for a row of this task: the quarantine's third term is absent.

        Reading this off `quarantine.available_at_present` rather than hardcoding `None` a
        second time means the two can never silently disagree — if a future task resolves
        `Q19` and flips the term, `available_at` becomes structurally inconsistent with
        `quarantine` before anyone writes a value here, and that inconsistency is exactly what
        the constructor should refuse (see `__post_init__`).
        """
        return None if not self.quarantine.available_at_present else self.received_at
