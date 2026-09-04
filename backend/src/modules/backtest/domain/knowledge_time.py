"""`knowledge_time` is a fact ACHIEVED by a run, never a clock the run consults — `ADR-021`/D4.

`SPEC-001` §2.5: `knowledge_time` is the maximum `observed_at` admitted by the read. Two
modes, transcribed from `ADR-021`/D4:

- `LIVE` (no `knowledgeTime` pinned): computed AFTER the run finishes, as `max(observed_at)`
  over every `as_of()` observation actually consulted. The engine never asks a clock for it.
- `PINNED` (`AsOfBundle.knowledgeTime` set): the caller supplies the value up front, and this
  module confirms the invariant `max(observed_at) read <= pinned` — a violation means `as_of`
  read past the requested horizon, which is a bug in the read path, not a valid `run_registry`
  row.

Nothing here reads `time`/`datetime` (`backend/pyproject.toml`, contract "Natureza"):
`observed_at_values` are handed in by whoever ran the observations, same discipline as the
decision-read accessor `SPEC-001` §2.5 describes.
"""

from __future__ import annotations

from collections.abc import Sequence
from enum import Enum


class KnowledgeTimeMode(Enum):
    """Which of the two `ADR-021`/D4 capture modes produced this run."""

    LIVE = "live"
    """No `knowledgeTime` pinned — `knowledge_time` is derived from the data actually read."""

    PINNED = "pinned"
    """`AsOfBundle.knowledgeTime` set — the caller names the horizon before running."""


class MissingObservationsError(ValueError):
    """A `LIVE` run reached this module having read zero observations.

    `knowledge_time = max(observed_at)` has no value over an empty read, and returning a
    fabricated one (`0`, "now") would silently satisfy every downstream type check while
    recording a number that describes nothing this run actually saw.
    """


class MissingPinnedKnowledgeTimeError(ValueError):
    """`KnowledgeTimeMode.PINNED` was requested without the pinned value it needs."""


class KnowledgeTimeExceededError(ValueError):
    """The read achieved an `observed_at` past the pinned `knowledge_time` — `as_of`'s bug.

    `ADR-021`/D4: this is never a valid `run_registry` row. `as_of`'s own admission predicate
    (`observed_at <= knowledge_time`, `SPEC-001` §2.5) already refuses this at the level of a
    single reading; this is the run-level confirmation that no reading slipped through.
    """


def resolve_knowledge_time(
    *,
    mode: KnowledgeTimeMode,
    observed_at_values: Sequence[int],
    pinned_knowledge_time: int | None,
) -> int:
    """Resolve `knowledge_time` for one run, refusing a call that cannot be honest about it."""
    if mode is KnowledgeTimeMode.PINNED:
        if pinned_knowledge_time is None:
            raise MissingPinnedKnowledgeTimeError(
                "KnowledgeTimeMode.PINNED requires pinned_knowledge_time, and it is absent"
            )
        if observed_at_values:
            achieved = max(observed_at_values)
            if achieved > pinned_knowledge_time:
                raise KnowledgeTimeExceededError(
                    f"the read achieved observed_at={achieved}, past the pinned "
                    f"knowledge_time={pinned_knowledge_time} — as_of() read beyond the "
                    f"requested horizon"
                )
        return pinned_knowledge_time
    if not observed_at_values:
        raise MissingObservationsError(
            "KnowledgeTimeMode.LIVE cannot resolve knowledge_time from zero observed values — "
            "a run that read nothing has no achieved bound to record"
        )
    return max(observed_at_values)
