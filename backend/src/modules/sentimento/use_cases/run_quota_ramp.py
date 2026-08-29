"""Climb until the provider says `429`, then recoil — once, and never twice."""

# ── WHY THE TRANSPORT AND THE CLOCK ARE PORTS ──────────────────────────────────────────────
#
# The suite of this repository is OFFLINE BY CONSTRUCTION (`backend/scripts/test.sh`, "ZERO
# REDE"). The live ramp is therefore NOT a test and never will be: it is a one-shot measurement
# against a third party, run by a human from `infra/quota_ramp_cli.py`.
#
# What DOES belong in the suite is the logic — the climb, the stop, the recoil, and above all
# the refusal to publish a ceiling that dispatch does not support. Injecting the transport and
# the clock is what makes that logic reachable without a socket and without waiting real
# seconds, and it is also what lets a test drive the `429` that a live run cannot summon on
# demand.

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.modules.sentimento.domain.quota_bucket import QuotaBucket
from src.modules.sentimento.domain.ramp_ledger import (
    ProbeObservation,
    RampLedger,
    RampRung,
    RungOutcome,
    observe_rung,
)
from src.modules.sentimento.domain.ramp_plan import RampPlan
from src.modules.sentimento.domain.recoil_policy import RecoilDecision, RecoilPolicy


class QuotaProbe(Protocol):
    """One request against one path of one bucket.

    It reports what came back — or reports that nothing did, which is the distinction the whole
    ledger is built on.
    """

    def probe(self, bucket: QuotaBucket, path: str) -> ProbeObservation:
        """Issue the request and describe the outcome without interpreting it."""
        ...


class RampClock(Protocol):
    """The three time operations the ramp needs, separated by what they are FOR.

    `monotonic` measures durations and cannot go backwards. `epoch` exists only to resolve a
    `Retry-After` sent as an HTTP-date, which is wall-clock by definition. Collapsing the two
    would make the recoil wrong exactly when the machine's clock is adjusted mid-run.
    """

    def monotonic(self) -> float:
        """Return a monotonically increasing reading, in seconds."""
        ...

    def epoch(self) -> float:
        """Return wall-clock seconds since the Unix epoch."""
        ...

    def sleep(self, seconds: float) -> None:
        """Block for `seconds`."""
        ...


@dataclass(frozen=True)
class RampRun:
    """Everything one pass produced: the ledger, and the recoil it performed (or did not)."""

    ledger: RampLedger
    recoil: RecoilDecision | None

    @property
    def recoiled(self) -> bool:
        """Return whether the run actually backed off, which only a `429` can cause."""
        return self.recoil is not None


def _attempt(plan: RampPlan, probe: QuotaProbe, clock: RampClock, index: int) -> RampRung:
    """Issue one request and turn it into a rung, timing it on the monotonic clock.

    A transport that RAISES is converted here, and the conversion is the control: the
    exception becomes `NOT_DISPATCHED`, which `RampLedger.verdict()` refuses to read as
    headroom. Letting it propagate would lose the pass; swallowing it would forge one.
    """
    started = clock.monotonic()
    try:
        observation = probe.probe(plan.bucket, plan.path)
    except OSError as failure:
        observation = ProbeObservation(transport_error=f"{type(failure).__name__}: {failure}")
    return observe_rung(
        index=index,
        bucket=plan.bucket,
        observation=observation,
        elapsed_seconds=clock.monotonic() - started,
        now_epoch_seconds=clock.epoch(),
    )


def run_quota_ramp(
    plan: RampPlan,
    probe: QuotaProbe,
    clock: RampClock,
    policy: RecoilPolicy,
) -> RampRun:
    """Climb the plan one request at a time, stopping at the FIRST `429` and backing off.

    It does NOT climb again to confirm. One pass is the universe: a second climb against a
    rolling one-minute window is a second measurement at a second moment, not more `n` for the
    first one, and it doubles the load on a third party to learn nothing new.
    """
    rungs: list[RampRung] = []
    recoil: RecoilDecision | None = None
    for index in range(1, plan.max_requests + 1):
        rung = _attempt(plan, probe, clock, index)
        rungs.append(rung)
        if rung.outcome is RungOutcome.THROTTLED:
            recoil = policy.decide(0, rung.retry_after_seconds)
            clock.sleep(recoil.seconds)
            break
        if rung.outcome is RungOutcome.NOT_DISPATCHED:
            break
        if index < plan.max_requests:
            clock.sleep(plan.interval_after(index))
    return RampRun(
        ledger=RampLedger(bucket_identifier=plan.bucket.identifier, rungs=tuple(rungs)),
        recoil=recoil,
    )
