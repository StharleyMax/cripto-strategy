"""The bench for `T-03.7`: the only entry point that spends a third party's quota."""

# ── THIS IS NOT A TEST, AND IT MUST NEVER BECOME ONE ───────────────────────────────────────
#
# `backend/scripts/test.sh` declares "ZERO REDE" and the suite runs with `socket` amputated. A
# live ramp against Binance cannot live there and should not: it is a MEASUREMENT taken once, by
# a human, at a known moment, from a known address. What the suite owns is the LOGIC this module
# wires together — the climb, the recoil, the ledger's refusal to name a ceiling it did not see —
# and every one of those is exercised offline through injected ports.
#
# ── THE THREE COMMANDS, AND WHY THEY ARE THREE ─────────────────────────────────────────────
#
#   headers   one request per bucket, every header printed. This is `D3.12`: the evidence that
#             two of the three buckets publish NO counter.
#   coupling  the control of `D3.11`'s topology question. It reads the OBSERVED counter, spends
#             the BLIND family, and reads again — with a baseline that removes the load, because
#             comparing against zero would "prove" sharing every time.
#   ramp      the climb to the first `429`, with recoil. `D3.11`.
#
# `coupling` runs first by intent: it answers the topology question WITHOUT provoking anyone,
# and a `ramp` is only worth its cost once the topology is known.
#
# ── OUTPUT IS ONE JSON OBJECT PER LINE, ON `stdout` ────────────────────────────────────────
#
# Same contract as `infra/ingest_health_cli.py`, and for the same reason: the bytes are the
# record. Diagnostics go to `stderr` so a host that configured INFO on `stdout` cannot
# contaminate the first line.

from __future__ import annotations

import json
import logging
import os
import sys
from collections.abc import Mapping, Sequence
from dataclasses import asdict
from typing import Final

from src.modules.sentimento.domain.quota_bucket import (
    BINANCE_FAPI,
    KNOWN_BUCKETS,
    bucket_by_identifier,
)
from src.modules.sentimento.domain.ramp_plan import RampPlan
from src.modules.sentimento.domain.recoil_policy import RecoilPolicy
from src.modules.sentimento.infra.https_quota_probe import HttpsQuotaProbe
from src.modules.sentimento.infra.system_ramp_clock import SystemRampClock
from src.modules.sentimento.use_cases.probe_bucket_coupling import (
    CouplingPlan,
    probe_bucket_coupling,
)
from src.modules.sentimento.use_cases.run_quota_ramp import (
    QuotaProbe,
    RampClock,
    run_quota_ramp,
)

# ── `__spec__.name` AND NOT `__name__`, AND THE DIFFERENCE WAS MEASURED, NOT FEARED ────────
#
# Run as `python -m src.modules.sentimento.infra.quota_ramp_cli`, `__name__` is `"__main__"`.
# Deriving the application logger from it yields `"__main__"` TOO — the same logger the product
# output uses — so `route_diagnostics_away_from_the_product_stream()` attaches the `stderr`
# handler to the product logger and EVERY canonical line is emitted twice, once on each stream.
#
# `[MEDIDO 2026-08-29, primeira rodada ao vivo desta task: `... quota_ramp_cli headers`
#  > stdout 2> stderr -> as 3 linhas JSON apareceram nos DOIS arquivos]`. `__spec__.name` is
# the real dotted name under both `-m` and a plain import, so the two loggers stay distinct.
#
# This matters beyond tidiness: `ADR-008/DoD-2` hashes the bytes of a CLI's `stdout`, and a
# duplicated line matches no `sha256` at all. The same latent shape exists in
# `infra/ingest_health_cli.py`; it is NOT touched here, because that file belongs to `T-01.1`
# and fixing somebody else's module inside this task would be scope this task did not declare.
# Named as a debt instead of silently repaired: `ingest_health_cli.py:_APPLICATION_LOGGER`.
_MODULE: Final[str] = __spec__.name if __spec__ is not None else __name__

logger = logging.getLogger(_MODULE)

_STABLE_FORMAT: Final[str] = "%(message)s"
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"
_APPLICATION_LOGGER: Final[str] = _MODULE.split(".")[0]

# `uso: …` STAYS IN PORTUGUESE: `SPEC-001` §3.8 reserves pt-BR for microcopy, and an
# operator-facing usage line is microcopy. Every identifier around it is English.
_USAGE: Final[str] = (
    "uso: quota_ramp_cli headers | quota_ramp_cli coupling <n> | "
    "quota_ramp_cli ramp <balde> <max-requisicoes>"
)

# The path each bucket is probed on. This is a COMPOSITION-ROOT decision and it belongs here
# rather than in the domain: which endpoint we are willing to spend is an operational choice,
# and it changes with what we are trying to learn.
#
# Each one is the CHEAPEST request that still lands in the intended family:
#   `/fapi/v1/depth?limit=5`      weight 2, 295 B  — the observed family's own cost, measured
#   `/futures/data/openInterestHist?limit=1`      — the screener's family, 1 symbol per call
#   `/v1/exchanges`                                — Coinalyze's smallest authenticated read
_PROBE_PATHS: Final[Mapping[str, str]] = {
    "binance-fapi": "/fapi/v1/depth?symbol=BTCUSDT&limit=5",
    "binance-futures-data": "/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1",
    "coinalyze": "/v1/exchanges",
}

# Conservative by declaration. The ramp starts at one request per second and floors at four per
# second; it never bursts, and `max_requests` is supplied by the operator so that the ceiling
# of the load is a typed argument rather than a constant somebody has to go read.
_INITIAL_INTERVAL_SECONDS: Final[float] = 1.0
_INTERVAL_FACTOR: Final[float] = 0.93
_MIN_INTERVAL_SECONDS: Final[float] = 0.25

_RECOIL: Final[RecoilPolicy] = RecoilPolicy(base_seconds=60.0, factor=2.0, cap_seconds=300.0)


def emit(payload: Mapping[str, object]) -> str:
    """Write one canonical JSON line and return it, so the caller can hash what was written."""
    line = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    logger.info(line)
    return line


def command_headers(probe: QuotaProbe) -> int:
    """Emit every header of one response per bucket — the raw evidence of `D3.12`."""
    for bucket in KNOWN_BUCKETS:
        observation = probe.probe(bucket, _PROBE_PATHS[bucket.identifier])
        emit(
            {
                "command": "headers",
                "bucket": bucket.identifier,
                "path": _PROBE_PATHS[bucket.identifier],
                "declared_visibility": bucket.visibility.value,
                "status": observation.status,
                "transport_error": observation.transport_error,
                "counter_header_present": observation.header(bucket.counter_header) is not None,
                "quota_headers_seen": sorted(
                    name for name in observation.headers if name.startswith("x-mbx-")
                ),
                "headers": dict(sorted(observation.headers.items())),
            }
        )
    return 0


def command_coupling(probe: QuotaProbe, clock: RampClock, blind_requests: int) -> int:
    """Resolve whether `/fapi/v1/*` and `/futures/data/*` spend the SAME bucket."""
    blind = bucket_by_identifier("binance-futures-data")
    plan = CouplingPlan(
        observed_bucket=BINANCE_FAPI,
        observed_path=_PROBE_PATHS[BINANCE_FAPI.identifier],
        blind_bucket=blind,
        blind_path=_PROBE_PATHS[blind.identifier],
        blind_requests=blind_requests,
        interval_seconds=_MIN_INTERVAL_SECONDS,
    )
    run = probe_bucket_coupling(plan, probe, clock)
    emit(
        {
            "command": "coupling",
            "observed_bucket": BINANCE_FAPI.identifier,
            "blind_bucket": blind.identifier,
            "readings_baseline_before_after_loaded_before_after": list(run.readings),
            "load_planned": blind_requests,
            "load_delivered": run.load.delivered,
            "load_failures": list(run.load.failures),
            **asdict(run.result),
            "verdict": run.result.verdict.value,
        }
    )
    return 0


def command_ramp(probe: QuotaProbe, clock: RampClock, identifier: str, ceiling: int) -> int:
    """Climb the named bucket to the first `429`, then back off exactly once."""
    bucket = bucket_by_identifier(identifier)
    plan = RampPlan(
        bucket=bucket,
        path=_PROBE_PATHS[identifier],
        max_requests=ceiling,
        initial_interval_seconds=_INITIAL_INTERVAL_SECONDS,
        interval_factor=_INTERVAL_FACTOR,
        min_interval_seconds=_MIN_INTERVAL_SECONDS,
    )
    run = run_quota_ramp(plan, probe, clock, _RECOIL)
    verdict = run.ledger.verdict()
    emit(
        {
            "command": "ramp",
            "bucket": bucket.identifier,
            "path": plan.path,
            "declared_visibility": bucket.visibility.value,
            "max_requests": ceiling,
            **{key: value for key, value in asdict(verdict).items() if key != "conclusion"},
            "conclusion": verdict.conclusion.value,
            "publishes_a_ceiling": verdict.publishes_a_ceiling,
            "recoil_seconds": run.recoil.seconds if run.recoil else None,
            "recoil_source": run.recoil.source.value if run.recoil else None,
            "retry_after_present": run.recoil.retry_after_present if run.recoil else None,
            # `F1` (/qa 2026-08-29): sem estes dois, uma passada em que o teto cortou o pedido
            # do fornecedor sairia do registro indistinguivel de uma servida inteira — e a
            # passada ao vivo e a unica fonte que `T-07.7` vai ter.
            "retry_after_requested_seconds": run.recoil.requested_seconds if run.recoil else None,
            "recoil_unmet_seconds": run.recoil.unmet_seconds if run.recoil else None,
            "recoil_honoured_in_full": run.recoil.honoured_in_full if run.recoil else None,
            "observed_weights": list(run.ledger.observed_weights()),
            "rungs": [asdict(rung) | {"outcome": rung.outcome.value} for rung in run.ledger.rungs],
        }
    )
    return 0


def route_diagnostics_away_from_the_product_stream() -> None:
    """Send this application's diagnostics to `stderr`, so `stdout` is the record ALONE."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(_DIAGNOSTIC_FORMAT))
    application = logging.getLogger(_APPLICATION_LOGGER)
    application.addHandler(handler)
    application.propagate = False


def _configure_product_stream() -> None:
    """Give the product logger `stdout` with the stable format, and stop it propagating."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_STABLE_FORMAT))
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False


def dispatch(argv: Sequence[str], probe: QuotaProbe, clock: RampClock) -> int:
    """Route one command, refusing anything the usage line does not name."""
    if not argv:
        raise SystemExit(_USAGE)
    command, arguments = argv[0], argv[1:]
    if command == "headers" and not arguments:
        return command_headers(probe)
    if command == "coupling" and len(arguments) == 1:
        return command_coupling(probe, clock, int(arguments[0]))
    if command == "ramp" and len(arguments) == 2:
        return command_ramp(probe, clock, arguments[0], int(arguments[1]))
    raise SystemExit(_USAGE)


def main(argv: Sequence[str]) -> int:
    """Compose the real probe and the real clock, then dispatch."""
    route_diagnostics_away_from_the_product_stream()
    _configure_product_stream()
    probe = HttpsQuotaProbe(environment=os.environ)
    try:
        return dispatch(argv, probe, SystemRampClock())
    finally:
        probe.close()


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
