"""`ADR-035/D3`: the service formatter PRINTS `extra` and the projection `stdout` stays clean.

THE TWO HALVES ARE ONE CLAIM AND NEITHER IS THE CLAIM ALONE. "The counters are visible in
`docker logs`" is easy and worthless if it also puts bytes on a `stdout` whose `sha256` two
sides compare precisely to prove they are equal (`ADR-008/DoD-2`). So this file pins:

1. a record with NO caller `extra=` renders byte-for-byte like `logging.Formatter` did before
   (`test_a_record_without_extra_is_byte_identical_to_the_plain_formatter`), and the canonical
   projection still hashes to `IngestHealthReport.fingerprint()`;
2. a record WITH `extra=` — the writer's real `writer_batch_acked` shape — renders its
   counters, in an order that does not depend on which branch built the dict;
3. no PROJECTION CLI hands `extra=` to its module logger, scanned by AST over every importer
   of these builders minus a DECLARED list of service processes.

⚠️ (3) IS THE ONE THAT MATTERS LATER. `ADR-035/D3` asked for a second handler installed by the
service processes; `T-01.5` may not edit `single_writer_cli.py` or `collectors_cli.py`, so the
distinction moved onto the RECORD. The cost of that move is exactly one regression path — a
projection CLI that later grows an `extra=` would start printing it into hashed bytes — and (3)
is the guard that makes the path loud instead of silent.
"""

from __future__ import annotations

import ast
import hashlib
import io
import logging
from pathlib import Path

import pytest

from src.modules.sentimento.infra import ingest_health_cli
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query
from tests.helpers.ingest_record_driver import build_run

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = BACKEND_ROOT / "src"

CLI_MODULE_NAME = "src.modules.sentimento.infra.ingest_health_cli"
SHARED_HANDLER_BUILDERS = frozenset({"build_stdout_handler", "build_stream_handler"})
LOGGING_METHODS = frozenset(
    {"debug", "info", "warning", "warn", "error", "exception", "critical", "log"}
)

# ── THE DECLARED SERVICE PROCESSES, AND THE LIST IS CHECKED FROM BOTH SIDES ────────────────
#
# These are the long-running processes whose `stdout` IS `docker logs` and is read by a human:
# nothing hashes it, and `ADR-035/D3` exists so their counters reach it. Every OTHER importer
# of the shared builders is a PROJECTION CLI — one shot, canonical JSON on `stdout`, bytes that
# feed a `sha256`.
#
# The list is a hazard if it rots in either direction, so both directions are tested:
# `test_every_declared_service_process_actually_emits_extra` fails if a name here stopped being
# a service process (an over-broad exemption), and
# `test_no_projection_cli_emits_extra_on_its_product_logger` fails if anything NOT here started
# emitting. A list that only one test looks at is a list that only grows.
DECLARED_SERVICE_PROCESSES = frozenset(
    {
        "src/modules/sentimento/infra/single_writer_cli.py",
        "src/modules/sentimento/infra/collectors_cli.py",
    }
)


def _render(log_format: str, message: str, extra: dict[str, object] | None) -> str:
    """Push one record through a handler built exactly as production builds it."""
    stream = io.StringIO()
    logger = logging.getLogger(f"test_extra_rendering.{id(stream)}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.handlers = [ingest_health_cli.build_stream_handler(stream, log_format)]
    logger.info(message, extra=extra)
    return stream.getvalue().rstrip("\n")


# ── 1. THE PROJECTION SIDE: THE BYTES DID NOT MOVE ────────────────────────────────────────


@pytest.mark.parametrize(
    "message",
    [
        '{"n_runs":0,"n_gaps":0}',
        '{"run_id":"a","verdict":"ACCEPTED","janela_de_perda":null}',
        "",
    ],
)
def test_a_record_without_extra_is_byte_identical_to_the_plain_formatter(message: str) -> None:
    """No caller attribute ⇒ `ExtraRenderingFormatter` must be indistinguishable from before.

    Compared against `logging.Formatter` itself rather than against a transcribed expectation:
    a hand-written expected string would keep passing if BOTH sides drifted, which is the
    failure mode `ADR-008/DoD-2` cares about.
    """
    record = logging.LogRecord("projection", logging.INFO, __file__, 0, message, None, None)
    plain = logging.Formatter(ingest_health_cli._STABLE_FORMAT).format(record)

    assert _render(ingest_health_cli._STABLE_FORMAT, message, None) == plain


def test_the_canonical_projection_still_hashes_to_the_reports_fingerprint(
    tmp_path: Path,
) -> None:
    """`ADR-008/DoD-2` end to end: what leaves `stdout` hashes to what the report promises.

    This is the falsifier of the second half of the task title. A formatter that appended
    ANYTHING to a projection line — a level, a name, an empty separator — moves this hash, and
    the consumer of `T-07.13` would have received bytes that no longer compare equal.
    """
    store_path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))

    stream = io.StringIO()
    ingest_health_cli.logger.handlers = [ingest_health_cli.build_stdout_handler(stream)]
    ingest_health_cli.logger.setLevel(logging.INFO)
    ingest_health_cli.logger.propagate = False
    try:
        ingest_health_cli.report(store_path)
    finally:
        ingest_health_cli.logger.handlers = []

    # The handler terminates every record; `canonical_projection()` joins WITHOUT a trailing
    # newline, so the last terminator is the one byte that is the stream's and not the
    # projection's. Stripping only that one keeps the comparison honest — `strip()` would also
    # hide a formatter that prefixed a space.
    emitted = stream.getvalue()
    assert emitted.endswith("\n")
    expected = ingest_health_query(SqliteIngestRecordStore(store_path)).fingerprint()
    assert hashlib.sha256(emitted[:-1].encode("utf-8")).hexdigest() == expected


# ── 2. THE SERVICE SIDE: THE COUNTERS THAT EXISTED AND WERE INVISIBLE ─────────────────────


def test_the_writers_batch_event_renders_its_counters() -> None:
    """The exact shape of `single_writer_cli.py`'s `writer_batch_acked`, and the DoD of D3.

    `[MEDIDO 2026-09-10: `docker logs deploy-collector-1 --since 2h |
     grep -v collector_cycle_completed` -> 0 linhas]` — the event was on `stdout` with the
    counters attached to the record and absent from the bytes.
    """
    rendered = _render(
        ingest_health_cli._STABLE_FORMAT,
        "writer_batch_acked",
        {"n_accepted": 3, "n_rejected": 1},
    )

    assert rendered == "writer_batch_acked n_accepted=3 n_rejected=1"


def test_the_collectors_cycle_event_renders_all_four_of_its_fields() -> None:
    """The other emitter `ADR-035/D3` names — four keys, so ordering is observable."""
    rendered = _render(
        ingest_health_cli._STABLE_FORMAT,
        "collector_cycle_completed",
        {
            "endpoint": "/fapi/v1/premiumIndex",
            "n_published": 512,
            "verdict": "ACCEPTED",
            "run_id": "r-1",
        },
    )

    assert rendered == (
        "collector_cycle_completed endpoint=/fapi/v1/premiumIndex n_published=512 "
        "run_id=r-1 verdict=ACCEPTED"
    )


def test_the_key_order_does_not_follow_the_order_the_dict_was_built_in() -> None:
    """Two branches building the same event must produce the same line — `grep` depends on it."""
    forwards = _render(ingest_health_cli._STABLE_FORMAT, "e", {"a": 1, "b": 2, "c": 3})
    backwards = _render(ingest_health_cli._STABLE_FORMAT, "e", {"c": 3, "b": 2, "a": 1})

    assert forwards == backwards == "e a=1 b=2 c=3"


def test_no_internal_logrecord_attribute_leaks_into_the_line() -> None:
    """Only what the CALLER added is appended — `logging`'s own fields stay out.

    The reserved set is derived from a throwaway `LogRecord`; if that derivation broke, this
    line would carry `pathname`, `msecs` and two dozen more, and the "stable format" would be
    a paragraph.
    """
    rendered = _render(ingest_health_cli._STABLE_FORMAT, "event", {"n_accepted": 1})

    assert rendered == "event n_accepted=1"
    for reserved in ("pathname", "levelname", "msecs", "process", "name=", "lineno"):
        assert reserved not in rendered


def test_the_diagnostic_handler_renders_extra_too() -> None:
    """`stderr` diagnostics are for a human, so they get the counters as well.

    Nothing hashes `stderr` (`route_diagnostics_away_from_the_product_stream` exists precisely
    so the hashed stream is `stdout` ALONE), so there is no contract to protect here — only an
    operator to inform.
    """
    rendered = _render(ingest_health_cli._DIAGNOSTIC_FORMAT, "queue_drained", {"n_items": 7})

    assert rendered.endswith("queue_drained n_items=7")
    assert rendered.startswith("INFO ")


# ── 3. THE STRUCTURAL GUARD: PROJECTION AND SERVICE ARE DISTINGUISHABLE BY MACHINE ────────


def _modules_importing_the_shared_builders(root: Path) -> dict[str, ast.Module]:
    """Every module that takes a handler builder from `ingest_health_cli`, plus that module.

    Parsed, not grepped, and the reason is measured: every caller in this tree spells the
    import parenthesised across several lines, so a one-line regex sees NONE of them
    `[MEDIDO 2026-09-10: `grep -rn 'from .*ingest_health_cli import build_stdout_handler'
     backend/src --include='*.py' | wc -l` -> 0, contra 8 importadores reais achados por
     `grep -rl 'from src.modules.sentimento.infra.ingest_health_cli import' backend/src`]`.
    """
    found: dict[str, ast.Module] = {}
    for module in sorted(root.rglob("*.py")):
        tree = ast.parse(module.read_text(encoding="utf-8"), filename=str(module))
        relative = module.relative_to(root.parent).as_posix()
        if relative.endswith("infra/ingest_health_cli.py"):
            found[relative] = tree
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom) or node.module != CLI_MODULE_NAME:
                continue
            if any(alias.name in SHARED_HANDLER_BUILDERS for alias in node.names):
                found[relative] = tree
                break
    return found


def _logger_calls_passing_extra(tree: ast.Module) -> list[int]:
    """Line numbers of every `<something>.<log method>(…, extra=…)` in the module."""
    lines: list[int] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr not in LOGGING_METHODS:
            continue
        if any(keyword.arg == "extra" for keyword in node.keywords):
            lines.append(node.lineno)
    return sorted(lines)


def test_the_universe_of_importers_is_the_one_this_guard_believes_it_is() -> None:
    """A sweep over an empty universe passes vacuously — so the universe is pinned exactly.

    DELIBERATELY BRITTLE, and the brittleness IS the feature: a new module that takes these
    builders is a new answer to "projection or service?", and this test is the only place that
    question gets asked. A `>=` here would let a new CLI join silently, which is exactly the
    silence `ADR-035/D3` is trying to end.

    `[MEDIDO 2026-09-10: `grep -rl 'from src.modules.sentimento.infra.ingest_health_cli import'
     backend/src --include='*.py' | sort` -> 8 arquivos; mais o proprio modulo = 9]`.
    """
    importers = _modules_importing_the_shared_builders(SRC_ROOT)

    assert sorted(importers) == [
        "src/modules/sentimento/infra/aggtrade_nq_probe_cli.py",
        "src/modules/sentimento/infra/clock_skew_tolerance_cli.py",
        "src/modules/sentimento/infra/collectors_cli.py",
        "src/modules/sentimento/infra/force_order_collector_cli.py",
        "src/modules/sentimento/infra/force_order_collision_report_cli.py",
        "src/modules/sentimento/infra/ingest_health_cli.py",
        "src/modules/sentimento/infra/ntp_skew_probe_cli.py",
        "src/modules/sentimento/infra/premium_index_probe_cli.py",
        "src/modules/sentimento/infra/single_writer_cli.py",
    ]
    assert DECLARED_SERVICE_PROCESSES <= set(importers)


def test_every_declared_service_process_actually_emits_extra() -> None:
    """The exemption list cannot hold a name that stopped needing the exemption."""
    importers = _modules_importing_the_shared_builders(SRC_ROOT)

    for service in sorted(DECLARED_SERVICE_PROCESSES):
        assert _logger_calls_passing_extra(importers[service]), service


def test_no_projection_cli_emits_extra_on_its_product_logger() -> None:
    """The whole safety argument, as a machine-checked property of the tree.

    Today: `n=0` offenders over the 9 modules of the universe minus the two declared service
    processes `[MEDIDO 2026-09-10: `grep -c 'extra='` sobre os 9 -> collectors_cli 11,
    single_writer_cli 5, os outros 7 com 0]`.
    """
    importers = _modules_importing_the_shared_builders(SRC_ROOT)
    offenders = {
        relative: _logger_calls_passing_extra(tree)
        for relative, tree in importers.items()
        if relative not in DECLARED_SERVICE_PROCESSES and _logger_calls_passing_extra(tree)
    }

    assert offenders == {}


def test_the_projection_sweep_bites_a_planted_extra(tmp_path: Path) -> None:
    """The other side of the same pass — a mutant projection CLI must be SEEN, not tolerated.

    Without this, `test_no_projection_cli_emits_extra_on_its_product_logger` is a green light
    that cannot turn red, which is the `rc=0` failure mode `ADR-012` names: indistinguishable
    between "nothing eroded" and "the instrument was never able to tell".
    """
    planted = tmp_path / "src" / "modules" / "sentimento" / "infra"
    planted.mkdir(parents=True)
    (planted / "planted_projection_cli.py").write_text(
        '"""A projection CLI that decorates its product line — what the guard forbids."""\n'
        "\n"
        "import logging\n"
        "\n"
        f"from {CLI_MODULE_NAME} import build_stdout_handler\n"
        "\n"
        "logger = logging.getLogger(__name__)\n"
        "\n\n"
        "def report() -> None:\n"
        '    """Emit the canonical line and quietly append a counter to the hashed bytes."""\n'
        "    logger.addHandler(build_stdout_handler())\n"
        '    logger.info("{}", extra={"n_rows": 1})\n',
        encoding="utf-8",
    )

    importers = _modules_importing_the_shared_builders(tmp_path / "src")
    offenders = {
        relative: _logger_calls_passing_extra(tree)
        for relative, tree in importers.items()
        if relative not in DECLARED_SERVICE_PROCESSES and _logger_calls_passing_extra(tree)
    }

    assert list(offenders) == ["src/modules/sentimento/infra/planted_projection_cli.py"]
