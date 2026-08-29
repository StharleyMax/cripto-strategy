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
    """One pause, with its length, its authority, and whether the header was there at all."""

    seconds: float
    source: RecoilSource
    retry_after_present: bool


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
        """Choose the pause and name its authority, never waiting less than asked."""
        escalation = self.escalation_for(throttle_index)
        if retry_after_seconds is None:
            return RecoilDecision(
                seconds=escalation,
                source=RecoilSource.POLICY_NO_RETRY_AFTER,
                retry_after_present=False,
            )
        if retry_after_seconds >= escalation:
            return RecoilDecision(
                seconds=retry_after_seconds,
                source=RecoilSource.RETRY_AFTER,
                retry_after_present=True,
            )
        return RecoilDecision(
            seconds=escalation,
            source=RecoilSource.RETRY_AFTER_RAISED_BY_POLICY,
            retry_after_present=True,
        )
