"""CLI report of the raw F0 record: a NAMED logger writing `stdout`, never `print`."""

from __future__ import annotations

import logging
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final, TextIO

from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query

# ── `ADR-008/D2`, E ELE FOI DECIDIDO ANTES DA PRIMEIRA LINHA E NAO DESCOBERTO NO PRE-PUSH ──
#
# `core.print-statement` e regra BLOQUEANTE deste repositorio e a mensagem dela pede
# literalmente "use um registrador nomeado pelo modulo em vez de imprimir"
# [MEDIDO 2026-08-29: `harness rules list --severity block` -> a regra esta em vigor; e a
#  medicao registrada em `ADR-008` mostra `{"decision":"block"}` para um `report.py` com
#  `print(rows)`]. O registrador nomeado abaixo NAO e um contorno da regra: o relatorio E
#  saida de produto, e o que a regra impede e que a saida de produto seja `print`, que nao e
#  nem log e nao tem nome de modulo, nem nivel, nem destino configuravel.
#
# ⚠️ E O REGISTRO EM SI CONTINUA PERSISTIDO, NUNCA LOG. Este modulo LE `md.ingest_run` e
# `md.ingest_gap` do store e os escreve na saida; ele nao e a memoria de nada. `D2.9` mata o
# processo e rele — se a verdade morasse aqui, ela morreria com o processo.
logger = logging.getLogger(__name__)

# `%(message)s` e o formato ESTAVEL que `ADR-008/D2` pede, e a estabilidade e o requisito:
# `ADR-008/DoD-2` compara o `sha256` do que sai daqui com o `sha256` do que alimenta S1. Um
# formatador com timestamp faria as duas impressoes digitais divergirem a cada segundo, e o
# falsificador da ADR viraria ruido de relogio.
_STABLE_FORMAT: Final[str] = "%(message)s"


def build_stdout_handler(stream: TextIO | None = None) -> logging.StreamHandler[TextIO]:
    """Build the handler that puts the named logger on `stdout` with the stable format."""
    handler: logging.StreamHandler[TextIO] = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(logging.Formatter(_STABLE_FORMAT))
    return handler


def report(store_path: Path) -> str:
    """Emit the canonical projection line by line and return it, so it can be hashed.

    RETURNING WHAT IT EMITTED IS NOT CONVENIENCE — it is what makes `ADR-008/DoD-2` runnable
    without re-reading the terminal: the caller hashes the SAME string the logger wrote, and
    the test compares it against `IngestHealthReport.fingerprint()`. A report whose output
    could only be inspected by capturing a stream would be a report nobody can falsify.
    """
    health = ingest_health_query(SqliteIngestRecordStore(store_path))
    for line in health.canonical_lines():
        logger.info(line)
    return health.canonical_projection()


def main(argv: Sequence[str]) -> int:
    """Wire the named logger to `stdout` and report the record of the store given in `argv`."""
    if len(argv) != 1:
        raise SystemExit("uso: ingest_health_cli <caminho-do-store>")
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    # Sem isto o registrador raiz reemitiria cada linha, e a saida deixaria de ser a projecao
    # canonica exata — duplicada, ela nao bate `sha256` com nada.
    logger.propagate = False
    report(Path(argv[0]))
    return 0


if __name__ == "__main__":  # pragma: no cover - raiz de composicao, exercitada por subprocesso
    raise SystemExit(main(sys.argv[1:]))
