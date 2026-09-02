"""Read the blind bucket's consumption THROUGH the observed one, with the control attached."""

# The pair of readings and the arithmetic live in `domain/bucket_coupling.py`. What lives here
# is the ORDER of the requests, and the order is the whole experiment: baseline first with the
# load removed, then the identical pair with the load inserted between the two readings.
#
# Both halves spend exactly TWO observed requests, which is what makes their deltas subtractable.
# Change that and the control stops controlling.

from __future__ import annotations

import logging
from dataclasses import dataclass

from src.modules.sentimento.domain.bucket_coupling import (
    CouplingResult,
    CouplingSample,
    CouplingVerdict,
    measure_coupling,
)
from src.modules.sentimento.domain.quota_bucket import QuotaBucket
from src.modules.sentimento.use_cases.run_quota_ramp import QuotaProbe, RampClock

# DEBUG and not INFO, for the reason `infra/ingest_health_cli.py` documents at length: a host
# that configures INFO on `stdout` must not find this layer's diagnostics mixed into product
# output. The absence of a reading is reported to the CALLER as data; this logger only carries
# the cause, for a human who asked for it.
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CouplingPlan:
    """Which two path families to compare, and how hard to load the blind one."""

    observed_bucket: QuotaBucket
    observed_path: str
    blind_bucket: QuotaBucket
    blind_path: str
    blind_requests: int
    interval_seconds: float


@dataclass(frozen=True)
class LoadDelivered:
    """How much load actually reached the provider, and every failure that reduced it.

    The failures are CARRIED, not discarded. A load call that never left the machine lowers the
    real load below the planned one, and a verdict computed against the PLANNED count would
    divide by a denominator that did not happen.
    """

    delivered: int
    failures: tuple[str, ...]


@dataclass(frozen=True)
class CouplingRun:
    """The verdict, the four raw counter readings, and the load that was really delivered."""

    result: CouplingResult
    readings: tuple[int | None, int | None, int | None, int | None]
    load: LoadDelivered


def _read_counter(probe: QuotaProbe, bucket: QuotaBucket, path: str) -> int | None:
    """Take one reading of the observed bucket's own counter, or `None` if it is not there."""
    try:
        observation = probe.probe(bucket, path)
    except OSError as failure:
        # NOT discarded, and not turned into a number either. `None` is what this measurement
        # DEFINES as "no reading", and `_delta` in the domain converts it into `INCONCLUSIVE`
        # instead of into a zero. The cause is handled here — recorded against this module's
        # own logger — because the alternative, letting it propagate, would destroy the three
        # readings already taken.
        logger.debug("leitura do contador de %s falhou: %s", bucket.identifier, failure)
        return None
    raw = observation.header(bucket.counter_header)
    if raw is None:
        return None
    try:
        return int(raw.strip())
    except ValueError:
        return None


def _spend_blind(plan: CouplingPlan, probe: QuotaProbe, clock: RampClock) -> LoadDelivered:
    """Spend the blind bucket at the declared cadence, counting what actually got through."""
    delivered = 0
    failures: list[str] = []
    for attempt in range(plan.blind_requests):
        try:
            probe.probe(plan.blind_bucket, plan.blind_path)
        except OSError as failure:
            failures.append(f"carga {attempt + 1}: {type(failure).__name__}: {failure}")
        else:
            delivered += 1
        if attempt + 1 < plan.blind_requests:
            clock.sleep(plan.interval_seconds)
    return LoadDelivered(delivered=delivered, failures=tuple(failures))


def _no_load_result(load: LoadDelivered) -> CouplingResult:
    """Refuse a verdict when nothing was actually spent on the blind bucket."""
    return CouplingResult(
        verdict=CouplingVerdict.INCONCLUSIVE,
        baseline_delta=None,
        loaded_delta=None,
        blind_requests=0,
        weight_per_blind_request=None,
        reason=(
            f"nenhuma das {len(load.failures)} chamada(s) de carga chegou ao fornecedor: sem "
            "carga entregue, os dois pares medem a mesma coisa e o controle nao controla"
        ),
    )


def probe_bucket_coupling(plan: CouplingPlan, probe: QuotaProbe, clock: RampClock) -> CouplingRun:
    """Run baseline then loaded, and return the verdict with its four raw readings."""
    if not plan.blind_bucket.is_blind:
        raise ValueError(
            f"bucket {plan.blind_bucket.identifier!r} is not blind: if it publishes its own "
            "counter, read it instead of inferring it from its neighbor"
        )
    baseline_before = _read_counter(probe, plan.observed_bucket, plan.observed_path)
    clock.sleep(plan.interval_seconds)
    baseline_after = _read_counter(probe, plan.observed_bucket, plan.observed_path)
    clock.sleep(plan.interval_seconds)
    loaded_before = _read_counter(probe, plan.observed_bucket, plan.observed_path)
    load = _spend_blind(plan, probe, clock)
    loaded_after = _read_counter(probe, plan.observed_bucket, plan.observed_path)
    readings = (baseline_before, baseline_after, loaded_before, loaded_after)
    if load.delivered == 0:
        return CouplingRun(result=_no_load_result(load), readings=readings, load=load)
    return CouplingRun(
        result=measure_coupling(
            CouplingSample(
                baseline_before=baseline_before,
                baseline_after=baseline_after,
                loaded_before=loaded_before,
                loaded_after=loaded_after,
                blind_requests=load.delivered,
            )
        ),
        readings=readings,
        load=load,
    )
