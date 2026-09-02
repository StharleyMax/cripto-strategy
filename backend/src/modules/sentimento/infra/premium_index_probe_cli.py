"""The reproducible command behind `CA-F0-1b`: N consecutive cycles, one weight delta."""

# Product output goes to `stdout` through a NAMED logger, diagnostics to `stderr` — the same
# split `ingest_health_cli.py` established (`core.print-statement` is a BLOCKING rule of this
# repository). This is a PROBE, matching the handoff's "codigo + probe curto, nao deploy
# continuo": it runs a small, declared number of cycles once, by hand, and is not wired to any
# scheduler. `use_cases/collect_premium_index.py` is the part that IS the continuous collector
# — this CLI is one composition of it, not the only one a future deploy would use.

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path

from src.modules.sentimento.domain.premium_index_batch import (
    PREMIUM_INDEX_BATCH_WEIGHT_DECLARED,
)
from src.modules.sentimento.domain.quota_bucket import USED_WEIGHT_HEADER
from src.modules.sentimento.infra.ingest_health_cli import (
    build_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.infra.premium_index_http_client import PremiumIndexHttpClient
from src.modules.sentimento.infra.premium_index_jsonl_sink import PremiumIndexJsonlSink
from src.modules.sentimento.use_cases.collect_premium_index import (
    PremiumIndexCycleResult,
    PremiumIndexCycleStage,
    PremiumIndexFetcher,
    PremiumIndexSink,
    collect_premium_index_once,
)

logger = logging.getLogger(__name__)

DEFAULT_CYCLES: int = 2
DEFAULT_INTERVAL_SECONDS: float = 1.0


def build_parser() -> argparse.ArgumentParser:
    """Declare the command line. Defaults reproduce the two-call measurement of `CA-F0-1b`."""
    parser = argparse.ArgumentParser(
        prog="premium_index_probe_cli",
        description=(
            "Roda N ciclos consecutivos contra o batch premiumIndex e mede o delta de peso, "
            "confirmando (ou nao) CA-F0-1b: peso 10 por chamada, independente do universo."
        ),
    )
    parser.add_argument("--cycles", type=int, default=DEFAULT_CYCLES)
    parser.add_argument("--interval-seconds", type=float, default=DEFAULT_INTERVAL_SECONDS)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--summary", type=Path, default=None)
    return parser


def _weight_deltas(results: tuple[PremiumIndexCycleResult, ...]) -> list[int]:
    """Return the weight delta between each pair of CONSECUTIVE readable-weight cycles."""
    weights = [r.weight_used for r in results if r.weight_used is not None]
    return [after - before for before, after in zip(weights, weights[1:], strict=False)]


def _report_lines(results: tuple[PremiumIndexCycleResult, ...]) -> list[str]:
    """Render every cycle with its universe, then the verdict WITH the deltas it rests on."""
    lines = [f"ciclos executados: {len(results)}"]
    for result in results:
        detail = f" detalhe={result.detail}" if result.detail else ""
        lines.append(
            f"  received_at={result.received_at} estagio={result.stage} "
            f"n_simbolos={result.n_symbols} peso={result.weight_used} "
            f"status={result.status}{detail}"
        )
    deltas = _weight_deltas(results)
    if len(deltas) == 0:
        lines.append(
            "peso NAO comparavel: menos de 2 ciclos com o header de peso legivel "
            "(nunca leia isto como 'peso zero')"
        )
        return lines
    confirmed = all(delta == PREMIUM_INDEX_BATCH_WEIGHT_DECLARED for delta in deltas)
    verdict = "CONFIRMADO" if confirmed else "DIVERGENTE"
    lines.append(
        f"delta(s) de peso entre ciclos consecutivos: {deltas} "
        f"(declarado CA-F0-1b: {PREMIUM_INDEX_BATCH_WEIGHT_DECLARED}/chamada) -> {verdict}"
    )
    return lines


def _summary(results: tuple[PremiumIndexCycleResult, ...]) -> dict[str, object]:
    """Build the machine-readable summary that travels next to the raw evidence."""
    deltas = _weight_deltas(results)
    return {
        "cycles": [
            {
                "received_at": r.received_at,
                "stage": r.stage,
                "n_symbols": r.n_symbols,
                "weight_used": r.weight_used,
                "status": r.status,
                "detail": r.detail,
            }
            for r in results
        ],
        "weight_deltas": deltas,
        "declared_weight_per_call": PREMIUM_INDEX_BATCH_WEIGHT_DECLARED,
        "weight_confirmed": len(deltas) > 0
        and all(delta == PREMIUM_INDEX_BATCH_WEIGHT_DECLARED for delta in deltas),
    }


def run(
    args: argparse.Namespace,
    fetcher_factory: Callable[[], PremiumIndexFetcher] | None = None,
    sink_factory: Callable[[Path], PremiumIndexSink] | None = None,
    clock: Callable[[], int] | None = None,
    sleep: Callable[[float], None] | None = None,
) -> tuple[PremiumIndexCycleResult, ...]:
    """Run `--cycles` cycles, sleeping `--interval-seconds` between them, and report.

    Every dependency that touches the network or the wall clock is injectable, so this
    composition is exercised offline by the suite (`backend/scripts/test.sh`, "ZERO REDE").
    Left to default, `fetcher_factory` opens a real TLS connection and `clock`/`sleep` read the
    real wall clock — the only lines the suite cannot reach are those defaults themselves.
    """
    build_fetcher = fetcher_factory or PremiumIndexHttpClient
    build_sink = sink_factory or PremiumIndexJsonlSink
    now = clock or (lambda: int(time.time() * 1000))
    wait = sleep or time.sleep
    fetcher = build_fetcher()
    sink = build_sink(Path(args.evidence))
    results: list[PremiumIndexCycleResult] = []
    cycles = int(args.cycles)
    for cycle in range(cycles):
        results.append(collect_premium_index_once(fetcher, sink, now(), USED_WEIGHT_HEADER))
        if cycle < cycles - 1:
            wait(float(args.interval_seconds))
    closer: Callable[[], None] | None = getattr(fetcher, "close", None)
    if closer is not None:
        closer()
    outcome = tuple(results)
    for line in _report_lines(outcome):
        logger.info(line)
    if args.summary is not None:
        summary_path = Path(args.summary)
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(_summary(outcome), indent=2) + "\n", encoding="utf-8")
    return outcome


def main(argv: Sequence[str]) -> int:
    """Run the probe, mapping the outcome onto the `rc` vocabulary this repository already uses.

    `rc=3`: not one cycle was dispatched — the same "measurement absent" code
    `aggtrade_nq_probe_cli.py` uses, and for the same reason: silence about the network is not
    silence about the weight. `rc=1`: cycles were dispatched but the weight delta does NOT
    match `CA-F0-1b` — a real finding, and the falsifier this probe exists to be able to report.
    `rc=0`: confirmed.
    """
    args = build_parser().parse_args(list(argv))
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    logger.propagate = False
    results = run(args)
    if all(result.stage == PremiumIndexCycleStage.TRANSPORT for result in results):
        return 3
    deltas = _weight_deltas(results)
    if len(deltas) == 0:
        return 3
    if not all(delta == PREMIUM_INDEX_BATCH_WEIGHT_DECLARED for delta in deltas):
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    sys.exit(main(sys.argv[1:]))
