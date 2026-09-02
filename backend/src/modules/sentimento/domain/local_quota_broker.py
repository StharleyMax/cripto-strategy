"""The broker for a BLIND bucket: pacing computed locally, never read from a response."""

# `CA-F3-9` / `avaliacao:A3` / plano 02 item 2.4. `domain/quota_bucket.py` already measured and
# declared that Coinalyze's `200` carries no quota header at all
# (`docs/medicao-coinalyze.md` §3.1) — there is no counter to read, so the ONLY honest pacing is a
# FIXED interval derived from the provider's documented ceiling, applied to every single call
# whether or not the last few looked fine.
#
# ── WHY FIXED SPACING AND NOT A BURST-THEN-WAIT RAMP ───────────────────────────────────────────
#
# `domain/ramp_plan.py` accelerates deliberately, because ITS job is to find where a bucket
# throttles. This broker's job is the opposite: never find out, on a bucket this task cannot
# afford to get throttled on mid-sweep (a `429` here does not advance a measurement, it just
# delays 1.140 calls further). A steady one call every `interval_seconds` never bursts and never
# front-loads — the same conservative-by-construction argument `quota_bucket.py` already makes for
# treating this bucket as blind rather than as reasoned-about.
#
# The published ceiling is 40 calls/minute per key (`docs/medicao-coinalyze.md` §3.1,
# `avaliacao-discovery.md` "Rate limit, 40 API calls per minute per API Key" `[DOC]` — never
# confirmed by a `429`, `[NÃO MEDIDO]` per the same document's §4). `interval_seconds` below is
# `60 / 40 = 1.5`, which is EXACTLY the arithmetic behind the declared cost of this task's
# one-shot (`1.140 chamadas × 1.5 s = 1.710 s = 28,5 min`, `docs/decisoes-do-owner.md` and
# `docs/specs/PRD-001-plataforma-dados.md` §9). A caller that wants extra margin passes a lower
# `calls_per_window` — this module does not add a margin of its own, so the declared cost model
# and the code that spends it stay the same number.

from __future__ import annotations

from dataclasses import dataclass


class InvalidQuotaBrokerError(Exception):
    """A broker configuration that could not pace anything, or would not stay conservative."""


@dataclass(frozen=True)
class LocalQuotaBroker:
    """A fixed-interval pace over a BLIND bucket — no header read, no acceleration, no burst."""

    calls_per_window: int
    window_seconds: float

    def __post_init__(self) -> None:
        """Reject a broker that could not compute a positive, finite interval."""
        if self.calls_per_window < 1:
            raise InvalidQuotaBrokerError(
                f"calls_per_window={self.calls_per_window}: uma janela sem chamada nao paceia nada"
            )
        if self.window_seconds <= 0:
            raise InvalidQuotaBrokerError(
                f"window_seconds={self.window_seconds}: uma janela nao positiva nao e uma janela"
            )

    @property
    def interval_seconds(self) -> float:
        """Return the fixed pause between every two calls, conservative by never bursting.

        This is `window_seconds / calls_per_window`, applied uniformly — the same pause before
        the first call of the run as before the last, because the bucket is BLIND and this
        broker has no observation to react to. A design that spent 40 calls immediately and
        then paused 60 s would also average 40/min, but it would be a burst wearing an average,
        and a burst is exactly what a blind bucket cannot afford to risk.
        """
        return self.window_seconds / self.calls_per_window

    def total_seconds_for(self, call_count: int) -> float:
        """Return the wall-clock cost of pacing `call_count` calls, `n - 1` pauses for `n` calls.

        `n - 1` and not `n` mirrors the ramp's own load loop
        (`tests/sentimento/test_quota_ramp_bench_offline.py`,
        "a pause after the last one lengthens only ONE half"): the last call does not wait for
        a call that never comes. `call_count <= 1` costs zero pauses.
        """
        if call_count < 0:
            raise InvalidQuotaBrokerError(
                f"call_count={call_count}: uma contagem negativa de chamadas nao existe"
            )
        pauses = max(0, call_count - 1)
        return pauses * self.interval_seconds
