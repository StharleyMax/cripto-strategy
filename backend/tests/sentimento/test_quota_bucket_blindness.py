"""Two of the three buckets are blind, and the registry has to say WHICH and WHY.

`D3.12` is a claim about the world, and the live evidence for it lives in
`docs/context/plataforma-dados/medicao-balde-de-cota-2026-08-29.md`. What this file guards is
the half that CAN be guarded offline: that the declaration never quietly loses the count, and
that a blind bucket can never be committed without a written cause.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.bucket_coupling import (
    CouplingSample,
    CouplingVerdict,
    InvalidCouplingSampleError,
    measure_coupling,
)
from src.modules.sentimento.domain.quota_bucket import (
    BINANCE_FAPI,
    BINANCE_FUTURES_DATA,
    COINALYZE,
    KNOWN_BUCKETS,
    BucketVisibility,
    QuotaBucket,
    UnknownBucketError,
    blind_buckets,
    bucket_by_identifier,
)


def test_two_of_the_three_buckets_are_blind() -> None:
    """The count in this task's title, asserted rather than written in prose."""
    assert len(KNOWN_BUCKETS) == 3
    assert len(blind_buckets()) == 2
    assert {bucket.identifier for bucket in blind_buckets()} == {
        "binance-futures-data",
        "coinalyze",
    }


def test_the_one_observable_bucket_is_the_one_that_publishes_a_counter() -> None:
    """And it is NOT the one the screener lives in — which is the expensive half of the finding."""
    observable = [bucket for bucket in KNOWN_BUCKETS if not bucket.is_blind]

    assert observable == [BINANCE_FAPI]
    assert BINANCE_FAPI.counter_header == "x-mbx-used-weight-1m"
    assert BINANCE_FUTURES_DATA.counter_header is None
    assert COINALYZE.counter_header is None


def test_every_blind_bucket_carries_a_written_reason() -> None:
    """A blindness with no cause cannot be told from "nobody looked" — the whole point."""
    for bucket in blind_buckets():
        assert bucket.blindness_reason
        assert len(bucket.blindness_reason) > 40


def test_a_bucket_cannot_be_declared_blind_and_publish_a_counter() -> None:
    """The two halves of the declaration are checked against each other at construction."""
    with pytest.raises(ValueError, match="BLIND with a counter header"):
        QuotaBucket(
            identifier="impossivel",
            host="example.invalid",
            path_prefix="/x/",
            visibility=BucketVisibility.BLIND,
            counter_header="x-mbx-used-weight-1m",
            blindness_reason="motivo qualquer suficientemente longo para passar",
        )


def test_a_bucket_cannot_be_declared_blind_without_saying_why() -> None:
    """A blind bucket with an empty reason is refused, not accepted with a shrug."""
    with pytest.raises(ValueError, match="without the reason written"):
        QuotaBucket(
            identifier="impossivel",
            host="example.invalid",
            path_prefix="/x/",
            visibility=BucketVisibility.BLIND,
            counter_header=None,
            blindness_reason=None,
        )


def test_an_observed_bucket_cannot_carry_a_blindness_reason() -> None:
    """The other side of the same guard: a contradictory declaration fails either way round."""
    with pytest.raises(ValueError, match="OBSERVED without a counter header"):
        QuotaBucket(
            identifier="impossivel",
            host="example.invalid",
            path_prefix="/x/",
            visibility=BucketVisibility.OBSERVED,
            counter_header="x-mbx-used-weight-1m",
            blindness_reason="isto nao deveria existir num balde observado",
        )


def test_the_registry_is_closed() -> None:
    """An unknown identifier names what IS declared instead of failing with a bare KeyError."""
    assert bucket_by_identifier("coinalyze") is COINALYZE
    with pytest.raises(UnknownBucketError, match="binance-fapi"):
        bucket_by_identifier("bybit-v5")


def test_the_coupling_control_gives_different_answers_on_the_two_sides() -> None:
    """The same subtraction, the same n — and it must separate shared from separate."""
    shared = measure_coupling(
        CouplingSample(
            baseline_before=10,
            baseline_after=12,
            loaded_before=12,
            loaded_after=24,
            blind_requests=10,
        )
    )
    separate = measure_coupling(
        CouplingSample(
            baseline_before=10,
            baseline_after=12,
            loaded_before=12,
            loaded_after=14,
            blind_requests=10,
        )
    )

    assert shared.baseline_delta == separate.baseline_delta == 2
    # Same order of argument as the ledger control: the DIFFERENCE is asserted first.
    assert shared.verdict != separate.verdict
    assert shared.verdict is CouplingVerdict.SHARED
    assert shared.weight_per_blind_request == 1.0
    assert separate.verdict is CouplingVerdict.SEPARATE
    assert separate.weight_per_blind_request == 0.0


def test_a_window_reset_between_readings_is_inconclusive_and_never_zero() -> None:
    """A negative delta means the rolling minute rolled: the pair spans two windows."""
    result = measure_coupling(
        CouplingSample(
            baseline_before=2380,
            baseline_after=4,
            loaded_before=4,
            loaded_after=16,
            blind_requests=10,
        )
    )

    assert result.verdict is CouplingVerdict.INCONCLUSIVE
    assert result.weight_per_blind_request is None


def test_a_missing_counter_reading_is_inconclusive() -> None:
    """No reading is not a reading of zero."""
    result = measure_coupling(
        CouplingSample(
            baseline_before=None,
            baseline_after=12,
            loaded_before=12,
            loaded_after=24,
            blind_requests=10,
        )
    )

    assert result.verdict is CouplingVerdict.INCONCLUSIVE


def test_a_coupling_sample_with_no_load_is_refused() -> None:
    """Without load the two pairs are the SAME experiment, and would answer SEPARATE always."""
    with pytest.raises(InvalidCouplingSampleError, match="control would yield"):
        CouplingSample(
            baseline_before=10,
            baseline_after=12,
            loaded_before=12,
            loaded_after=14,
            blind_requests=0,
        )


def test_the_live_readings_of_the_measurement_recompute_to_separate() -> None:
    """The committed raw record, recomputed — the number in the document is not the authority.

    `docs/context/plataforma-dados/medicoes/T-03.7-balde-de-cota/04_acoplamento.json` holds
    `readings_baseline_before_after_loaded_before_after = [2, 4, 6, 8]` with `blind_requests=20`
    `[MEDIDO 2026-08-29T15:00Z]`. Both deltas are 2 — the self-cost of one `depth?limit=5` read,
    which `02_peso_de_fapi_depth.txt` measured as 5 -> 7 -> 9.
    """
    result = measure_coupling(
        CouplingSample(
            baseline_before=2, baseline_after=4, loaded_before=6, loaded_after=8, blind_requests=20
        )
    )

    assert result.verdict is CouplingVerdict.SEPARATE
    assert result.baseline_delta == result.loaded_delta == 2
    assert result.weight_per_blind_request == 0.0


def test_comparing_the_loaded_delta_against_zero_would_have_proved_sharing() -> None:
    """The vice the baseline exists to remove, reproduced on the SAME live readings.

    The observed read costs weight ITSELF, so a baseline of zero attributes that self-cost to
    the blind load and reports `SHARED` with a fabricated `0,1` of weight per blind call. The
    first unbased attempt of this task measured exactly that
    `[MEDIDO 2026-08-29: reconhecimento sem base -> delta 3, veredito "compartilhado"]`.
    Same subtraction, same `n`, opposite verdict: the control is the baseline, not the read.
    """
    against_zero = measure_coupling(
        CouplingSample(
            baseline_before=6, baseline_after=6, loaded_before=6, loaded_after=8, blind_requests=20
        )
    )
    against_baseline = measure_coupling(
        CouplingSample(
            baseline_before=2, baseline_after=4, loaded_before=6, loaded_after=8, blind_requests=20
        )
    )

    assert against_zero.verdict is CouplingVerdict.SHARED
    assert against_zero.weight_per_blind_request == 0.1
    assert against_baseline.verdict is CouplingVerdict.SEPARATE
    # Compared by `.value`: `mypy --strict` PROVES the two branches cannot be the same
    # verdict (`comparison-overlap` on `is not`), which is the two-sidedness checked at type
    # level; the runtime assertion keeps it visible in the test's own output.
    assert against_zero.verdict.value != against_baseline.verdict.value
