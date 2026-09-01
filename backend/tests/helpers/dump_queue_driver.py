"""Subprocess driver for `D3.1`: a REAL run of the composition root, killable halfway.

It calls `dump_etl_cli.run` and nothing else. Rebuilding the wiring here would mean the test
proved that a copy of the composition root is resumable, which is not what `D3.1` asks.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

from src.modules.sentimento.domain.dump_window import Granularity
from src.modules.sentimento.infra.dump_etl_cli import run


def main(argv: list[str]) -> int:
    """Drain the window the arguments describe; return 0 only if it reaches the end."""
    workdir, symbol, dataset_name, end_text, depth_text, granularity = argv
    narrowed: Granularity = "monthly" if granularity == "monthly" else "daily"
    run(
        Path(workdir),
        symbol,
        dataset_name,
        date.fromisoformat(end_text),
        int(depth_text),
        narrowed,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
