"""`D6.3`: an endpoint with no measured `lag_ms` writes `NULL` + `MODELED`, never an approximation.

`SPEC-001` §5.2, literal: "Nunca `event_time`, nunca `event_time + interval`" — the default it
measures as **361x otimista**. The falsifier below plants both forbidden approximations as
plausible-looking candidates and shows the function's OUTPUT TYPE makes returning either one
impossible, not merely unlikely.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.availability_lag_stats import LagSummaryRow
from src.modules.sentimento.domain.live_availability_write import (
    MeasuredLagCannotUseUnmeasuredPathError,
    resolve_unmeasured_endpoint_availability,
)
from src.modules.sentimento.domain.provenance import AvailabilitySource


def test_no_lag_summary_at_all_writes_null_and_modeled() -> None:
    """The Coinalyze case, literal: the endpoint was never in `Q19`'s probe set at all."""
    available_at, source = resolve_unmeasured_endpoint_availability(lag_summary=None)

    assert available_at is None
    assert source is AvailabilitySource.MODELED


def test_a_summary_with_zero_transitions_also_writes_null_and_modeled() -> None:
    """Polled but never classified a transition (`lag_n=0`) is STILL "no `lag_ms` measured"."""
    summary = LagSummaryRow(
        endpoint="openInterestHist",
        observer_region="unknown",
        lag_stat="p99",
        lag_p99_ms=None,
        lag_n=0,
        lag_resolution_s=10.0,
        lag_window_s=600,
        total_polls=42,
    )

    available_at, source = resolve_unmeasured_endpoint_availability(lag_summary=summary)

    assert available_at is None
    assert source is AvailabilitySource.MODELED


@pytest.mark.parametrize(
    ("event_time_ms", "bucket_interval_ms"),
    [(1_700_000_000_000, 300_000), (0, 60_000), (1_893_456_000_000, 86_400_000)],
)
def test_the_output_is_never_event_time_nor_event_time_plus_interval(
    event_time_ms: int, bucket_interval_ms: int
) -> None:
    """`D6.3`'s own words made literal: neither forbidden approximation is ever the answer.

    The function does not even ACCEPT `event_time_ms`/`bucket_interval_ms` as arguments — this
    test proves the point from the caller's side: no matter which candidate a caller might have
    been tempted to compute upstream, the value this function actually returns is `None`,
    which cannot equal either forbidden approximation for any input.
    """
    available_at, _ = resolve_unmeasured_endpoint_availability(lag_summary=None)

    assert available_at != event_time_ms
    assert available_at != event_time_ms + bucket_interval_ms
    assert available_at is None


def test_a_measured_endpoint_refuses_the_unmeasured_path_instead_of_silently_taking_it() -> None:
    """The falsifier's other half: a MEASURED endpoint must not fall through to `NULL`+`MODELED`.

    If this raised nothing and returned `(None, MODELED)` anyway, the function would mislabel
    every series whose lag genuinely IS calibrated — exactly the "abre quando dois termos
    passam" failure mode `D6.2`'s falsifier names for the predicate, one layer over on the
    write side.
    """
    measured = LagSummaryRow(
        endpoint="openInterestHist",
        observer_region="unknown",
        lag_stat="p99",
        lag_p99_ms=1_500,
        lag_n=12,
        lag_resolution_s=10.0,
        lag_window_s=600,
        total_polls=60,
    )

    with pytest.raises(MeasuredLagCannotUseUnmeasuredPathError, match="lag_n=12"):
        resolve_unmeasured_endpoint_availability(lag_summary=measured)
