"""The control of `T-03.7`, and it separates two silences that look identical.

"I did not receive a 429" must not read like "I never got the request out".

── THE TWO-SIDED TEST, AND IT IS THE POINT OF THE FILE ────────────────────────────────────

`test_the_control_separates_two_silences_that_look_identical` is the falsifier. It builds two
ledgers with the SAME number of rungs and the SAME number of observed `429`s — zero — and
proves they conclude DIFFERENTLY. A control that gave the same answer on both sides would not
be measuring anything, and this repository has caught that failure twelve times.
"""

from __future__ import annotations

import re

import pytest

from src.modules.sentimento.domain.quota_bucket import (
    BINANCE_FAPI,
    BINANCE_FUTURES_DATA,
    USED_WEIGHT_HEADER,
)
from src.modules.sentimento.domain.ramp_ledger import (
    ProbeObservation,
    RampConclusion,
    RampLedger,
    RampRung,
    RungOutcome,
    observe_rung,
)


def _rungs_from(*observations: ProbeObservation) -> tuple[RampRung, ...]:
    """Turn observations into a numbered sequence of rungs against the blind bucket."""
    return tuple(
        observe_rung(
            index=position,
            bucket=BINANCE_FUTURES_DATA,
            observation=observation,
            elapsed_seconds=0.01,
            now_epoch_seconds=1_800_000_000.0,
        )
        for position, observation in enumerate(observations, start=1)
    )


def test_the_control_separates_two_silences_that_look_identical() -> None:
    """Six rungs, zero 429s on both sides — and the two sides must NOT conclude the same."""
    all_dispatched = RampLedger(
        bucket_identifier=BINANCE_FUTURES_DATA.identifier,
        rungs=_rungs_from(*[ProbeObservation(status=200) for _ in range(6)]),
    )
    none_dispatched = RampLedger(
        bucket_identifier=BINANCE_FUTURES_DATA.identifier,
        rungs=_rungs_from(
            *[ProbeObservation(transport_error="ConnectionResetError: boom") for _ in range(6)]
        ),
    )

    dispatched_verdict = all_dispatched.verdict()
    silent_verdict = none_dispatched.verdict()

    assert len(all_dispatched.rungs) == len(none_dispatched.rungs) == 6
    assert dispatched_verdict.throttled == silent_verdict.throttled == 0
    # The inequality comes FIRST on purpose: it is the claim of the file, and asserting it
    # before the two `is` checks keeps it a comparison rather than a restatement of them.
    assert dispatched_verdict.conclusion != silent_verdict.conclusion
    assert dispatched_verdict.conclusion is RampConclusion.CEILING_NOT_REACHED
    assert silent_verdict.conclusion is RampConclusion.INCONCLUSIVE


def test_a_ceiling_is_never_published_without_an_observed_429() -> None:
    """Only a real `429` entitles anyone to quote a number as the limit."""
    fully_dispatched = RampLedger(
        bucket_identifier=BINANCE_FUTURES_DATA.identifier,
        rungs=_rungs_from(*[ProbeObservation(status=200) for _ in range(4)]),
    ).verdict()

    assert fully_dispatched.publishes_a_ceiling is False
    assert fully_dispatched.throttled_at_request is None
    assert fully_dispatched.accepted_before_throttle is None
    assert "LIMITE INFERIOR" in fully_dispatched.reason


def test_a_single_undispatched_rung_contaminates_the_whole_pass() -> None:
    """Five successes and ONE dead socket do not add up to a lower bound of five."""
    ledger = RampLedger(
        bucket_identifier=BINANCE_FUTURES_DATA.identifier,
        rungs=_rungs_from(
            ProbeObservation(status=200),
            ProbeObservation(status=200),
            ProbeObservation(status=200),
            ProbeObservation(status=200),
            ProbeObservation(status=200),
            ProbeObservation(transport_error="TimeoutError: timed out"),
        ),
    )

    verdict = ledger.verdict()

    assert verdict.dispatched == 5
    assert verdict.not_dispatched == 1
    assert verdict.conclusion is RampConclusion.INCONCLUSIVE


def test_the_first_429_is_the_one_reported_even_when_others_follow() -> None:
    """The ordinal of the FIRST throttle is the measurement; later ones are noise."""
    ledger = RampLedger(
        bucket_identifier=BINANCE_FUTURES_DATA.identifier,
        rungs=_rungs_from(
            ProbeObservation(status=200),
            ProbeObservation(status=200),
            ProbeObservation(status=429),
            ProbeObservation(status=429),
        ),
    )

    verdict = ledger.verdict()

    assert verdict.conclusion is RampConclusion.THROTTLED
    assert verdict.publishes_a_ceiling is True
    assert verdict.throttled_at_request == 3
    assert ledger.first_throttled() is not None


def test_the_ordinal_of_the_429_is_not_the_number_that_fits_in_the_window() -> None:
    """The defect the first live pass exposed, frozen as a regression.

    Against Coinalyze the throttle landed on request 41 with 40 accepted before it
    `[MEDIDO 2026-08-29, `/v1/exchanges`, n=41]`. One field holding `41` would have been read
    as "41 fit", and a broker calibrated on it would overshoot by exactly one request per
    window — forever, and while looking like it was following a measurement.
    """
    ledger = RampLedger(
        bucket_identifier="coinalyze",
        rungs=_rungs_from(
            *[ProbeObservation(status=200) for _ in range(40)],
            ProbeObservation(status=429),
        ),
    )

    verdict = ledger.verdict()

    assert verdict.throttled_at_request == 41
    assert verdict.accepted_before_throttle == 40
    assert verdict.throttled_at_request != verdict.accepted_before_throttle
    assert verdict.accepted_before_throttle == verdict.accepted
    assert "nao 41" in verdict.reason


def test_a_rejected_rung_before_the_429_does_not_count_as_something_that_fit() -> None:
    """A `403` was dispatched and spent the bucket; it is not a request that fit in the window."""
    ledger = RampLedger(
        bucket_identifier="coinalyze",
        rungs=_rungs_from(
            ProbeObservation(status=200),
            ProbeObservation(status=403),
            ProbeObservation(status=200),
            ProbeObservation(status=429),
        ),
    )

    verdict = ledger.verdict()

    assert verdict.throttled_at_request == 4
    assert verdict.accepted_before_throttle == 2
    assert verdict.rejected == 1


def test_a_non_success_status_is_not_counted_as_headroom() -> None:
    """A `403` was dispatched and spent the bucket, and it says nothing about the limit."""
    ledger = RampLedger(
        bucket_identifier=BINANCE_FUTURES_DATA.identifier,
        rungs=_rungs_from(ProbeObservation(status=200), ProbeObservation(status=403)),
    )

    verdict = ledger.verdict()

    assert verdict.accepted == 1
    assert verdict.rejected == 1
    assert verdict.dispatched == 2
    assert verdict.conclusion is RampConclusion.CEILING_NOT_REACHED


def test_an_empty_pass_is_inconclusive_and_not_a_clean_bill() -> None:
    """Zero rungs measured zero things — and must not read as "the limit was not reached"."""
    verdict = RampLedger(bucket_identifier="binance-futures-data", rungs=()).verdict()

    assert verdict.conclusion is RampConclusion.INCONCLUSIVE
    assert verdict.dispatched == 0


def test_the_blind_bucket_reports_a_none_weight_on_every_rung() -> None:
    """The blindness shows up IN THE DATA, not only in the prose around it."""
    blind = RampLedger(
        bucket_identifier=BINANCE_FUTURES_DATA.identifier,
        rungs=_rungs_from(*[ProbeObservation(status=200) for _ in range(3)]),
    )

    assert blind.observed_weights() == (None, None, None)


def test_the_observed_bucket_reports_its_counter_on_every_rung() -> None:
    """The same code path against the OBSERVED bucket must NOT return `None` — the other side."""
    rungs = tuple(
        observe_rung(
            index=position,
            bucket=BINANCE_FAPI,
            observation=ProbeObservation(
                status=200, headers={USED_WEIGHT_HEADER: str(2 * position)}
            ),
            elapsed_seconds=0.01,
            now_epoch_seconds=1_800_000_000.0,
        )
        for position in (1, 2, 3)
    )

    ledger = RampLedger(bucket_identifier=BINANCE_FAPI.identifier, rungs=rungs)

    assert ledger.observed_weights() == (2, 4, 6)


def test_a_counter_that_is_not_a_number_is_absent_and_never_zero() -> None:
    """Zero is a legal consumption; junk is not a consumption at all."""
    rung = observe_rung(
        index=1,
        bucket=BINANCE_FAPI,
        observation=ProbeObservation(status=200, headers={USED_WEIGHT_HEADER: "n/a"}),
        elapsed_seconds=0.01,
        now_epoch_seconds=1_800_000_000.0,
    )

    assert rung.observed_weight is None


def test_an_observation_cannot_be_silent_about_dispatch() -> None:
    """The control is enforced by the TYPE: neither both nor neither is constructible."""
    with pytest.raises(ValueError, match="nao levei 429"):
        ProbeObservation()
    with pytest.raises(ValueError, match="nao levei 429"):
        ProbeObservation(status=200, transport_error="ConnectionResetError: boom")


def test_a_rung_cannot_claim_dispatch_without_a_status() -> None:
    """The same invariant, one layer up, so a hand-built rung cannot forge a dispatch."""
    with pytest.raises(ValueError, match="despachado sem status"):
        RampRung(
            index=1,
            outcome=RungOutcome.ACCEPTED,
            status=None,
            observed_weight=None,
            retry_after_seconds=None,
            elapsed_seconds=0.0,
        )
    with pytest.raises(ValueError, match="nao despachado, mas carrega status"):
        RampRung(
            index=1,
            outcome=RungOutcome.NOT_DISPATCHED,
            status=200,
            observed_weight=None,
            retry_after_seconds=None,
            elapsed_seconds=0.0,
        )


def test_a_redirect_is_never_folded_into_what_fit_in_the_window() -> None:
    """`3xx` spent the bucket without answering the question — `REJECTED`, never `ACCEPTED`.

    The module says so in prose and nothing asserted it: widening `_SUCCESS_RANGE` from
    `range(200, 300)` to `range(200, 400)` SURVIVED the 187-test suite
    `[MEDIDO 2026-08-29, bancada de mutacao do QA, n=18 mutacoes medidas]`.
    """
    ledger = RampLedger(
        bucket_identifier=BINANCE_FUTURES_DATA.identifier,
        rungs=_rungs_from(
            ProbeObservation(status=200),
            ProbeObservation(status=302),
            ProbeObservation(status=429),
        ),
    )

    verdict = ledger.verdict()

    assert ledger.rungs[1].outcome is RungOutcome.REJECTED
    assert verdict.accepted_before_throttle == 1
    assert verdict.rejected == 1


def test_a_pass_with_zero_successes_still_reports_the_ordinal_counters_apart() -> None:
    """The keyless run, and it is a REACHABLE state, not a hypothetical.

    `authentication_headers()` returns NO header when `$COINALYZE_API_KEY` is absent, and its
    own docstring says the provider then answers `401` — `REJECTED`, "dispatched, spent, and
    explicitly not a ceiling".

    ── ⚠️ O CONGELAMENTO DESTE TESTE MUDOU, E DE PROPOSITO ────────────────────────────────

    O `/qa` escreveu-o para congelar o estado de entao
    `[MEDIDO 2026-08-29: 150 degraus 401 -> CEILING_NOT_REACHED, accepted=0, rejected=150]`, e
    apontou no mesmo relatorio que esse estado era metade do defeito `F2`. O conserto (b) —
    que o proprio `/qa` listou como correcao aceitavel — move esta passada para `INCONCLUSIVE`,
    entao a assercao da CONCLUSAO foi atualizada **deliberadamente**, com esta nota.

    **As assercoes que dao nome ao teste ficaram intactas** — `accepted`, `rejected` e
    `publishes_a_ceiling` continuam sendo os contadores separados que ele existe para vigiar.
    Um teste de caracterizacao que fica vermelho quando o comportamento muda de proposito
    esta fazendo exatamente o trabalho dele; o que seria defeito era apaga-lo.
    """
    ledger = RampLedger(
        bucket_identifier="coinalyze",
        rungs=_rungs_from(*[ProbeObservation(status=401) for _ in range(150)]),
    )

    verdict = ledger.verdict()

    assert verdict.conclusion is RampConclusion.INCONCLUSIVE
    assert verdict.accepted == 0
    assert verdict.rejected == 150
    assert verdict.dispatched == 150
    assert verdict.not_dispatched == 0
    assert verdict.publishes_a_ceiling is False
    assert "NENHUMA aceita" in verdict.reason


def test_the_lower_bound_never_counts_requests_that_did_not_succeed() -> None:
    """A number published as a bound must be backed by requests that actually went through.

    Marcador `xfail(strict=True)` do `/qa` removido pelo conserto de `F2`. Antes, esta passada
    caia em `CEILING_NOT_REACHED` e publicava *"LIMITE INFERIOR de 150"* com `accepted=0`
    `[MEDIDO 2026-08-29 pelo /qa]`. Hoje ela nao publica piso nenhum.
    """
    verdict = RampLedger(
        bucket_identifier="coinalyze",
        rungs=_rungs_from(*[ProbeObservation(status=401) for _ in range(150)]),
    ).verdict()

    if verdict.conclusion is not RampConclusion.CEILING_NOT_REACHED:
        assert re.search(r"LIMITE INFERIOR de (\d+)", verdict.reason) is None
        return
    published = re.search(r"LIMITE INFERIOR de (\d+)", verdict.reason)
    assert published is not None
    assert int(published.group(1)) <= verdict.accepted


def test_the_published_lower_bound_is_accepted_and_not_dispatched() -> None:
    """O conserto (a) de `F2`, medido no ponto onde as duas grandezas DIVERGEM.

    149 aceitas + 1 recusada: `dispatched` e 150 e `accepted` e 149. Antes o piso publicado era
    150 — um numero sustentado por uma requisicao que nao passou. **Se os dois contadores
    fossem iguais aqui, este teste nao estaria medindo nada**, e e por isso que ele usa uma
    passada mista em vez de uma passada limpa.
    """
    verdict = RampLedger(
        bucket_identifier="coinalyze",
        rungs=_rungs_from(
            *[ProbeObservation(status=200) for _ in range(149)],
            ProbeObservation(status=401),
        ),
    ).verdict()

    assert verdict.conclusion is RampConclusion.CEILING_NOT_REACHED
    assert verdict.dispatched == 150
    assert verdict.accepted == 149
    assert verdict.dispatched != verdict.accepted
    published = re.search(r"LIMITE INFERIOR de (\d+)", verdict.reason)
    assert published is not None
    assert int(published.group(1)) == 149


def test_the_two_branches_answer_the_same_question_with_the_same_grandeza() -> None:
    """A classe inteira do defeito, afirmada de uma vez: **os dois ramos publicam ACEITAS**.

    `F2` e o off-by-one eram o mesmo par ("quantas couberam" x "quantas foram despachadas")
    em dois ramos do mesmo metodo. Este teste compara os ramos entre si em vez de cada um
    contra uma constante, que e o unico jeito de a divergencia nao voltar por um lado so.
    """
    com_429 = RampLedger(
        bucket_identifier="coinalyze",
        rungs=_rungs_from(
            *[ProbeObservation(status=200) for _ in range(40)],
            ProbeObservation(status=401),
            ProbeObservation(status=429),
        ),
    ).verdict()
    sem_429 = RampLedger(
        bucket_identifier="coinalyze",
        rungs=_rungs_from(
            *[ProbeObservation(status=200) for _ in range(40)],
            ProbeObservation(status=401),
        ),
    ).verdict()

    # O ramo THROTTLED: 41 degraus antes do 429, mas 40 ACEITAS.
    assert com_429.throttled_at_request == 42
    assert com_429.accepted_before_throttle == 40
    # O ramo CEILING_NOT_REACHED: 41 despachadas, mas o piso publicado e 40.
    assert sem_429.dispatched == 41
    published = re.search(r"LIMITE INFERIOR de (\d+)", sem_429.reason)
    assert published is not None
    assert int(published.group(1)) == 40
    # E a igualdade que fecha a classe: os dois ramos, o mesmo numero.
    assert int(published.group(1)) == com_429.accepted_before_throttle
