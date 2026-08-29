"""The recoil after a `429`: how long to wait, and on whose authority."""

# ── WHY THE SOURCE OF THE PAUSE IS PART OF THE RESULT ──────────────────────────────────────
#
# `Retry-After` is OPTIONAL in `RFC 9110` §10.2.3, and a provider that omits it leaves us
# guessing. A policy that returned only a number would make "the provider told us to wait 30 s"
# and "we guessed 30 s because nothing told us anything" indistinguishable downstream — which is
# the same class of collapsed state the ramp ledger exists to prevent, one layer up.
#
# So every decision carries WHERE the number came from, and the absence of the header is
# recorded rather than silently absorbed.
#
# ── AND THE PAUSE IS NEVER SHORTER THAN WHAT THE PROVIDER ASKED ────────────────────────────
#
# Respecting `Retry-After` means never waiting LESS. When our own escalation is longer, we take
# ours: waiting longer than asked is conservative and cannot be a violation, while waiting less
# is one. `RETRY_AFTER_RAISED_BY_POLICY` names that case instead of hiding it inside a `max()`.
#
# ── AND NO SINGLE SLEEP IS LONGER THAN A NUMBER WE DECLARED (F1, /qa 2026-08-29) ────────────
#
# The paragraph above was true and INCOMPLETE, and the gap was measured: `cap_seconds` bounded
# our own escalation and NOT the header, so `Retry-After: 999999999` produced a pause of
# **11.574 dias** and `Retry-After: Fri, 01 Jan 2099 00:00:00 GMT` produced **72 anos**
# `[MEDIDO 2026-08-29 pelo /qa, dois xfail(strict=True)]`. A third party was choosing how long
# OUR process blocks — and `cap_seconds` exists in this file precisely because "an operator who
# cannot predict the upper bound of a wait will kill the process, which loses the ledger".
#
# So the SLEEP is capped. But the request is NOT discarded: `requested_seconds` carries what the
# provider asked, verbatim, and `unmet_seconds` says how much of it this pause did not cover.
# Capping without recording would be the very collapse the first paragraph forbids — it would
# make "the provider asked for 300 s" and "the provider asked for 3.600 s and we cut it"
# indistinguishable, and a caller that resumed on `seconds` alone would resume too early.
#
# WHY ONE CEILING AND NOT TWO. A separate cap for third-party headers would be a second number
# an operator has to hold to predict the worst wait, and predictability is the whole property
# `cap_seconds` buys. One number, one guarantee: `decide()` NEVER returns `seconds` above
# `cap_seconds`, whoever asked.
#
# ⚠️ WHAT THIS DOES NOT DO, AND `T-07.7` INHERITS IT. Capping the sleep is safe HERE because
# this ramp stops at the first `429` and never resumes — a shorter pause sends no request. A
# broker in regime DOES resume, and resuming after `seconds` when `unmet_seconds > 0` would hit
# the provider before it said to. `T-07.7` has to loop on `unmet_seconds`, not on `seconds`.

from __future__ import annotations

from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from enum import Enum


class RecoilSource(Enum):
    """Who decided the length of this pause."""

    RETRY_AFTER = "RETRY_AFTER"
    """The provider sent `Retry-After` and it was longer than our own escalation."""

    RETRY_AFTER_RAISED_BY_POLICY = "RETRY_AFTER_RAISED_BY_POLICY"
    """The provider sent `Retry-After`, and our escalation was longer, so we waited ours."""

    RETRY_AFTER_CAPPED = "RETRY_AFTER_CAPPED"
    """The provider asked for MORE than `cap_seconds`; this pause is the cap, not the request.

    Seeing this value means `unmet_seconds > 0` and the provider's instruction is only partly
    served. It is not an error and not a violation — it is the one state in which resuming on
    `seconds` alone would be too early.
    """

    POLICY_NO_RETRY_AFTER = "POLICY_NO_RETRY_AFTER"
    """No `Retry-After` came. The pause is OUR guess, and this value says so out loud."""


class InvalidRecoilPolicyError(Exception):
    """A policy whose parameters cannot produce a non-decreasing, bounded escalation."""


def parse_retry_after(raw: str | None, now_epoch_seconds: float) -> float | None:
    """Read `Retry-After` in either legal form, returning `None` when it is absent or junk.

    `RFC 9110` allows delay-seconds ("120") and an HTTP-date ("Sat, 29 Aug 2026 14:42:18 GMT").
    A date already in the past yields `0.0`, never a negative pause.

    Junk is treated as ABSENT rather than as an error, deliberately: the caller is already in
    the middle of a back-off and a malformed header is not a reason to crash. What it must not
    do is silently become a number — and it does not, because `None` routes the caller to
    `POLICY_NO_RETRY_AFTER`, which is visible in the record.
    """
    if raw is None:
        return None
    candidate = raw.strip()
    if not candidate:
        return None
    try:
        return max(0.0, float(int(candidate)))
    except ValueError:
        pass
    try:
        moment = parsedate_to_datetime(candidate)
    except (TypeError, ValueError):
        return None
    return max(0.0, moment.timestamp() - now_epoch_seconds)


@dataclass(frozen=True)
class RecoilDecision:
    """One pause: its length, its authority, and what was asked that it did not cover.

    `seconds` is what the caller will actually sleep and is ALWAYS `<= cap_seconds`.
    `requested_seconds` is what the provider asked, verbatim (`None` when no header came).
    The gap between the two is `unmet_seconds`, and it exists so that a caller which RESUMES —
    `T-07.7`, not this ramp — can tell a fully served instruction from a truncated one.
    """

    seconds: float
    source: RecoilSource
    retry_after_present: bool
    requested_seconds: float | None = None

    def __post_init__(self) -> None:
        """Reject a decision whose fields contradict each other."""
        if self.retry_after_present != (self.requested_seconds is not None):
            raise InvalidRecoilPolicyError(
                "retry_after_present tem de concordar com a presenca de requested_seconds: "
                "'o fornecedor pediu' e 'quanto ele pediu' sao a mesma informacao"
            )

    @property
    def unmet_seconds(self) -> float:
        """Return how much of the provider's request this pause does NOT cover.

        Zero whenever no header came or the request was served in full. Positive only under
        `RETRY_AFTER_CAPPED`, and there it is the number a resuming caller must still wait.
        """
        if self.requested_seconds is None:
            return 0.0
        return max(0.0, self.requested_seconds - self.seconds)

    @property
    def honoured_in_full(self) -> bool:
        """Return whether this pause covers everything the provider asked for."""
        return self.unmet_seconds == 0.0


@dataclass(frozen=True)
class RecoilPolicy:
    """Exponential escalation with a declared cap — the fallback when the provider is mute.

    The cap is not decoration: an unbounded exponential turns the third `429` of a long run
    into an hour of sleep, and an operator who cannot predict the upper bound of a wait will
    kill the process, which loses the ledger.
    """

    base_seconds: float
    factor: float
    cap_seconds: float

    def __post_init__(self) -> None:
        """Reject parameters that would make the escalation shrink or run away."""
        if self.base_seconds <= 0:
            raise InvalidRecoilPolicyError("base_seconds tem de ser positivo")
        if self.factor < 1.0:
            raise InvalidRecoilPolicyError("factor < 1 faria a espera ENCOLHER a cada 429")
        if self.cap_seconds < self.base_seconds:
            raise InvalidRecoilPolicyError("cap_seconds abaixo de base_seconds anula a base")

    def escalation_for(self, throttle_index: int) -> float:
        """Return our own pause for the n-th `429` of the run, counting from zero."""
        if throttle_index < 0:
            raise InvalidRecoilPolicyError("throttle_index negativo nao e um degrau")
        return min(self.cap_seconds, self.base_seconds * self.factor**throttle_index)

    def decide(self, throttle_index: int, retry_after_seconds: float | None) -> RecoilDecision:
        """Choose the pause, name its authority, and never sleep longer than `cap_seconds`.

        Three guarantees, and they are checked by tests that fail from BOTH sides:
        never shorter than the provider asked (unless the cap forces it, and then it is
        recorded); never shorter than our own escalation; never longer than `cap_seconds`.
        """
        escalation = self.escalation_for(throttle_index)
        if retry_after_seconds is None:
            return RecoilDecision(
                seconds=escalation,
                source=RecoilSource.POLICY_NO_RETRY_AFTER,
                retry_after_present=False,
                requested_seconds=None,
            )
        if retry_after_seconds > self.cap_seconds:
            # The cap wins over the header, and `unmet_seconds` carries the difference. This is
            # the ONLY branch that serves less than was asked, and it is the only one whose
            # source says so.
            return RecoilDecision(
                seconds=self.cap_seconds,
                source=RecoilSource.RETRY_AFTER_CAPPED,
                retry_after_present=True,
                requested_seconds=retry_after_seconds,
            )
        if retry_after_seconds >= escalation:
            return RecoilDecision(
                seconds=retry_after_seconds,
                source=RecoilSource.RETRY_AFTER,
                retry_after_present=True,
                requested_seconds=retry_after_seconds,
            )
        return RecoilDecision(
            seconds=escalation,
            source=RecoilSource.RETRY_AFTER_RAISED_BY_POLICY,
            retry_after_present=True,
            requested_seconds=retry_after_seconds,
        )
