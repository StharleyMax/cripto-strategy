"""The reproducible command of `D3.9`: subscribe, inspect the payload, report with the universe.

Product output goes to `stdout` through a NAMED logger and diagnostics to `stderr`, the shape
`infra/ingest_health_cli.py` already established here (`core.print-statement` is a BLOCKING rule
of this repository, and the report is product output, not a log).

Every line of the report carries the universe it rests on. A verdict printed without the symbol
count, the message count and the window is exactly the "numero sem o comando que o produziu"
that this repository refuses.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path

from src.modules.sentimento.domain.stream_probe_outcome import (
    DeclaredUniverse,
    ProbeMeasured,
    ProbeNotMeasured,
    ProbeOutcome,
)
from src.modules.sentimento.infra.binance_stream_probe import (
    BINANCE_FUTURES_STREAM_HOST,
    ByteChannel,
    RecordingMessageSource,
    WebSocketMessageSource,
    combined_stream_path,
    connect_tls,
)
from src.modules.sentimento.infra.ingest_health_cli import (
    build_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import (
    probe_stream_quantity_fields,
)

logger = logging.getLogger(__name__)

DEFAULT_SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT")


def _utc_now() -> str:
    """Stamp the evidence in UTC, ISO-8601, so the sample says WHEN it was taken."""
    return datetime.now(UTC).isoformat()


def build_parser() -> argparse.ArgumentParser:
    """Declare the command line. Defaults ARE the declared universe of the measurement."""
    parser = argparse.ArgumentParser(
        prog="aggtrade_nq_probe_cli",
        description="Mede se o WS <symbol>@aggTrade da Binance carrega o campo nq (D3.9).",
    )
    parser.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--max-messages", type=int, default=200)
    parser.add_argument("--stream", default="aggTrade")
    parser.add_argument("--event-type", default="aggTrade")
    parser.add_argument("--host", default=BINANCE_FUTURES_STREAM_HOST)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--summary", type=Path, default=None)
    return parser


def _report_lines(outcome: ProbeOutcome, universe: DeclaredUniverse) -> list[str]:
    """Render the verdict WITH its universe, in both the measured and unmeasured cases."""
    header = (
        f"universo: {len(universe.symbols)} simbolo(s) {list(universe.symbols)} "
        f"· janela {universe.window_seconds}s · teto {universe.max_messages} msg "
        f"· endpoint {universe.endpoint} · evento {universe.event_type}"
    )
    if isinstance(outcome, ProbeNotMeasured):
        return [
            header,
            f"veredito: {outcome.verdict.value}",
            f"estagio que falhou: {outcome.failed_stage.value}",
            f"detalhe: {outcome.detail}",
            "ATENCAO: isto NAO e ausencia do campo nq. A sonda nao chegou a ler payload algum.",
        ]
    breakdowns = outcome.by_symbol()
    lines = [
        header,
        f"veredito: {outcome.verdict.value}  (n = {outcome.messages} mensagens)",
        f"nq > q (2o falsificador de ADR-001): {outcome.nq_above_q_count} de {outcome.messages}",
    ]
    lines.extend(
        f"  {b.symbol}: n={b.messages} nq_valued={b.nq_valued} nq_null={b.nq_null} "
        f"nq_absent={b.nq_absent} nq==q={b.nq_equal_q} nq>q={b.nq_above_q} "
        f"-> {b.verdict.value}"
        for b in breakdowns
    )
    silent = universe.silent_symbols(b.symbol for b in breakdowns)
    lines.append(f"simbolos SILENCIOSOS na janela (pedidos, sem mensagem): {list(silent)}")
    return lines


def _summary(outcome: ProbeOutcome, universe: DeclaredUniverse) -> dict[str, object]:
    """Build the machine-readable summary that travels next to the raw evidence."""
    base: dict[str, object] = {
        "measured_at": _utc_now(),
        "universe": dict(universe.as_dict()),
        "verdict": outcome.verdict.value,
    }
    if isinstance(outcome, ProbeMeasured):
        base["messages"] = outcome.messages
        base["nq_above_q"] = outcome.nq_above_q_count
        base["by_symbol"] = [
            {
                "symbol": b.symbol,
                "messages": b.messages,
                "nq_valued": b.nq_valued,
                "nq_null": b.nq_null,
                "nq_absent": b.nq_absent,
                "nq_equal_q": b.nq_equal_q,
                "nq_above_q": b.nq_above_q,
                "verdict": b.verdict.value,
            }
            for b in outcome.by_symbol()
        ]
        base["silent_symbols"] = list(
            universe.silent_symbols(b.symbol for b in outcome.by_symbol())
        )
    else:
        base["failed_stage"] = outcome.failed_stage.value
        base["detail"] = outcome.detail
    return base


def run(
    args: argparse.Namespace,
    connect: Callable[[str], Callable[[], ByteChannel]] | None = None,
) -> ProbeOutcome:
    """Run one probe against the declared universe and write the raw evidence.

    `connect` is injectable so this composition — argument parsing, path building, evidence
    writing and report rendering — is exercised by the OFFLINE suite. Left to default it opens a
    real TLS socket; the only line the suite cannot reach is that socket itself.
    """
    symbols = tuple(s.strip().upper() for s in str(args.symbols).split(",") if s.strip())
    path = combined_stream_path(symbols, str(args.stream))
    universe = DeclaredUniverse(
        symbols=symbols,
        window_seconds=float(args.seconds),
        max_messages=int(args.max_messages),
        endpoint=f"wss://{args.host}{path}",
        event_type=str(args.event_type),
    )
    channel_for = connect or (lambda host: lambda: connect_tls(host, timeout=float(args.seconds)))
    source = RecordingMessageSource(
        WebSocketMessageSource(str(args.host), path, channel_for(str(args.host))),
        Path(args.evidence),
        _utc_now,
    )
    outcome = probe_stream_quantity_fields(source, universe, time.monotonic)
    for line in _report_lines(outcome, universe):
        logger.info(line)
    if args.summary is not None:
        summary_path = Path(args.summary)
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(
            json.dumps(_summary(outcome, universe), indent=2) + "\n", encoding="utf-8"
        )
    return outcome


def main(
    argv: Sequence[str],
    connect: Callable[[str], Callable[[], ByteChannel]] | None = None,
) -> int:
    """Compose the streams and run the probe.

    The exit code separates "measured" from "did not measure", matching the `rc=3` convention
    the gate scripts of this repository already use: 3 is NOT a failed measurement, it is the
    absence of one, and a caller must never read it as "the field is not there".
    """
    args = build_parser().parse_args(list(argv))
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    logger.propagate = False
    return 3 if isinstance(run(args, connect), ProbeNotMeasured) else 0


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    sys.exit(main(sys.argv[1:]))
