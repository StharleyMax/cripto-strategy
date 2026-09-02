"""The command-line surface of the composition root: what it refuses before it does any work.

Every refusal here is about the same thing — **a composition root that guesses is worse than one
that stops**, because every guess it makes silently changes how much history is fetched, and the
result of a wrong guess is a window that drains cleanly and holds the wrong data.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import date
from pathlib import Path

import pytest

from src.modules.sentimento.domain.dump_window import AGG_TRADES, enumerate_window
from src.modules.sentimento.infra import dump_etl_cli
from src.modules.sentimento.infra.dump_etl_cli import MIRROR_DIR

SYMBOL = "BTCUSDT"
END = date(2026, 8, 29)
BODY = b"1700000000000,42.5,0.01,111,222,false\n"


def _body_for(index: int) -> bytes:
    """Content per partition: index 0 is plain `BODY`, every other index is DISTINGUISHABLE.

    `T-07.3` dedupes by content hash across keys: reusing the identical `BODY` for every
    partition would make every key past the first a duplicate of the first by construction,
    which would silently defeat this file's "every key publishes" assertions.
    """
    return BODY if index == 0 else BODY + f"# partition {index}\n".encode("ascii")


def _seed(workdir: Path, depth: int) -> tuple[str, ...]:
    """Fabricate `depth` verified objects in the mirror, each with content of its own."""
    partitions = enumerate_window(AGG_TRADES, SYMBOL, END, depth, "daily")
    for index, partition in enumerate(partitions):
        target = workdir / MIRROR_DIR / partition.object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        body = _body_for(index)
        target.write_bytes(body)
        digest = hashlib.sha256(body).hexdigest()
        target.with_name(target.name + ".CHECKSUM").write_text(
            f"{digest}  {target.name}\n", encoding="utf-8"
        )
    return tuple(p.object_key for p in partitions)


@pytest.mark.parametrize(
    "argv",
    [
        [],
        ["only-a-workdir"],
        ["w", SYMBOL, "aggTrades", "2026-08-29", "30"],
        ["w", SYMBOL, "aggTrades", "2026-08-29", "30", "daily", "extra"],
    ],
)
def test_the_wrong_number_of_arguments_refuses_with_the_usage_line(argv: list[str]) -> None:
    """Six arguments, none optional: an omitted one is a typo, never a request for a default."""
    with pytest.raises(SystemExit) as refusal:
        dump_etl_cli.main(argv)

    assert "uso: dump_etl_cli" in str(refusal.value)


def test_a_misspelled_granularity_refuses_instead_of_falling_back_to_daily() -> None:
    """`montly` is a typo, and a fallback would hand back a thirtieth of what was asked for.

    This is the failure mode with no symptom: the run succeeds, the checkpoint fills, the
    operator reads "done", and the window is daily where they wanted monthly.
    """
    with pytest.raises(SystemExit) as refusal:
        dump_etl_cli.main(["w", SYMBOL, "aggTrades", "2026-08-29", "30", "montly"])

    assert "monthly|daily" in str(refusal.value)


def test_the_usage_line_stays_in_portuguese_because_it_is_microcopy() -> None:
    """`SPEC-001` §3.8 reserves pt-BR for microcopy; an operator-facing usage line is microcopy.

    Every identifier, docstring and comment around it is English per the owner's rule, so this
    assertion is what keeps the boundary deliberate rather than accidental.
    """
    assert dump_etl_cli._USAGE.startswith("uso: ")
    assert "profundidade-dias" in dump_etl_cli._USAGE


def test_main_wires_both_streams_and_drains_the_window_it_was_given(tmp_path: Path) -> None:
    """The happy path through `main`, with BOTH mutated loggers restored afterwards.

    `main` touches two loggers, not one. Restoring only the CLI logger would leave the `src`
    logger of the whole application holding a stderr handler and `propagate = False` for the rest
    of the session — global state leaking out of a test, which makes a LATER test fail for a
    reason nobody can find.
    """
    keys = _seed(tmp_path, depth=3)

    cli_logger = dump_etl_cli.logger
    app_logger = logging.getLogger(dump_etl_cli._APPLICATION_LOGGER)
    saved = [
        (log, list(log.handlers), log.level, log.propagate) for log in (cli_logger, app_logger)
    ]
    try:
        argv = [str(tmp_path), SYMBOL, "aggTrades", END.isoformat(), "3", "daily"]
        assert dump_etl_cli.main(argv) == 0
        assert cli_logger.handlers, "main has to install the stdout logger"
        assert app_logger.handlers, "main has to take diagnostics off the product stream"
        assert app_logger.propagate is False
    finally:
        for log, handlers, level, propagate in saved:
            log.handlers = handlers
            log.setLevel(level)
            log.propagate = propagate

    published = sorted(
        str(p.relative_to(tmp_path / "out")).removesuffix(".out")
        for p in (tmp_path / "out").rglob("*.out")
    )
    assert published == sorted(keys)


def test_main_accepts_the_monthly_prefix_for_a_dataset_that_publishes_one(tmp_path: Path) -> None:
    """Both members of the closed granularity set are reachable from the command line.

    Testing only `daily` would leave the `monthly` branch unexecuted, and an unexecuted branch in
    an argument parser is the one that turns out to be misspelled the day an operator needs it.
    """
    partitions = enumerate_window(AGG_TRADES, SYMBOL, END, 30, "monthly")
    for index, partition in enumerate(partitions):
        target = tmp_path / MIRROR_DIR / partition.object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        body = _body_for(index)
        target.write_bytes(body)
        digest = hashlib.sha256(body).hexdigest()
        target.with_name(target.name + ".CHECKSUM").write_text(
            f"{digest}  {target.name}\n", encoding="utf-8"
        )

    cli_logger = dump_etl_cli.logger
    app_logger = logging.getLogger(dump_etl_cli._APPLICATION_LOGGER)
    saved = [
        (log, list(log.handlers), log.level, log.propagate) for log in (cli_logger, app_logger)
    ]
    try:
        code = dump_etl_cli.main(
            [str(tmp_path), SYMBOL, "aggTrades", END.isoformat(), "30", "monthly"]
        )
    finally:
        for log, handlers, level, propagate in saved:
            log.handlers = handlers
            log.setLevel(level)
            log.propagate = propagate

    assert code == 0
    # 30 days of depth touches two months, so the monthly window is 2 objects and not 30.
    assert len(partitions) == 2
    assert len(list((tmp_path / "out").rglob("*.out"))) == 2


def test_build_stream_handler_touches_no_global_logger_state() -> None:
    """Building a handler is not installing one — the two are separated on purpose."""
    import io

    stream = io.StringIO()
    before = list(logging.getLogger(dump_etl_cli._APPLICATION_LOGGER).handlers)

    handler = dump_etl_cli.build_stream_handler(stream, "%(message)s")

    assert handler.stream is stream
    assert logging.getLogger(dump_etl_cli._APPLICATION_LOGGER).handlers == before
