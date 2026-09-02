"""Publish ADR-004 B3: the B2 natural-key collision rate, read from evidence `T-03.2` recorded."""
#
# Reads one or more evidence files written by `force_order_raw_recorder.py` (`T-03.2`) — each
# line the envelope `force_order_envelope.py` declares — keys every `raw` message on ADR-004 B2,
# buckets by `(symbol, day)` and reports the collision rate `count_daily_collisions` computes,
# WITH the B3 bias-direction sentence on every report, and WITH an honest statement of whether
# `plano 03` D3.6's universe (`>= 30` days, `>= 20` symbols) is met yet. This CLI is the "leitura
# trivial" the T-03.3 handoff asks for: the day enough evidence files exist, running this over
# them IS the D3.6 publication — nothing here changes between the mechanics rehearsal and the
# real measurement.
#
# Product output goes to `stdout` through a NAMED logger, diagnostics to `stderr` — the same
# shape `force_order_collector_cli.py` and `ingest_health_cli.py` already established.

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Sequence
from pathlib import Path

from src.modules.sentimento.domain.force_order_collision_accounting import (
    COLLISION_BIAS_DIRECTION,
    D3_6_REQUIRED_DAYS,
    D3_6_REQUIRED_SYMBOLS,
    DailyCollisionCount,
    ForceOrderKeyObservation,
    count_daily_collisions,
    d3_6_universe_met,
)
from src.modules.sentimento.domain.force_order_natural_key import (
    ForceOrderKeyExtractionError,
    extract_force_order_natural_key,
    trade_time_utc_date,
)
from src.modules.sentimento.infra.ingest_health_cli import (
    build_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)

logger = logging.getLogger(__name__)


class MalformedEvidenceLineError(ValueError):
    """One line of an evidence file is not valid JSON — the recorder never writes this shape.

    Raised, never swallowed: a corrupted evidence file is a defect in what `T-03.2` wrote or in
    how it was copied, and reading past it in silence would publish a B3 rate over a universe
    smaller than the file claims, with nothing saying so.
    """


def _observations_from_evidence(
    paths: Sequence[Path],
) -> tuple[tuple[ForceOrderKeyObservation, ...], int]:
    """Read every envelope line across `paths`, keying what can be keyed.

    Returns the observations plus the count of raw lines that could NOT be keyed — B3's
    published rate must be able to say how many lines it could not even attempt to dedupe,
    never silently drop them from the universe it reports.
    """
    observations: list[ForceOrderKeyObservation] = []
    unkeyable = 0
    for path in paths:
        text = path.read_text(encoding="utf-8")
        for number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                envelope = json.loads(line)
            except json.JSONDecodeError as failure:
                raise MalformedEvidenceLineError(f"unreadable line {number} in {path}") from failure
            try:
                key = extract_force_order_natural_key(envelope["raw"])
            except (ForceOrderKeyExtractionError, KeyError) as failure:
                logger.warning("linha %d de %s sem chave natural B2: %r", number, path, failure)
                unkeyable += 1
                continue
            observations.append(
                ForceOrderKeyObservation(key=key, day=trade_time_utc_date(key.trade_time))
            )
    return tuple(observations), unkeyable


def _report_lines(
    counts: Sequence[DailyCollisionCount], unkeyable: int, universe_met: bool
) -> list[str]:
    """Render the B3 report. The bias sentence rides on every report, not only in a docstring."""
    lines = [
        f"universo: {len(counts)} par(es) (symbol, day); {unkeyable} linha(s) sem chave natural",
        COLLISION_BIAS_DIRECTION,
    ]
    for count in counts:
        lines.append(
            f"{count.symbol} {count.day}: total={count.total_events} "
            f"colisoes={count.collisions} taxa={count.collision_rate:.4f}"
        )
    if universe_met:
        lines.append(
            f"D3.6 ATENDIDO: >= {D3_6_REQUIRED_DAYS} dias e >= {D3_6_REQUIRED_SYMBOLS} "
            "simbolos observados"
        )
    else:
        distinct_days = len({count.day for count in counts})
        distinct_symbols = len({count.symbol for count in counts})
        lines.append(
            f"D3.6 NAO MEDIVEL EM REGIME REAL HOJE: {distinct_days} dia(s) x "
            f"{distinct_symbols} simbolo(s) observado(s); o universo declarado exige "
            f">= {D3_6_REQUIRED_DAYS} dias x >= {D3_6_REQUIRED_SYMBOLS} simbolos — a MECANICA "
            "de contagem e publicacao esta pronta, a leitura e trivial quando o regime real "
            "acumular o universo"
        )
    return lines


def _summary(
    counts: Sequence[DailyCollisionCount], unkeyable: int, universe_met: bool
) -> dict[str, object]:
    """Build the machine-readable twin of `_report_lines` — same numbers, same bias sentence."""
    return {
        "bias_direction": COLLISION_BIAS_DIRECTION,
        "unkeyable_raw_lines": unkeyable,
        "d3_6_universe_met": universe_met,
        "d3_6_required_days": D3_6_REQUIRED_DAYS,
        "d3_6_required_symbols": D3_6_REQUIRED_SYMBOLS,
        "daily_counts": [
            {
                "symbol": count.symbol,
                "day": count.day,
                "total_events": count.total_events,
                "collisions": count.collisions,
                "collision_rate": count.collision_rate,
            }
            for count in counts
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    """Declare the command line: one or more evidence files in, a report and a summary out."""
    parser = argparse.ArgumentParser(
        prog="force_order_collision_report_cli",
        description=(
            "Publica a taxa de colisao da chave natural B2 (ADR-004) por simbolo e por dia, a "
            "partir dos arquivos de evidencia que o coletor de !forceOrder@arr grava."
        ),
    )
    parser.add_argument("--evidence", type=Path, nargs="+", required=True)
    parser.add_argument("--summary", type=Path, default=None)
    return parser


def run(args: argparse.Namespace) -> tuple[DailyCollisionCount, ...]:
    """Read the evidence, count the collisions, report and optionally write the summary."""
    observations, unkeyable = _observations_from_evidence(list(args.evidence))
    counts = count_daily_collisions(observations)
    universe_met = d3_6_universe_met(counts)
    for line in _report_lines(counts, unkeyable, universe_met):
        logger.info(line)
    if args.summary is not None:
        summary_path = Path(args.summary)
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(
            json.dumps(_summary(counts, unkeyable, universe_met), indent=2) + "\n",
            encoding="utf-8",
        )
    return counts


def main(argv: Sequence[str]) -> int:
    """Compose the report CLI. Always `rc=0` — a report with zero evidence is still a report."""
    args = build_parser().parse_args(list(argv))
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    logger.propagate = False
    run(args)
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root
    sys.exit(main(sys.argv[1:]))
