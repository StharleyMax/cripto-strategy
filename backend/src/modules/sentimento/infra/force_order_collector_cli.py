"""The short, reproducible real-connectivity probe of `!forceOrder@arr` — CODE, not a daemon."""
#
# `T-03.2`'s scope is explicit: the collector CODE plus a short real-connectivity check, never a
# continuous 24/7 process — running it for real is deferred to deploy, and the reconnect policy
# that would keep it alive across drops is `T-03.3`, a separate future task this module does not
# implement. This CLI opens ONE connection, reads for a declared window (or until the message
# cap, whichever comes first), records every raw frame enveloped, and reports what it saw —
# including the honest "zero events" outcome that a sparse, whole-market liquidation stream can
# produce in a short window without that meaning the pipe is broken.
#
# Product output goes to `stdout` through a NAMED logger, diagnostics to `stderr` — the same
# shape `aggtrade_nq_probe_cli.py` already established. Every line of the report carries the
# universe it rests on.

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path

from src.modules.sentimento.domain.force_order_capture_outcome import (
    ForceOrderCaptureOutcome,
    ForceOrderConnected,
    ForceOrderNotConnected,
)
from src.modules.sentimento.domain.force_order_envelope import (
    DOC_SNAPSHOT_DATE,
    STREAM_NAME,
    SUBSAMPLING_SEMANTICS_LABEL,
)
from src.modules.sentimento.infra.binance_stream_probe import (
    BINANCE_FUTURES_STREAM_HOST,
    ByteChannel,
    WebSocketMessageSource,
    connect_tls,
)
from src.modules.sentimento.infra.force_order_raw_recorder import (
    ForceOrderRawRecorder,
    force_order_stream_path,
)
from src.modules.sentimento.infra.ingest_health_cli import (
    build_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.use_cases.capture_force_order_stream import (
    capture_force_order_connectivity,
)

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    """Stamp the evidence in UTC, ISO-8601, so every envelope says WHEN it was received."""
    return datetime.now(UTC).isoformat()


def build_parser() -> argparse.ArgumentParser:
    """Declare the command line. Defaults ARE the declared universe of the measurement."""
    parser = argparse.ArgumentParser(
        prog="force_order_collector_cli",
        description=(
            "Coletor de !forceOrder@arr (liquidacao de mercado inteiro): grava cru e roda um "
            "probe curto de conectividade real. Nao e um processo continuo (T-03.3)."
        ),
    )
    parser.add_argument("--stream", default=STREAM_NAME)
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--max-messages", type=int, default=50)
    parser.add_argument("--host", default=BINANCE_FUTURES_STREAM_HOST)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--summary", type=Path, default=None)
    return parser


def _report_lines(outcome: ForceOrderCaptureOutcome, args: argparse.Namespace) -> list[str]:
    """Render the verdict WITH its universe — a number without the command is not a measurement."""
    header = (
        f"stream {args.stream} · host {args.host} · janela declarada {args.seconds}s "
        f"· teto {args.max_messages} msg"
    )
    label = (
        f"rotulo de saida: subsampling_semantics_label={SUBSAMPLING_SEMANTICS_LABEL!r} "
        f"· doc_snapshot_date={DOC_SNAPSHOT_DATE!r} (SPEC-001 §5.10, doc contraditoria)"
    )
    if isinstance(outcome, ForceOrderNotConnected):
        return [
            header,
            label,
            "veredito: NAO_CONECTADO",
            f"estagio que falhou: {outcome.failed_stage.value}",
            f"detalhe: {outcome.detail}",
        ]
    lines = [
        header,
        label,
        f"veredito: CONECTADO (n = {outcome.messages_captured} mensagem(ns) cru(s))",
        f"janela OBSERVADA: {outcome.observed_seconds}s · fim: {outcome.window_end.value}",
    ]
    if outcome.messages_captured == 0:
        lines.append(
            "ATENCAO: 0 mensagens NAO e falha de conectividade — !forceOrder@arr e mercado "
            "inteiro e ESPARSO; o handshake completou e a janela fechou sem liquidacao "
            "observada, que e um resultado honesto e nao um erro de transporte."
        )
    if not outcome.window_complete:
        estagio = outcome.interrupted_at_stage
        lines.append(
            f"INTERROMPIDA em {estagio.value if estagio else '?'} — o universo observado "
            "e MENOR que o declarado"
        )
    return lines


def _summary(outcome: ForceOrderCaptureOutcome, args: argparse.Namespace) -> dict[str, object]:
    """Build the machine-readable summary that travels next to the raw evidence."""
    base: dict[str, object] = {
        "measured_at": _utc_now(),
        "stream": args.stream,
        "host": args.host,
        "window_seconds": args.seconds,
        "max_messages": args.max_messages,
        "doc_snapshot_date": DOC_SNAPSHOT_DATE,
        "subsampling_semantics_label": SUBSAMPLING_SEMANTICS_LABEL,
    }
    if isinstance(outcome, ForceOrderConnected):
        base["connected"] = True
        base["messages_captured"] = outcome.messages_captured
        base["observed_seconds"] = outcome.observed_seconds
        base["window_end"] = outcome.window_end.value
        base["window_complete"] = outcome.window_complete
        base["interrupted_at_stage"] = (
            outcome.interrupted_at_stage.value if outcome.interrupted_at_stage else None
        )
    else:
        base["connected"] = False
        base["failed_stage"] = outcome.failed_stage.value
        base["detail"] = outcome.detail
    return base


def run(
    args: argparse.Namespace,
    connect: Callable[[str], Callable[[], ByteChannel]] | None = None,
) -> ForceOrderCaptureOutcome:
    """Run one short connectivity capture and write the raw evidence.

    `connect` is injectable so this composition — argument parsing, path building, evidence
    writing and report rendering — is exercised by the OFFLINE suite. Left to default it opens a
    real TLS socket; the only line the suite cannot reach is that socket itself.
    """
    path = force_order_stream_path(str(args.stream))
    channel_for = connect or (lambda host: lambda: connect_tls(host, timeout=float(args.seconds)))
    source = ForceOrderRawRecorder(
        WebSocketMessageSource(str(args.host), path, channel_for(str(args.host))),
        Path(args.evidence),
        _utc_now,
    )
    outcome = capture_force_order_connectivity(
        source, float(args.seconds), int(args.max_messages), time.monotonic
    )
    for line in _report_lines(outcome, args):
        logger.info(line)
    if args.summary is not None:
        summary_path = Path(args.summary)
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(
            json.dumps(_summary(outcome, args), indent=2) + "\n", encoding="utf-8"
        )
    return outcome


def main(
    argv: Sequence[str],
    connect: Callable[[str], Callable[[], ByteChannel]] | None = None,
) -> int:
    """Compose the collector and run the short connectivity probe.

    The exit code follows the `rc=3` "did not measure" convention this repository already uses
    (`aggtrade_nq_probe_cli.py`): `3` means the handshake never completed, never "zero
    liquidations". A caller must not read `rc=3` as "the market is quiet" nor `rc=0` with zero
    messages as a transport problem — the report above spells out which is which.
    """
    args = build_parser().parse_args(list(argv))
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    logger.propagate = False
    return 3 if isinstance(run(args, connect), ForceOrderNotConnected) else 0


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    sys.exit(main(sys.argv[1:]))
