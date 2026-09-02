"""The bench for `T-03.6`: run the continuous `availability_probe`, print every line, then `p99`.

── THIS IS NOT A TEST, SAME REASON AS `infra/quota_ramp_cli.py` AND `infra/ntp_skew_probe_cli.py`

`backend/scripts/test.sh` declares "ZERO REDE" and the suite runs with `socket` amputated. A
live sweep of Binance and Coinalyze cannot live there: it is a MEASUREMENT, run by a human, at a
known moment. What the suite owns is the LOGIC this module wires together —
`use_cases/run_availability_probe.py`, `domain/availability_lag.classify_transitions`,
`domain/availability_lag_stats.summarize_lag` — every one of them exercised offline through
injected ports.

`plano 03` item 3.4/3.9 (`CA-F0-9`, `CA-F0-3`, `Q19`): this task builds the MECANISMO of the
continuous probe and proves it with a SHORT local run — minutes, not a 24/7 deploy (the VPS is
out of scope by the owner's own decision, `docs/decisoes-do-owner.md` §Q19). `--duration-seconds`
is how long THIS run measures; the mechanism itself has no notion of "done".

── OUTPUT: ONE JSON OBJECT PER LINE, ON `stdout` ──────────────────────────────────────────────

A header, then every raw poll attempt (`D3.4`: every line of the window, never a sample), then
one summary row per `(endpoint, observer_region)` (`D3.2`: `p99`+`n`+`lag_resolution_s`+
`lag_window` as COLUMNS). Diagnostics go to `stderr`, same contract as the rest of this package.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from collections.abc import Sequence
from dataclasses import asdict
from typing import Final

from src.modules.sentimento.domain.availability_lag import classify_transitions
from src.modules.sentimento.domain.availability_lag_stats import summarize_lag
from src.modules.sentimento.domain.availability_poll import AvailabilityPollAttempt
from src.modules.sentimento.domain.availability_probe_set import (
    AVAILABILITY_PROBE_SET,
    AvailabilityProbeSet,
)
from src.modules.sentimento.domain.provenance import UNKNOWN_OBSERVER_REGION
from src.modules.sentimento.infra.availability_http_client import AvailabilityHttpClient
from src.modules.sentimento.infra.system_probe_clock import SystemProbeClock
from src.modules.sentimento.use_cases.run_availability_probe import (
    AvailabilityTransport,
    ProbeClock,
    run_availability_probe,
)

# `__spec__.name`, not `__name__` — `infra/quota_ramp_cli.py` measured that `__name__ ==
# "__main__"` under `python -m` collapses this module's logger onto the product logger and
# duplicates every line on both streams.
_MODULE: Final[str] = __spec__.name if __spec__ is not None else __name__
logger = logging.getLogger(_MODULE)

_STABLE_FORMAT: Final[str] = "%(message)s"
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"
_APPLICATION_LOGGER: Final[str] = _MODULE.split(".")[0]

_USAGE: Final[str] = "uso: availability_probe_cli --duration-seconds N [--observer-region R]"


def emit(payload: object) -> str:
    """Write one canonical JSON line and return it, so the caller can hash what was written."""
    line = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    logger.info(line)
    return line


def _attempt_line(attempt: AvailabilityPollAttempt) -> dict[str, object]:
    """Project one raw attempt onto a flat, JSON-line-friendly shape."""
    outcome = attempt.outcome
    return {
        "line": "attempt",
        "source": attempt.source,
        "endpoint": attempt.endpoint,
        "symbol": attempt.symbol,
        "observer_region": attempt.observer_region,
        "polled_at_ms": attempt.polled_at_ms,
        "status": outcome.status,
        "transport_error": outcome.transport_error,
        "latest_event_time_ms": outcome.latest_event_time_ms,
    }


def run(
    probe_set: AvailabilityProbeSet,
    transport: AvailabilityTransport,
    clock: ProbeClock,
    *,
    duration_seconds: float,
    observer_region: str,
) -> dict[str, object]:
    """Run the sweep, classify the transitions, summarize the lag table, and emit every line."""
    emit(
        {
            "line": "header",
            "symbols": list(probe_set.symbols),
            "binance_endpoints": [endpoint.value for endpoint in probe_set.binance_endpoints],
            "binance_period_seconds": probe_set.binance_period_seconds,
            "binance_requests_per_minute": probe_set.binance_requests_per_minute,
            "coinalyze_endpoints": [kind.value for kind in probe_set.coinalyze_endpoints],
            "coinalyze_period_seconds": probe_set.coinalyze_period_seconds,
            "coinalyze_requests_per_minute": probe_set.coinalyze_requests_per_minute,
            "duration_seconds": duration_seconds,
            "observer_region": observer_region,
        }
    )
    attempts = run_availability_probe(
        probe_set,
        transport,
        clock,
        total_duration_seconds=duration_seconds,
        observer_region=observer_region,
    )
    for attempt in attempts:
        emit(_attempt_line(attempt))
    samples = classify_transitions(attempts)
    resolution_by_source = {
        probe_set.binance_bucket.identifier: probe_set.binance_period_seconds,
        probe_set.coinalyze_bucket.identifier: probe_set.coinalyze_period_seconds,
    }
    summary_rows = summarize_lag(samples, attempts, resolution_by_source)
    for row in summary_rows:
        emit({"line": "summary", **asdict(row), "observed_ratio": row.observed_ratio})
    footer = {
        "line": "footer",
        "n_attempts": len(attempts),
        "n_samples": len(samples),
        "n_summary_rows": len(summary_rows),
    }
    emit(footer)
    return footer


def build_parser() -> argparse.ArgumentParser:
    """Declare the command line."""
    parser = argparse.ArgumentParser(
        prog="availability_probe_cli",
        description=(
            "Roda o availability_probe continuo (D3.3/D3.2/D3.4) por uma janela declarada e "
            "imprime toda linha crua mais a tabela de defasagem, uma por (endpoint, regiao)."
        ),
    )
    parser.add_argument(
        "--duration-seconds",
        type=float,
        required=True,
        help="duracao da rodada de prova, em segundos (uma prova local curta, nao um deploy)",
    )
    parser.add_argument(
        "--observer-region",
        default=UNKNOWN_OBSERVER_REGION,
        help=f"default '{UNKNOWN_OBSERVER_REGION}': T-03.9 (VPS) fica fora desta task",
    )
    return parser


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


def main(argv: Sequence[str]) -> int:
    """Compose the real transport, the real clock and the declared probe set, then run."""
    args = build_parser().parse_args(list(argv))
    route_diagnostics_away_from_the_product_stream()
    _configure_product_stream()
    transport = AvailabilityHttpClient(environment=os.environ)
    try:
        run(
            AVAILABILITY_PROBE_SET,
            transport,
            SystemProbeClock(),
            duration_seconds=args.duration_seconds,
            observer_region=args.observer_region,
        )
    finally:
        transport.close()
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
