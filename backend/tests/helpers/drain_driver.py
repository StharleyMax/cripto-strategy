"""Subprocess driver: a REAL drain, so the test can kill the process halfway through."""

from __future__ import annotations

import hashlib
import sys
import time
from collections.abc import Callable
from pathlib import Path

from src.modules.sentimento.domain.etl_backlog import EtlBacklog
from src.modules.sentimento.infra.file_etl_worker import FileEtlWorker
from src.modules.sentimento.infra.jsonl_checkpoint import JsonlCheckpoint
from src.modules.sentimento.use_cases.drain_etl_backlog import drain


def _transform(atraso_s: float) -> Callable[[bytes], bytes]:
    def transform(payload: bytes) -> bytes:
        if atraso_s:
            time.sleep(atraso_s)
        return hashlib.sha256(payload).hexdigest().encode("ascii")

    return transform


def main(argv: list[str]) -> int:
    """Drain every file in the source directory; return 0 only if it reaches the end."""
    source_dir, output_dir, ledger, atraso_s = argv
    keys = sorted(item.name for item in Path(source_dir).iterdir() if item.is_file())
    drain(
        EtlBacklog.of(keys),
        FileEtlWorker(Path(source_dir), Path(output_dir), _transform(float(atraso_s))),
        JsonlCheckpoint(Path(ledger)),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
