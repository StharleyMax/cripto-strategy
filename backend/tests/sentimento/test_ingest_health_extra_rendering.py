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
   of these builders minus a DECLARED list of service processes;
4. only the DECLARED service processes import the service handler, and every one of them does.

⚠️ (3) AND (4) ARE TWO LAYERS, NOT ONE CHECK WRITTEN TWICE — `ADR-035/D3`'s amendment of
`2026-09-11` (`D9`, owner) says which is which. (4) pins the GUARANTEE: since `T-06.1` the
projection handler is `logging.Formatter` and a projection CLI cannot print a pair even if
somebody writes `extra=` in it. (3) is the FALSIFIER of that guarantee, and it STAYS, because it
answers what the handler cannot — "is the separation still the REASON the projection is clean,
or did somebody start emitting `extra` from the wrong side?". A divergence between them is
ALWAYS a rejection: one green never excuses the other red (amendment item 3a).
"""

from __future__ import annotations

import ast
import hashlib
import io
import logging
from collections.abc import Callable
from pathlib import Path

import pytest

from src.modules.sentimento.infra import ingest_health_cli
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query
from tests.helpers.ingest_record_driver import build_run

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = BACKEND_ROOT / "src"

CLI_MODULE_NAME = "src.modules.sentimento.infra.ingest_health_cli"

# The builders whose handler RENDERS `extra` — the service side of `ADR-035/D3`'s amendment.
SERVICE_HANDLER_BUILDERS = frozenset(
    {"build_service_stdout_handler", "build_service_stream_handler"}
)

# ⛔ EVERY handler builder the CLI exports belongs in this set, the service ones INCLUDED, and
# that is why `T-06.1` could not merely add a function. The sweep below discovers its universe
# by the NAME of the builder a module imports: a name missing here is a door a tenth module
# walks through WITHOUT ever being asked "projection or service?" — and
# `test_the_universe_of_importers_is_the_one_this_guard_believes_it_is` would stay green over a
# universe that quietly shrank. Green over a shrunken universe is the allowlist erosion
# `CLAUDE.md` names and `ADR-035/D3`'s amendment (item 2) forbids.
SHARED_HANDLER_BUILDERS = (
    frozenset({"build_stdout_handler", "build_stream_handler"}) | SERVICE_HANDLER_BUILDERS
)
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


def _render_through(
    builder: Callable[[io.StringIO, str], logging.Handler],
    log_format: str,
    message: str,
    extra: dict[str, object] | None,
) -> str:
    """Push one record through a handler built exactly as production builds it."""
    stream = io.StringIO()
    logger = logging.getLogger(f"test_extra_rendering.{id(stream)}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.handlers = [builder(stream, log_format)]
    logger.info(message, extra=extra)
    return stream.getvalue().rstrip("\n")


def _render_service(log_format: str, message: str, extra: dict[str, object] | None) -> str:
    """Render through the SERVICE handler — the one whose formatter renders `extra={}`."""
    return _render_through(
        ingest_health_cli.build_service_stream_handler, log_format, message, extra
    )


def _render_projection(log_format: str, message: str, extra: dict[str, object] | None) -> str:
    """Render through the PROJECTION handler — the one that CANNOT render `extra={}` at all."""
    return _render_through(ingest_health_cli.build_stream_handler, log_format, message, extra)


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

    Rendered through the SERVICE handler on purpose: since `T-06.1` the projection handler IS
    `logging.Formatter`, so asking it this question would compare a thing with itself. The claim
    worth keeping is the one about the decorating formatter — that with no `extra=` it still
    produces the byte-identical line.
    """
    record = logging.LogRecord("projection", logging.INFO, __file__, 0, message, None, None)
    plain = logging.Formatter(ingest_health_cli._STABLE_FORMAT).format(record)

    assert _render_service(ingest_health_cli._STABLE_FORMAT, message, None) == plain


@pytest.mark.parametrize(
    "message",
    [
        '{"n_runs":0,"n_gaps":0}',
        '{"run_id":"a","verdict":"ACCEPTED","janela_de_perda":null}',
        "",
    ],
)
def test_the_projection_handler_swallows_extra_and_stays_byte_identical(message: str) -> None:
    """`CA-F6-3`: a record WITH `extra=` renders on the projection handler exactly as plain.

    THIS IS THE STRUCTURAL GUARANTEE OF `ADR-035/D3`'s amendment, stated as the only thing that
    could ever be observed about it: the bytes. Before `T-06.1` this same record would have come
    back decorated with ` n_rows=7 run_id=r-1`, and those bytes feed the `sha256` two sides
    compare precisely to prove they are equal (`ADR-008/DoD-2`). A projection CLI that grows an
    `extra=` tomorrow is no longer a corruption path — the handler it installs has no code that
    could render a pair, which is why the guarantee is structural and not a promise.
    """
    record = logging.LogRecord("projection", logging.INFO, __file__, 0, message, None, None)
    plain = logging.Formatter(ingest_health_cli._STABLE_FORMAT).format(record)

    rendered = _render_projection(
        ingest_health_cli._STABLE_FORMAT, message, {"n_accepted": 7, "writer_shard": "r-1"}
    )

    # The key names are deliberately absent from every parametrised message, so these two
    # assertions cannot be satisfied by the message's own text — `run_id` would have been.
    assert rendered == plain
    assert "n_accepted" not in rendered
    assert "writer_shard" not in rendered


def test_the_projection_stdout_builder_is_the_pure_formatter_not_the_decorating_one() -> None:
    """`CA-F6-3`, from the other side: the class installed on `stdout` is the plain one.

    The byte test above proves the OUTPUT; this proves the WIRING that produces it, so a future
    edit that reintroduces `ExtraRenderingFormatter` on the projection path fails here with the
    cause named instead of failing wherever a hash happens to be compared.
    """
    projection = ingest_health_cli.build_stdout_handler(io.StringIO())
    service = ingest_health_cli.build_service_stdout_handler(io.StringIO())

    assert type(projection.formatter) is logging.Formatter
    assert type(service.formatter) is ingest_health_cli.ExtraRenderingFormatter


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
    rendered = _render_service(
        ingest_health_cli._STABLE_FORMAT,
        "writer_batch_acked",
        {"n_accepted": 3, "n_rejected": 1},
    )

    assert rendered == "writer_batch_acked n_accepted=3 n_rejected=1"


def test_the_collectors_cycle_event_renders_all_four_of_its_fields() -> None:
    """The other emitter `ADR-035/D3` names — four keys, so ordering is observable."""
    rendered = _render_service(
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
    forwards = _render_service(ingest_health_cli._STABLE_FORMAT, "e", {"a": 1, "b": 2, "c": 3})
    backwards = _render_service(ingest_health_cli._STABLE_FORMAT, "e", {"c": 3, "b": 2, "a": 1})

    assert forwards == backwards == "e a=1 b=2 c=3"


def test_no_internal_logrecord_attribute_leaks_into_the_line() -> None:
    """Only what the CALLER added is appended — `logging`'s own fields stay out.

    The reserved set is derived from a throwaway `LogRecord`; if that derivation broke, this
    line would carry `pathname`, `msecs` and two dozen more, and the "stable format" would be
    a paragraph.
    """
    rendered = _render_service(ingest_health_cli._STABLE_FORMAT, "event", {"n_accepted": 1})

    assert rendered == "event n_accepted=1"
    for reserved in ("pathname", "levelname", "msecs", "process", "name=", "lineno"):
        assert reserved not in rendered


def test_the_diagnostic_handler_renders_extra_too() -> None:
    """`stderr` diagnostics are for a human, so they get the counters as well.

    Nothing hashes `stderr` (`route_diagnostics_away_from_the_product_stream` exists precisely
    so the hashed stream is `stdout` ALONE), so there is no contract to protect here — only an
    operator to inform.

    ⚠️ THIS IS THE CHOICE `T-06.1` WAS REQUIRED TO MAKE EXPLICIT (`plano 06` item 6.1). Making
    `build_stream_handler` pure would have silenced `extra` on the diagnostic `stderr` too —
    permitted by `ADR-035/D3`, since the axis is the destination of `stdout` and `stderr` feeds
    no projection. CHOSEN: keep it, because those counters are the operator's only view of a
    long-running process. The choice is enforced, not merely written: the assertion below fails
    if `route_diagnostics_away_from_the_product_stream` ever swaps back to the pure builder.
    """
    rendered = _render_service(
        ingest_health_cli._DIAGNOSTIC_FORMAT, "queue_drained", {"n_items": 7}
    )

    assert rendered.endswith("queue_drained n_items=7")
    assert rendered.startswith("INFO ")


def test_the_diagnostic_stream_is_wired_to_the_handler_that_renders_extra() -> None:
    """The wiring behind the choice above — `stderr` gets the decorating formatter, on purpose."""
    application = logging.getLogger(ingest_health_cli._APPLICATION_LOGGER)
    before = list(application.handlers)
    propagate = application.propagate
    try:
        ingest_health_cli.route_diagnostics_away_from_the_product_stream()
        installed = [handler for handler in application.handlers if handler not in before]
        assert len(installed) == 1
        assert type(installed[0].formatter) is ingest_health_cli.ExtraRenderingFormatter
    finally:
        application.handlers = before
        application.propagate = propagate


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


# ── 4. THE GUARANTEE: THE HANDLER, AND THE EXEMPTION LIST THAT CANNOT DRIFT FROM IT ───────


def _handler_builders_imported_from_the_cli(tree: ast.Module) -> frozenset[str]:
    """Every handler-builder name this module takes FROM `ingest_health_cli`, by AST.

    Same parse, same measured reason as the universe sweep above: every importer in this tree
    spells the import parenthesised across several lines, so a one-line regex sees none of them.
    """
    imported: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom) or node.module != CLI_MODULE_NAME:
            continue
        imported.update(alias.name for alias in node.names if alias.name in SHARED_HANDLER_BUILDERS)
    return frozenset(imported)


def _service_handler_calls(tree: ast.Module) -> list[int]:
    """Line numbers where this module CALLS a service handler builder by bare name."""
    return sorted(
        node.lineno
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in SERVICE_HANDLER_BUILDERS
    )


def _modules_installing_the_service_handler(root: Path) -> frozenset[str]:
    """Return the modules that both IMPORT and CALL a builder whose handler renders `extra`.

    ⛔ BOTH HALVES, AND THE `and` IS THE POINT. An import alone is not an installation: a module
    could take the name and keep calling `build_stdout_handler`, which is `ADR-035/D3`'s
    promotion done by half — and a guard that only read imports would call that module a service
    process while its `stdout` stayed a projection. Measured: that exact mutant SURVIVED the
    import-only version of this helper `[MEDIDO 2026-09-11, T-06.1 mutante M4]`.

    `ingest_health_cli.py` is excluded by the import half: it DEFINES these builders and calls
    them internally, but imports none of them — which is correct, because it is itself a
    projection CLI whose `stdout` `ADR-008/DoD-2` hashes.
    """
    return frozenset(
        relative
        for relative, tree in _modules_importing_the_shared_builders(root).items()
        if _handler_builders_imported_from_the_cli(tree) & SERVICE_HANDLER_BUILDERS
        and _service_handler_calls(tree)
    )


def test_the_service_handler_is_taken_by_exactly_the_declared_service_processes() -> None:
    """`CA-F6-1`: the exemption list and the installed handler are ONE fact, checked as one.

    `ADR-035/D3`'s amendment, rule (c): a CLI that genuinely needs `extra` is PROMOTED — it
    enters `DECLARED_SERVICE_PROCESSES` *and* installs `build_service_stdout_handler`. Adding
    the name without switching that module's handler is a bypass wearing the clothes of
    maintenance, and this `==` is what stops it landing: the two edits fail separately and pass
    only together.

    `ingest_health_cli.py` DEFINES the builders and imports none of them, so it is correctly
    absent from both sides — it is itself a projection CLI, and `ADR-008/DoD-2` hashes exactly
    its `stdout`.
    """
    assert _modules_installing_the_service_handler(SRC_ROOT) == DECLARED_SERVICE_PROCESSES


def _builders_installed_on_a_logger(tree: ast.Module) -> list[tuple[int, str]]:
    """`(line, builder name)` for every `<logger>.addHandler(<builder>())` in the module."""
    installed: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr != "addHandler" or not node.args:
            continue
        argument = node.args[0]
        if isinstance(argument, ast.Call) and isinstance(argument.func, ast.Name):
            installed.append((node.lineno, argument.func.id))
    return sorted(installed)


def test_every_handler_a_service_process_installs_is_built_by_a_service_builder() -> None:
    """WHICH LOGGER GOT IT, not merely that the name was called somewhere in the file.

    The check above asks whether the module IMPORTS and CALLS a service builder. That pair is
    enough to kill the promotion-done-by-half mutant, and it was measured killing it
    `[MEDIDO 2026-09-11: mutante M4 replantado nos dois processos de servico, rc=1, killer
     unico `test_the_service_handler_is_taken_by_exactly_the_declared_service_processes`]`.
    What it cannot see is a call whose RESULT goes nowhere: a service process that calls
    `build_service_stdout_handler()` on a throwaway logger while its own logger takes the
    projection builder passes the pair and still ships a `stdout` that cannot print a counter —
    measured as a SURVIVING mutant in the same gate `[MEDIDO 2026-09-11: mutante M4d,
    `logging.getLogger('nowhere').addHandler(build_service_stdout_handler())` ao lado de
    `logger.addHandler(build_stdout_handler())` em `collectors_cli.py`, rc=0, 0 killers]`.

    So this asserts the destination: every handler either service process installs on a logger
    comes from a SERVICE builder, and there is at least one — an empty list would pass
    vacuously, which is the `rc=0` `ADR-012` names.
    """
    importers = _modules_importing_the_shared_builders(SRC_ROOT)

    for service in sorted(DECLARED_SERVICE_PROCESSES):
        installed = _builders_installed_on_a_logger(importers[service])
        assert installed, service
        for line, builder in installed:
            assert builder in SERVICE_HANDLER_BUILDERS, f"{service}:{line} installs {builder}"


def test_the_service_handler_sweep_bites_a_projection_cli_that_takes_it(tmp_path: Path) -> None:
    """MORDE for the check above — a green that cannot turn red is the `rc=0` of `ADR-012`.

    The planted module is the falsifier `ADR-035/D3`'s amendment names in writing: something
    whose `stdout` is a projection and which nonetheless installs the service handler. If one
    ever appears for real, the guarantee was hung on the wrong axis (a list of processes instead
    of the destination of `stdout`), and `DECLARED_SERVICE_PROCESSES` stops being the right
    question to ask.
    """
    planted = tmp_path / "src" / "modules" / "sentimento" / "infra"
    planted.mkdir(parents=True)
    (planted / "planted_service_handler_cli.py").write_text(
        '"""A projection CLI taking the SERVICE handler — the promotion done by half."""\n'
        "\n"
        "import logging\n"
        "\n"
        f"from {CLI_MODULE_NAME} import build_service_stdout_handler\n"
        "\n"
        "logger = logging.getLogger(__name__)\n"
        "\n\n"
        "def report() -> None:\n"
        '    """Emit the canonical line through a handler that is able to decorate it."""\n'
        "    logger.addHandler(build_service_stdout_handler())\n"
        '    logger.info("{}")\n',
        encoding="utf-8",
    )

    taking = _modules_installing_the_service_handler(tmp_path / "src")

    assert taking == frozenset({"src/modules/sentimento/infra/planted_service_handler_cli.py"})
    assert not taking <= DECLARED_SERVICE_PROCESSES
