"""The product stream of the composition root: `stdout` is the list of keys, or it is not.

`infra/dump_etl_cli.py` states the contract in the docstring of
`route_diagnostics_away_from_the_product_stream`, and it names the failure it exists to prevent:

    *"Here `stdout` is the list of keys this run processed, which a shell pipeline is expected
    to read; one diagnostic line in front of it makes the pipeline act on a key that does not
    exist."*

**No test read either stream.** `test_dump_etl_cli_surface.py` asserts that both loggers have
handlers, which is a statement about the WIRING and not about what comes out of it — and the
mutation bench of the `/qa` measured the gap: removing `logger.info(key)` from `run` (the product
stream itself) leaves the whole suite green `[MEDIDO 2026-08-29: mutante `M32`, n=32 mutantes,
3 sobreviventes]`.

The two tests below run the composition root **as a process**, which is the only way an operator
invokes it, and they are the first assertions in this repository about the CONTENT of its streams.
Two of them are `xfail(strict=True)`: they describe the contract the module declares, they fail
today, and the day the defect is fixed they XPASS and this file has to be updated instead of the
defect disappearing quietly.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

from src.modules.sentimento.domain.dump_window import AGG_TRADES, enumerate_window
from src.modules.sentimento.infra.dump_etl_cli import MIRROR_DIR

SYMBOL = "BTCUSDT"
DATASET = AGG_TRADES.name
END = date(2026, 8, 29)
DEPTH = 3
BODY = b"1700000000000,42.5,0.01,111,222,false\n"

BACKEND_ROOT = Path(__file__).resolve().parents[2]
CLI = BACKEND_ROOT / "src" / "modules" / "sentimento" / "infra" / "dump_etl_cli.py"


def _seed(workdir: Path) -> tuple[str, ...]:
    """Fabricate the mirror the run will drain: every object with a correct sidecar."""
    partitions = enumerate_window(AGG_TRADES, SYMBOL, END, DEPTH, "daily")
    for partition in partitions:
        target = workdir / MIRROR_DIR / partition.object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(BODY)
        digest = hashlib.sha256(BODY).hexdigest()
        target.with_name(target.name + ".CHECKSUM").write_text(
            f"{digest}  {target.name}\n", encoding="utf-8"
        )
    return tuple(p.object_key for p in partitions)


def _run_the_cli(workdir: Path) -> subprocess.CompletedProcess[str]:
    """Invoke the composition root the way an operator does: as a process, by path."""
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT), PYTHONDONTWRITEBYTECODE="1")
    return subprocess.run(  # noqa: S603 - literal argv, no shell
        [
            sys.executable,
            "-B",
            str(CLI),
            str(workdir),
            SYMBOL,
            DATASET,
            END.isoformat(),
            str(DEPTH),
            "daily",
        ],
        cwd=str(BACKEND_ROOT),
        env=environment,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def test_every_processed_key_is_published_on_the_product_stream(tmp_path: Path) -> None:
    """The keys ARE the output: a run whose `stdout` does not carry them has no product.

    This is the assertion the suite was missing — `run` returning the keys is what a test in
    process can see, and `logger.info(key)` is what a shell pipeline can see. They are different
    surfaces and only the first one was pinned.
    """
    keys = _seed(tmp_path)

    finished = _run_the_cli(tmp_path)

    assert finished.returncode == 0, finished.stderr
    published = [line for line in finished.stdout.splitlines() if line in keys]
    assert published == list(keys), "the product stream lost the order or lost a key"


@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECT MEASURED 2026-08-29 by /qa: the FIRST line of stdout is "
        "`dump_window_enumerated`, a diagnostic. `run` emits that record through the SAME logger "
        "that `main` fits with the stdout handler, so the stderr routing never reaches it — and "
        "it is literally the line the docstring of "
        "`route_diagnostics_away_from_the_product_stream` says it exists to prevent."
    ),
)
def test_a_diagnostic_never_reaches_the_product_stream(tmp_path: Path) -> None:
    """`stdout` carries keys and NOTHING else, or the pipeline downstream acts on a non-key.

    Measured: `stdout` has 4 lines for a 3-object window, and line 0 is `dump_window_enumerated`.
    A `while read KEY` loop takes that word as a bucket key.
    """
    keys = _seed(tmp_path)

    finished = _run_the_cli(tmp_path)

    assert finished.returncode == 0, finished.stderr
    assert finished.stdout.splitlines() == list(keys)


@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECT MEASURED 2026-08-29 by /qa: run as a script — the only way an operator "
        "invokes it — `__name__` is `__main__`, so `_APPLICATION_LOGGER` "
        "(`__name__.split('.')[0]`) resolves to the module's OWN logger instead of `src`. Both "
        "handlers end up on one logger and every record leaves on BOTH streams: the 3 keys also "
        "appear on stderr. Imported in process the same code does separate them, which is why "
        "the current suite cannot see it."
    ),
)
def test_the_two_streams_are_disjoint_when_the_root_runs_as_a_script(tmp_path: Path) -> None:
    """A record belongs to ONE stream. Duplicated, `2>&1` doubles every key of the run."""
    keys = _seed(tmp_path)

    finished = _run_the_cli(tmp_path)

    assert finished.returncode == 0, finished.stderr
    echoed = [key for key in keys if key in finished.stderr]
    assert echoed == [], f"these keys came out on BOTH streams: {echoed}"
