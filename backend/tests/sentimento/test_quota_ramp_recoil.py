"""The recoil: how long the ramp waits after a `429`, and on whose authority.

Every case here runs with a FAKE clock, so a 300-second cap is asserted in microseconds. That
is the only reason this logic can live in a suite that must stay offline and fast.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.quota_bucket import BINANCE_FUTURES_DATA
from src.modules.sentimento.domain.ramp_ledger import ProbeObservation, observe_rung
from src.modules.sentimento.domain.recoil_policy import (
    InvalidRecoilPolicyError,
    RecoilPolicy,
    RecoilSource,
    parse_retry_after,
)

NOW = 1_800_000_000.0
POLICY = RecoilPolicy(base_seconds=60.0, factor=2.0, cap_seconds=300.0)


def test_retry_after_in_seconds_is_honoured() -> None:
    """The delay-seconds form is the common one, and it wins when it is longer than ours."""
    decision = POLICY.decide(throttle_index=0, retry_after_seconds=120.0)

    assert decision.seconds == 120.0
    assert decision.source is RecoilSource.RETRY_AFTER
    assert decision.retry_after_present is True


def test_a_missing_retry_after_is_recorded_and_not_absorbed() -> None:
    """The absence is the finding. Same 60 s as a provider asking for 60 s — DIFFERENT source."""
    mute = POLICY.decide(throttle_index=0, retry_after_seconds=None)
    spoken = POLICY.decide(throttle_index=0, retry_after_seconds=60.0)

    assert mute.seconds == spoken.seconds == 60.0
    assert mute.retry_after_present is False
    assert spoken.retry_after_present is True
    assert mute.source is RecoilSource.POLICY_NO_RETRY_AFTER
    assert mute.source is not spoken.source


def test_the_pause_is_never_shorter_than_the_provider_asked() -> None:
    """A `Retry-After` below our escalation raises the wait to ours, and says so."""
    decision = POLICY.decide(throttle_index=2, retry_after_seconds=5.0)

    assert decision.seconds == 240.0
    assert decision.seconds > 5.0
    assert decision.source is RecoilSource.RETRY_AFTER_RAISED_BY_POLICY
    assert decision.retry_after_present is True


def test_the_escalation_is_capped() -> None:
    """60 · 2^n stops at the declared cap, so an operator can predict the worst wait."""
    assert POLICY.escalation_for(0) == 60.0
    assert POLICY.escalation_for(1) == 120.0
    assert POLICY.escalation_for(2) == 240.0
    assert POLICY.escalation_for(3) == 300.0
    assert POLICY.escalation_for(50) == 300.0


@pytest.mark.parametrize(
    ("base", "factor", "cap"),
    [(0.0, 2.0, 300.0), (60.0, 0.5, 300.0), (60.0, 2.0, 30.0)],
)
def test_a_policy_that_could_not_escalate_is_refused(
    base: float, factor: float, cap: float
) -> None:
    """A shrinking or self-cancelling escalation is a defect, not a configuration."""
    with pytest.raises(InvalidRecoilPolicyError):
        RecoilPolicy(base_seconds=base, factor=factor, cap_seconds=cap)


def test_a_negative_throttle_index_is_refused() -> None:
    """There is no minus-first `429`."""
    with pytest.raises(InvalidRecoilPolicyError, match="negativo"):
        POLICY.escalation_for(-1)


def test_retry_after_accepts_the_http_date_form() -> None:
    """`RFC 9110` allows a date, and a date in the future becomes the seconds until it."""
    seconds = parse_retry_after("Sat, 29 Aug 2026 14:45:00 GMT", 1_787_000_000.0)

    assert seconds is not None
    assert seconds > 0


def test_a_retry_after_date_already_past_is_zero_and_never_negative() -> None:
    """A clock skew must not produce a negative sleep, which `SystemRampClock` would refuse."""
    assert parse_retry_after("Sat, 29 Aug 2026 14:45:00 GMT", 4_000_000_000.0) == 0.0


@pytest.mark.parametrize("raw", [None, "", "   ", "soon", "Tue, 99 Xxx 2026"])
def test_an_absent_or_malformed_retry_after_is_absent_and_not_a_number(raw: str | None) -> None:
    """Junk routes to `POLICY_NO_RETRY_AFTER`, which is visible; it never becomes a value."""
    assert parse_retry_after(raw, NOW) is None


def test_retry_after_is_read_off_the_response_case_insensitively() -> None:
    """HTTP/2 lower-cases header names; the rung must still find the header."""
    rung = observe_rung(
        index=1,
        bucket=BINANCE_FUTURES_DATA,
        observation=ProbeObservation(status=429, headers={"retry-after": "30"}),
        elapsed_seconds=0.01,
        now_epoch_seconds=NOW,
    )

    assert rung.retry_after_seconds == 30.0
