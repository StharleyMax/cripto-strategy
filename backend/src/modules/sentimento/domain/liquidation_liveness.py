"""Is the liquidation pipe ALIVE? Answered by CONTIGUITY and HEARTBEAT — never by a rate.

`T-05.7`, plan `05` item 5.5, `SPEC-007` §3.3/§8.7. Inherits `T-07.11` of `plataforma-dados` by
reference and changes its target: that task watched the SOCKET, and `ADR-036/D4` put the REST
source on the critical path in its place.

⛔ WHY A RATE DETECTOR IS NOT AN OPTION HERE, WITH THE NUMBER THAT SETTLES IT ──────────────────

This series is SPARSE. Only **20,2%** of 1-minute buckets carry any liquidation at all
`[MEDIDO 2026-09-12, n=14.344 buckets possiveis em 239,07 h, 2.900 preenchidos]`. So four out of
every five HEALTHY minutes produce exactly what a dead pipe produces: nothing.

    a healthy minute with no liquidation  -> 0 points
    a minute in which the collector died  -> 0 points

A detector that reads the point count answers the SAME number in both, which is `ADR-012`'s
`rc=0`: a signal indistinguishable between "nothing happened" and "the instrument cannot tell".
And this is not a hypothetical — it is how `!forceOrder@arr` stayed mute for **~46 h** with
nothing raising a hand (`ACHADO-FORCEORDER.md`, `n=2` runs).

── WHAT THIS MODULE MEASURES INSTEAD ──────────────────────────────────────────────────────────

Two facts, and NEITHER of them is a property of the data:

  HEARTBEAT    when did a cycle last CLOSE successfully? A cycle that ran, asked, and got an
               empty answer is a heartbeat. Silence from the COLLECTOR is the defect; silence
               from the MARKET is a fact.

  CONTIGUITY   which spans of wall-clock time has a successful cycle actually COVERED? Each
               cycle declares the window it asked for, and the union of those windows is the
               coverage. A hole in the union is time nobody looked at — and because a REST
               history is re-readable (`ADR-036/D4`), a hole is recoverable when it is SEEN and
               permanent when it is not.

`points`, `n_returned` and `n_published` appear NOWHERE in this module. That is the invariant,
and `test_liquidation_liveness.py::test_the_verdict_is_identical_for_a_quiet_market_and_a_busy_one`
enforces it by driving the same heartbeat shape with wildly different point counts and requiring
byte-identical verdicts.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Final

# `ADR-030/D1`'s own multiplier, reused rather than re-invented: a collector is stale once it has
# missed `K` scheduled cycles. `K = 3` is `[INFERRED: opiniao do quant-architect; nenhuma medicao
# de jitter de agenda existe]` there, and inheriting it keeps ONE definition of "late" across the
# dashboard and this detector instead of two that drift.
STALE_AFTER_CYCLES: Final[int] = 3

# Below this many closed cycles there is no pattern to judge — the same floor `ADR-030/D1` sets
# for its own liveness verdict, and for the same reason: two points do not establish a cadence,
# and a detector that guessed one from them would fire on a collector that had simply just
# started.
MIN_CYCLES_FOR_A_VERDICT: Final[int] = 2


class LivenessKind(Enum):
    """The closed set of verdicts. A fifth would need its own requirement, not a new string."""

    ALIVE = "ALIVE"
    """A cycle closed recently and the covered span has no hole. Says nothing about volume."""

    SILENT = "SILENT"
    """No successful cycle for longer than `STALE_AFTER_CYCLES` cadences. THE PIPE IS DEAD.

    This is the state `!forceOrder@arr` sat in for ~46 h while a rate detector read `0` and
    called it a quiet market.
    """

    GAPPED = "GAPPED"
    """A cycle closed recently, but some earlier span was never covered by any successful cycle.

    Recoverable on a REST source and ONLY while it is visible — hence a verdict of its own
    rather than being folded into `ALIVE` (which would hide it) or into `SILENT` (which would
    say the pipe is down when it is up and catching up).
    """

    NOT_JUDGED = "NOT_JUDGED"
    """Fewer than `MIN_CYCLES_FOR_A_VERDICT` closed cycles — no cadence to be late against."""


class InvalidHeartbeatError(ValueError):
    """A heartbeat whose covered window is inverted, empty, or ends after it was recorded."""


@dataclass(frozen=True)
class CycleHeartbeat:
    """ONE closed cycle: when it ended, what wall-clock span it covered, and whether it worked.

    `covered_from_ms`/`covered_to_ms` are the window the cycle ASKED THE PROVIDER FOR, not the
    window it got points back for. That distinction is the whole design: a cycle that asked for
    three hours and got two empty responses covered three hours — it looked, and there was
    nothing there. Recording the answered span instead would rebuild the rate detector with
    extra steps.
    """

    ended_at_ms: int
    covered_from_ms: int
    covered_to_ms: int
    succeeded: bool

    def __post_init__(self) -> None:
        """Reject a heartbeat that could not describe a real observation."""
        if self.covered_from_ms >= self.covered_to_ms:
            raise InvalidHeartbeatError(
                f"covered_from_ms={self.covered_from_ms} >= covered_to_ms={self.covered_to_ms}: "
                f"a cycle that covered no span did not look anywhere"
            )
        if self.covered_to_ms > self.ended_at_ms:
            raise InvalidHeartbeatError(
                f"covered_to_ms={self.covered_to_ms} > ended_at_ms={self.ended_at_ms}: a cycle "
                f"cannot have covered an instant that had not happened when it closed"
            )


@dataclass(frozen=True)
class UncoveredSpan:
    """A stretch of wall clock no successful cycle ever looked at."""

    from_ms: int
    to_ms: int

    @property
    def duration_ms(self) -> int:
        """Return how long nobody was looking."""
        return self.to_ms - self.from_ms


@dataclass(frozen=True)
class LivenessVerdict:
    """The answer, with the operands that produced it — never a bare enum.

    `silent_for_ms` is `None` when no successful cycle has EVER closed, which is a different
    fact from "the last one was a long time ago" and must not be rendered as a very large
    number. Same asymmetry `quota_bucket.py` draws between a blind bucket and one reporting zero.
    """

    kind: LivenessKind
    last_success_at_ms: int | None
    silent_for_ms: int | None
    stale_after_ms: int
    uncovered: tuple[UncoveredSpan, ...]
    n_cycles: int

    @property
    def is_alive(self) -> bool:
        """Return whether the pipe is both beating and whole."""
        return self.kind is LivenessKind.ALIVE


def _merge_covered(
    heartbeats: Sequence[CycleHeartbeat],
) -> tuple[tuple[int, int], ...]:
    """Union the covered windows of the SUCCESSFUL cycles into non-overlapping spans.

    Merging (rather than counting windows) is what makes overlap free: every cycle deliberately
    asks for far more than the cadence, because the width of a Coinalyze request costs nothing
    `[MEDIDO 2026-09-10, MEDICAO §4.2.3-§4.2.5]`. Overlapping windows are the NORMAL case, and a
    detector that treated each window as a separate interval would report a hole at every seam.
    """
    windows = sorted(
        (beat.covered_from_ms, beat.covered_to_ms) for beat in heartbeats if beat.succeeded
    )
    merged: list[tuple[int, int]] = []
    for start, end in windows:
        if merged and start <= merged[-1][1]:
            previous_start, previous_end = merged[-1]
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    return tuple(merged)


def assess_liquidation_liveness(
    heartbeats: Sequence[CycleHeartbeat],
    *,
    now_ms: int,
    cadence_ms: int,
    stale_after_cycles: int = STALE_AFTER_CYCLES,
) -> LivenessVerdict:
    """Judge the pipe from cycle heartbeats alone — no point count enters this function.

    The order of the two tests is deliberate and it is a decision, not an accident:

    1. SILENT WINS. A pipe that stopped beating is down NOW, and reporting `GAPPED` for
       something that is currently dead would describe the symptom and miss the diagnosis.
    2. GAPPED otherwise. A beating pipe with a hole behind it is up and has something to
       recover — visible, and therefore fixable, which is exactly the property `ADR-036/D4`
       bought by choosing a re-readable REST source over a socket whose lost data is lost
       forever.

    `stale_after_ms = stale_after_cycles x cadence_ms` — LATE is defined in units of the
    schedule, so changing the cadence moves the threshold with it instead of leaving a constant
    tuned for a schedule nobody runs any more.
    """
    if cadence_ms <= 0:
        raise ValueError(f"cadence_ms={cadence_ms}: a cadence is a positive span")
    stale_after_ms = stale_after_cycles * cadence_ms
    successes = [beat for beat in heartbeats if beat.succeeded]
    last_success_at_ms = max((beat.ended_at_ms for beat in successes), default=None)
    silent_for_ms = None if last_success_at_ms is None else now_ms - last_success_at_ms
    merged = _merge_covered(heartbeats)
    uncovered = tuple(
        UncoveredSpan(from_ms=earlier_end, to_ms=later_start)
        for (_, earlier_end), (later_start, _) in zip(merged, merged[1:], strict=False)
        if later_start > earlier_end
    )
    if len(heartbeats) < MIN_CYCLES_FOR_A_VERDICT:
        kind = LivenessKind.NOT_JUDGED
    elif silent_for_ms is None or silent_for_ms > stale_after_ms:
        kind = LivenessKind.SILENT
    elif uncovered:
        kind = LivenessKind.GAPPED
    else:
        kind = LivenessKind.ALIVE
    return LivenessVerdict(
        kind=kind,
        last_success_at_ms=last_success_at_ms,
        silent_for_ms=silent_for_ms,
        stale_after_ms=stale_after_ms,
        uncovered=uncovered,
        n_cycles=len(heartbeats),
    )
