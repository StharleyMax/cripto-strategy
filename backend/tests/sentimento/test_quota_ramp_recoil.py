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


def test_a_delay_seconds_that_is_negative_is_clamped_and_never_a_negative_pause() -> None:
    """`Retry-After: -5` is junk in the ONE direction that matters: it reads as "go now".

    Left unclamped it would reach the record as `-5.0` and reach `SystemRampClock.sleep()` as a
    `ValueError`, turning a hostile header into a crash in the middle of a back-off. The clamp
    was written but nothing asserted it: the mutation `max(0.0, float(int(candidate)))` ->
    `float(int(candidate))` SURVIVED the 187-test suite
    `[MEDIDO 2026-08-29, bancada de mutacao do QA, n=18 mutacoes medidas]`.
    """
    assert parse_retry_after("-5", NOW) == 0.0
    assert POLICY.decide(throttle_index=0, retry_after_seconds=0.0).seconds == 60.0


def test_a_fractional_delay_seconds_is_absent_and_never_silently_rounded() -> None:
    """`RFC 9110` delay-seconds is an integer; `12.5` is junk and must route to our own policy."""
    assert parse_retry_after("12.5", NOW) is None
    decision = POLICY.decide(throttle_index=0, retry_after_seconds=parse_retry_after("12.5", NOW))

    assert decision.source is RecoilSource.POLICY_NO_RETRY_AFTER
    assert decision.retry_after_present is False


def test_the_boundary_where_the_provider_asks_exactly_our_own_escalation() -> None:
    """At equality the authority is the PROVIDER, not the policy — and the two are different.

    The pause is 60 s either way, so only the recorded `source` can tell a run that obeyed a
    header from a run that guessed. The mutation `>=` -> `>` changes nothing but that label and
    SURVIVED the suite `[MEDIDO 2026-08-29, bancada de mutacao do QA]`.
    """
    decision = POLICY.decide(throttle_index=0, retry_after_seconds=60.0)

    assert decision.seconds == 60.0
    assert decision.source is RecoilSource.RETRY_AFTER


@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFEITO PROVADO (QA T-03.7): o cap declarado nao alcanca o Retry-After do fornecedor. "
        "`Retry-After: 999999999` produz uma pausa de 11.574 dias, e uma data HTTP em 2099 "
        "produz 72 anos. O proprio docstring de `cap_seconds` diz por que isso e um defeito: "
        "'an operator who cannot predict the upper bound of a wait will kill the process, "
        "which loses the ledger'. Remova este marcador quando a pausa passar a ser limitada."
    ),
)
def test_an_absurd_retry_after_is_bounded_by_the_declared_cap() -> None:
    """A header the third party controls must not decide how long OUR process blocks.

    `[MEDIDO 2026-08-29] POLICY.decide(0, parse_retry_after("999999999", NOW))` ->
    `seconds=999999999.0`, `source=RETRY_AFTER`, contra `cap_seconds=300.0`.
    """
    seconds = parse_retry_after("999999999", NOW)
    decision = POLICY.decide(throttle_index=0, retry_after_seconds=seconds)

    assert decision.seconds <= POLICY.cap_seconds


@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFEITO PROVADO (QA T-03.7): mesma classe pela forma de data. "
        "`Retry-After: Fri, 01 Jan 2099 00:00:00 GMT` -> 2.270.908.800 s (72 anos)."
    ),
)
def test_an_absurd_retry_after_date_is_bounded_by_the_declared_cap() -> None:
    """The HTTP-date form reaches the same unbounded pause by another road."""
    seconds = parse_retry_after("Fri, 01 Jan 2099 00:00:00 GMT", NOW)
    decision = POLICY.decide(throttle_index=0, retry_after_seconds=seconds)

    assert decision.seconds <= POLICY.cap_seconds
