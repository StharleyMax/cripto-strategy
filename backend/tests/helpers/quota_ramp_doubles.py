"""Fakes that let the ramp be exercised with ZERO network and ZERO real seconds.

The clock RECORDS what it was asked to sleep instead of sleeping. That is what makes the
recoil assertable: a test can prove the run waited 60 s without waiting 60 s, and a run that
forgot to recoil is caught by an EMPTY list rather than by a stopwatch nobody reads.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from src.modules.sentimento.domain.quota_bucket import QuotaBucket
from src.modules.sentimento.domain.ramp_ledger import ProbeObservation


class ScriptedProbe:
    """Replays a fixed script of observations, then refuses to be called again.

    Running past the end of the script RAISES instead of looping or returning a default: a
    ramp that made more requests than the test scripted is a defect, and a fake that silently
    absorbed the extra calls would hide exactly the runaway this task is about.
    """

    def __init__(self, script: Sequence[ProbeObservation | OSError]) -> None:
        """Take the observations to hand out, in order."""
        self._script = list(script)
        self.calls: list[tuple[str, str]] = []

    def probe(self, bucket: QuotaBucket, path: str) -> ProbeObservation:
        """Return the next scripted observation, raising a scripted transport failure as one."""
        self.calls.append((bucket.identifier, path))
        if not self._script:
            raise AssertionError(
                f"a rampa pediu a requisicao {len(self.calls)} e o roteiro tem "
                f"{len(self.calls) - 1}: ela subiu mais degraus do que o teste declarou"
            )
        step = self._script.pop(0)
        if isinstance(step, OSError):
            raise step
        return step


class RecordingClock:
    """A clock that advances only when asked to sleep, and keeps every pause it was given."""

    def __init__(self, start_epoch: float = 1_800_000_000.0) -> None:
        """Start both readings at a fixed point so assertions are exact."""
        self._monotonic = 0.0
        self._epoch = start_epoch
        self.slept: list[float] = []

    def monotonic(self) -> float:
        """Return the fake monotonic reading, advancing it by 1 ms per call.

        The advance is not decoration: it makes `elapsed_seconds` non-zero, so a test can tell
        a timed rung from an untimed one.
        """
        self._monotonic += 0.001
        return self._monotonic

    def epoch(self) -> float:
        """Return the fake wall clock, which only `sleep` moves."""
        return self._epoch

    def sleep(self, seconds: float) -> None:
        """Record the pause and advance both readings by it — without waiting."""
        self.slept.append(seconds)
        self._monotonic += seconds
        self._epoch += seconds


def accepted(headers: Mapping[str, str] | None = None) -> ProbeObservation:
    """Build a `200` observation with the given headers."""
    return ProbeObservation(status=200, headers=dict(headers or {}))


def throttled(headers: Mapping[str, str] | None = None) -> ProbeObservation:
    """Build a `429` observation with the given headers."""
    return ProbeObservation(status=429, headers=dict(headers or {}))
