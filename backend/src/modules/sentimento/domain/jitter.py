"""Jitter over a paced interval — never the same pause twice, on purpose."""

# `CA-F3-9` / plano 07 item 7.9 / `T-07.7`. `domain/local_quota_broker.py` paces a blind bucket
# at a FIXED interval, and a fixed interval is exactly the shape that synchronises retries across
# independent processes hitting the same bucket: if every process backs off by the same amount
# after the same signal, they converge back onto the SAME instant and re-trip together —
# thundering herd, applied to a bucket that already has no headroom to spare. Jitter breaks that
# synchronisation by making the paced interval vary, deliberately, call to call.
#
# ── WHY THE ARITHMETIC IS PURE AND THE RANDOMNESS IS NOT ──────────────────────────────────
#
# `apply()` below takes the random draw as a plain `float` argument instead of calling
# `random.random()` itself, for the same reason `domain/recoil_policy.py` takes
# `retry_after_seconds` instead of reading a header: a function that RECEIVES its
# non-determinism is a function a test can drive with exact, chosen values — `0.0`, `0.5`,
# `1.0` — and prove the bounds from BOTH edges without ever depending on luck.
#
# `sample_uniform()` is the one place this module is not deterministic, and it is intentionally
# tiny and does nothing but wrap `random.random()`. `ADR-016`/`Natureza` forbids `domain` from
# reading a CLOCK (`time`/`datetime`, guarded by `backend/scripts/natureza.py`) and from opening
# a SOCKET (`socket`/`ssl`); it says nothing about `random`, because a pseudo-random draw is
# neither — it depends on neither wall-clock time nor the network, and, unlike `time.monotonic()`
# or `date.today()`, two calls in the same process are not expected to agree with each other in
# the first place. The task's own DoD asks for a test that proves REAL variance across calls,
# which is the reason this thin wrapper exists at all instead of pushing randomness one layer up
# with no other layer to receive it in this task's scope.

from __future__ import annotations

import random
from dataclasses import dataclass


class InvalidJitterPolicyError(Exception):
    """A jitter policy or a draw that could not describe a bounded, non-negative pause."""


@dataclass(frozen=True)
class JitterPolicy:
    """A symmetric jitter band around a base interval, expressed as a fraction of it.

    `spread=0.2` means the jittered pause lands anywhere in `[0.8 * base, 1.2 * base]`,
    uniformly, as `sample` ranges over `[0.0, 1.0)`. `spread` is capped at `1.0` so the jittered
    pause can never go negative — a jittered pause of zero (or below) would dispatch a call
    immediately, which is the one thing a broker pacing a BLIND bucket must never do.
    """

    spread: float

    def __post_init__(self) -> None:
        """Reject a spread that could not keep the jittered pause non-negative."""
        if not (0.0 <= self.spread <= 1.0):
            raise InvalidJitterPolicyError(
                f"spread={self.spread}: must be within [0.0, 1.0] so the jittered pause can "
                "never go negative"
            )

    def apply(self, base_seconds: float, sample: float) -> float:
        """Return `base_seconds` jittered by `sample`, a draw uniform over `[0.0, 1.0)`.

        `sample=0.0` yields the low edge `(1 - spread) * base_seconds`; `sample=1.0` (excluded by
        contract, but not refused here so a test can check the closed edge) yields the high edge
        `(1 + spread) * base_seconds`; `sample=0.5` yields `base_seconds` exactly, unjittered.
        """
        if base_seconds < 0:
            raise InvalidJitterPolicyError(
                f"base_seconds={base_seconds}: a negative base interval does not exist"
            )
        if not (0.0 <= sample <= 1.0):
            raise InvalidJitterPolicyError(
                f"sample={sample}: must be within [0.0, 1.0], the domain of a uniform draw"
            )
        ratio = (1.0 - self.spread) + (2.0 * self.spread) * sample
        return base_seconds * ratio


def sample_uniform() -> float:
    """Draw one real sample from `[0.0, 1.0)` — the only non-deterministic line in this module."""
    return random.random()  # noqa: S311 - jitter pacing, not cryptography
