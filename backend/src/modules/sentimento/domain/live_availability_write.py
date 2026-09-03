"""`D6.3`: the write rule for a live row whose endpoint has no measured `lag_ms`."""

# `SPEC-001` §5.2, literal: "endpoint sem `lag_ms` medido grava `available_at = NULL`,
# `availability_source = MODELED`, e a série nasce isolada. Nunca `event_time`, nunca
# `event_time + interval` — esse é o default 361x otimista gravado nas linhas do go-forward,
# as que não se recapturam."
#
# This module owns exactly that rule, and nothing past it: the OTHER branch of `SPEC-001` §5.2
# — an endpoint whose `lag_ms` IS measured, stamped from `próximo ponto da grade nativa >=
# bucket_end + p99_lag(endpoint, observer_region) + margem` — is a different computation (grid
# resolution, a margin, `LagSummaryRow.lag_p99_ms`) that this task's DoD (`D6.3`) does not ask
# for and that this module refuses rather than approximates
# (`MeasuredLagCannotUseUnmeasuredPathError` below).
#
# THE RETURN TYPE IS THE ENFORCEMENT. `resolve_unmeasured_endpoint_availability` returns
# `tuple[None, AvailabilitySource]` — there is no `int` branch this function can produce, so a
# caller cannot smuggle `event_time_ms` or `event_time_ms + bucket_interval_ms` through it even
# by accident. `SPEC-001` §5.2 measured that default as 361x optimistic; the fix here is not a
# check that rejects that value after the fact, it is a signature that cannot emit it.

from __future__ import annotations

from src.modules.sentimento.domain.availability_lag_stats import LagSummaryRow
from src.modules.sentimento.domain.provenance import AvailabilitySource

# The one value this module ever returns for `available_at` — spelled out as a constant so the
# falsifying test can assert against IT rather than against a bare literal `None` scattered
# through the test file.
UNMEASURED_AVAILABLE_AT: None = None


class MeasuredLagCannotUseUnmeasuredPathError(Exception):
    """Refused: `resolve_unmeasured_endpoint_availability` was called for a MEASURED endpoint.

    `SPEC-001` §5.2's other branch (the MODELED formula rounded to the native grid) is a
    different computation this module does not implement (see the module docstring) — raising
    here is preferred over silently falling through to the unmeasured answer, which would
    mislabel a series that in fact has calibration as `available_at = NULL` for no reason.
    """


def resolve_unmeasured_endpoint_availability(
    *, lag_summary: LagSummaryRow | None
) -> tuple[None, AvailabilitySource]:
    """Return `(None, MODELED)` for an endpoint with no measured `lag_ms` — `SPEC-001` §5.2.

    `lag_summary` is `None` when the endpoint has never been polled by the availability probe
    at all (`Q19`/`T-03.6`'s `availability_probe_set` never covered it — the Coinalyze case,
    `SPEC-001` §5.2's own example) and is a `LagSummaryRow` with `lag_n == 0` when it WAS
    polled but no transition was ever classified (`lag_n=0 <=> lag_p99_ms=None`,
    `LagSummaryRow.__post_init__`). Both are "no `lag_ms` measured", and both take this branch.

    A `lag_summary` with `lag_n > 0` is a MEASURED endpoint, and this function refuses it
    (`MeasuredLagCannotUseUnmeasuredPathError`) rather than silently taking the wrong branch —
    the caller is expected to have already checked `lag_summary is None or lag_summary.lag_n
    == 0` before reaching here, exactly the same shape `reject_clock_skew` in `provenance.py`
    uses: a precondition violation is a caller bug, not data this function should paper over.
    """
    if lag_summary is not None and lag_summary.lag_n > 0:
        raise MeasuredLagCannotUseUnmeasuredPathError(
            f"endpoint '{lag_summary.endpoint}' ({lag_summary.observer_region}) has "
            f"lag_n={lag_summary.lag_n} measured transitions: this function only decides the "
            f"UNMEASURED branch of `SPEC-001` §5.2's write rule (`T-06.6`'s scope); a measured "
            f"endpoint's `available_at` is a different, out-of-scope computation"
        )
    return UNMEASURED_AVAILABLE_AT, AvailabilitySource.MODELED
