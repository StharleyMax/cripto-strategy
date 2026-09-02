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
    RecoilDecision,
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
    with pytest.raises(InvalidRecoilPolicyError, match="negative"):
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


def test_an_absurd_retry_after_is_bounded_by_the_declared_cap() -> None:
    """A header the third party controls must not decide how long OUR process blocks.

    ── O MARCADOR `xfail(strict=True)` DO `/qa` FOI REMOVIDO PORQUE O DEFEITO FOI CONSERTADO ──

    Antes de `RETRY_AFTER_CAPPED`, isto media `seconds=999999999.0` — **11.574 dias** — com
    `source=RETRY_AFTER`, contra `cap_seconds=300.0`
    `[MEDIDO 2026-08-29 pelo /qa; reproduzido pelo builder antes do conserto]`. O teto agora
    alcanca o header, e o que sobra vira `unmet_seconds` em vez de sumir.
    """
    seconds = parse_retry_after("999999999", NOW)
    decision = POLICY.decide(throttle_index=0, retry_after_seconds=seconds)

    assert decision.seconds <= POLICY.cap_seconds
    assert decision.seconds == 300.0
    assert decision.source is RecoilSource.RETRY_AFTER_CAPPED
    # O corte e REGISTRADO, nao absorvido: sem isto, cortar seria a mesma perda de estado que
    # `POLICY_NO_RETRY_AFTER` existe para impedir do outro lado.
    assert decision.requested_seconds == 999999999.0
    assert decision.unmet_seconds == 999999699.0
    assert decision.honoured_in_full is False


def test_an_absurd_retry_after_date_is_bounded_by_the_declared_cap() -> None:
    """The HTTP-date form reached the same unbounded pause by another road, and is capped too.

    Marcador `xfail(strict=True)` do `/qa` removido pelo conserto: antes, **72 anos**
    (2.270.908.800 s) `[MEDIDO 2026-08-29 pelo /qa]`.
    """
    seconds = parse_retry_after("Fri, 01 Jan 2099 00:00:00 GMT", NOW)
    decision = POLICY.decide(throttle_index=0, retry_after_seconds=seconds)

    assert decision.seconds <= POLICY.cap_seconds
    assert decision.source is RecoilSource.RETRY_AFTER_CAPPED
    assert decision.unmet_seconds > 0.0


def test_the_cap_is_never_reached_by_a_request_that_fits_under_it() -> None:
    """O OUTRO LADO do teto, e sem ele o corte nao estaria medindo nada.

    Um teto que cortasse tambem o pedido legitimo daria o mesmo `seconds` nos dois casos e
    seria indistinguivel de um `sleep(cap)` fixo. Aqui `299` passa inteiro e `301` e cortado —
    **1 segundo de diferenca no pedido, dois `source` diferentes.**
    """
    abaixo = POLICY.decide(throttle_index=0, retry_after_seconds=299.0)
    acima = POLICY.decide(throttle_index=0, retry_after_seconds=301.0)

    assert abaixo.source != acima.source
    assert abaixo.seconds == 299.0
    assert abaixo.source is RecoilSource.RETRY_AFTER
    assert abaixo.honoured_in_full is True
    assert acima.seconds == 300.0
    assert acima.source is RecoilSource.RETRY_AFTER_CAPPED
    assert acima.unmet_seconds == 1.0


def test_exactly_the_cap_is_served_in_full_and_not_cut() -> None:
    """A fronteira exata: `Retry-After == cap_seconds` cabe, e nao vira corte.

    `>` e nao `>=` no ramo do teto, pela mesma razao que a fronteira do `Retry-After` contra a
    escalacao usa `>=`: cortar o que cabe exato marcaria como truncado um pedido servido
    inteiro, e `unmet_seconds` passaria a mentir em zero.
    """
    decision = POLICY.decide(throttle_index=0, retry_after_seconds=300.0)

    assert decision.seconds == 300.0
    assert decision.source is RecoilSource.RETRY_AFTER
    assert decision.honoured_in_full is True


@pytest.mark.parametrize(
    "retry_after",
    [None, 0.0, 1.0, 59.0, 60.0, 61.0, 299.0, 300.0, 301.0, 86_400.0, 2_270_908_800.0],
)
@pytest.mark.parametrize("throttle_index", [0, 1, 2, 3, 10])
def test_no_decision_ever_exceeds_the_declared_cap(
    retry_after: float | None, throttle_index: int
) -> None:
    """A invariante inteira, varrida: **nenhum** `seconds` passa de `cap_seconds`.

    Venha de onde vier o pedido. 55 combinacoes (11 valores de `Retry-After` x 5 degraus de
    escalacao). O defeito `F1`
    existia porque a garantia estava afirmada para UM caminho — a escalacao propria — e o
    outro caminho nunca foi varrido.
    """
    decision = POLICY.decide(throttle_index=throttle_index, retry_after_seconds=retry_after)

    assert 0.0 <= decision.seconds <= POLICY.cap_seconds
    assert decision.retry_after_present is (retry_after is not None)
    assert decision.unmet_seconds >= 0.0


def test_a_decision_cannot_claim_a_header_it_does_not_carry() -> None:
    """`retry_after_present` e `requested_seconds` sao a MESMA informacao, e nao se separam.

    Sem esta guarda, um chamador poderia construir uma decisao dizendo "o fornecedor pediu" sem
    dizer quanto — e `unmet_seconds` devolveria `0.0`, que e indistinguivel de "servido inteiro".
    """
    with pytest.raises(InvalidRecoilPolicyError, match="same information"):
        RecoilDecision(
            seconds=60.0,
            source=RecoilSource.RETRY_AFTER,
            retry_after_present=True,
            requested_seconds=None,
        )
    with pytest.raises(InvalidRecoilPolicyError, match="same information"):
        RecoilDecision(
            seconds=60.0,
            source=RecoilSource.POLICY_NO_RETRY_AFTER,
            retry_after_present=False,
            requested_seconds=60.0,
        )
