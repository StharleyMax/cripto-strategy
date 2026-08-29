"""`ADR-008` D1+D2+D3: ONE named query, a named logger on `stdout`, and no silent verdict."""

from __future__ import annotations

import ast
import hashlib
import io
import json
import logging
import os
import subprocess
import sys
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path

import pytest

from src.modules.sentimento.domain.ingest_record import (
    INGEST_HEALTH_GAP_COLUMNS,
    INGEST_HEALTH_RUN_COLUMNS,
    KNOWN_VERDICTS,
    VERDICTS_SPELLED_IN_THE_SPEC,
    IngestGap,
    IngestHealthReport,
    IngestRun,
    UnknownVerdictError,
)
from src.modules.sentimento.infra import ingest_health_cli
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import (
    INGEST_HEALTH_QUERY_NAME,
    ingest_health_query,
)
from tests.helpers.ingest_record_driver import build_run

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = BACKEND_ROOT / "src"

# ── THE LISTS BELOW ARE AN INDEPENDENT TRANSCRIPTION, AND THAT IS NOT DUPLICATION ──────────
#
# They were copied BY HAND from `ADR-008/D3` and from `SPEC-001` §3.5, and they exist in order
# NOT to be `INGEST_HEALTH_RUN_COLUMNS`. An earlier version of this test compared the
# projection against the very constant the projection derives from — and a MUTATION that
# swapped two columns passed GREEN, because both sides of the comparison moved together
# `[MEDIDO 2026-08-29: mutant "two of the 15 columns swap order" -> `bash backend/scripts/
#  test.sh` rc=0, 17 passed; with the transcription below -> 2 tests fail]`.
#
# A control that returns the same number on both sides is not measuring. If somebody reorders
# or renames a column in `domain`, what fails is the comparison against this transcription, and
# the correct repair is to reopen the ADR — never to edit the two lists until they agree.
#
# THE SAME DISCIPLINE IS APPLIED TO THE `verdict` ENUMERATION further down, and it was NOT
# applied there in the delivered version: the `/review` of 2026-08-29 found the same family one
# constant along.
ADR_008_D3_RUN_COLUMNS: tuple[str, ...] = (
    "run_id",
    "source",
    "endpoint",
    "window",
    "n_expected",
    "n_returned",
    "n_written",
    "verdict",
    "api_code",
    "src_sha256",
    "weight_used",
    "observer_id",
    "observer_region",
    "clock_skew_ms",
    "janela_de_perda",
)

# The enumeration as DELIVERED by `T-02.3`, transcribed so that it is not the constant under
# test. Two of the three are literal in `SPEC-001`; `ACCEPTED` is the `[INFERRED]` member, and
# the test below is what stops the inference from growing quietly.
KNOWN_VERDICTS_TRANSCRIBED: frozenset[str] = frozenset(
    {"ACCEPTED", "ACCEPTED_WITH_WARNING", "REJECTED"}
)

SPEC_001_3_5_GAP_COLUMNS: tuple[str, ...] = (
    "source",
    "symbol",
    "series_key_id",
    "from_ts",
    "to_ts",
    "n_missing",
    "class",
    "detected_at",
)


class FakeIngestRecordSource:
    """A source with whatever rows the test needs — including rows nobody could write."""

    def __init__(self, runs: tuple[IngestRun, ...], gaps: tuple[IngestGap, ...] = ()) -> None:
        """Hold the rows this source will hand to the named query."""
        self._runs = runs
        self._gaps = gaps

    def runs(self) -> tuple[IngestRun, ...]:
        """Return the runs this source was built with."""
        return self._runs

    def gaps(self) -> tuple[IngestGap, ...]:
        """Return the gaps this source was built with."""
        return self._gaps


def _run_with_verdict(index: int, verdict: str) -> IngestRun:
    return replace(build_run(index), verdict=verdict)


def _gap() -> IngestGap:
    return IngestGap(
        source="binance-futures",
        symbol="MATICUSDT",
        series_key_id="oi-5m",
        from_ts="2026-08-12T11:45:00Z",
        to_ts="2026-08-12T12:05:00Z",
        n_missing=3,
        gap_class="SOURCE_GAP",
        detected_at="2026-08-29T02:00:00Z",
    )


def _definitions_named(name: str, roots: tuple[Path, ...]) -> list[str]:
    """Find every `def`/`class` binding of `name`, by AST — never by matching a line of text.

    THIS SCANNER READS STRUCTURE ON PURPOSE. The defect family this repository keeps catching
    is "a search method that does not see what it claims to see", and a regex over lines is
    exactly the tool that misses `def  ingest_health_query`, a definition inside a class, or
    one produced by a decorator — while happily counting the word inside a docstring.

    ⚠️ AND IT HAS A FOURTH BLIND SPOT OF ITS OWN, WHICH IS THE POINT OF WRITING THIS DOWN. It
    walks `FunctionDef`, `AsyncFunctionDef` and `ClassDef`, so a module that BINDS the shared
    name by ASSIGNMENT — `ingest_health_query = _other_impl`, or a `lambda` — installs a second
    implementation while this scan keeps answering "exactly one"
    `[MEDIDO 2026-08-29 by the /qa: this function over the tree plus one planted module with
     `ingest_health_query = _really_the_second_implementation` -> 1 definition, the duplicate
     INVISIBLE; the same with a `lambda` -> 1]`.

    A scanner that names three blind spots and hides a fourth is the very defect this docstring
    congratulates itself for avoiding, so: the assignment shape is covered by
    `test_ingest_health_contract_guards.py::_bindings_named`, which the `/qa` wrote, and
    `ADR-008/DoD-1` ("exactly ONE definition in the repository") is the CONJUNCTION of the two
    scans. NEITHER ALONE IS THE CLAIM. A fifth shape — a definition reached only at runtime,
    through `setattr` or an import hook — is beyond any AST and stays `[NAO MEDIDO]`.
    """
    found: list[str] = []
    for root in roots:
        for module in sorted(root.rglob("*.py")):
            tree = ast.parse(module.read_text(encoding="utf-8"), filename=str(module))
            for node in ast.walk(tree):
                if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
                    continue
                if node.name == name:
                    found.append(f"{module}:{node.lineno}")
    return sorted(found)


def _print_calls(roots: tuple[Path, ...]) -> list[str]:
    """Find every call to the builtin `print`, by AST, across the given roots."""
    found: list[str] = []
    for root in roots:
        for module in sorted(root.rglob("*.py")):
            tree = ast.parse(module.read_text(encoding="utf-8"), filename=str(module))
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    callee = node.func
                    if isinstance(callee, ast.Name) and callee.id == "print":
                        found.append(f"{module}:{node.lineno}")
    return sorted(found)


@pytest.fixture
def isolated_cli_logger() -> Iterator[io.StringIO]:
    """Point the CLI's named logger at a buffer and put it back exactly as it was."""
    logger = ingest_health_cli.logger
    stream = io.StringIO()
    previous_handlers = list(logger.handlers)
    previous_level = logger.level
    previous_propagate = logger.propagate
    logger.handlers = [ingest_health_cli.build_stdout_handler(stream)]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    try:
        yield stream
    finally:
        logger.handlers = previous_handlers
        logger.setLevel(previous_level)
        logger.propagate = previous_propagate


# ── `ADR-008/D3` — the query is ONE, and its columns are a contract ────────────────────────


def test_the_named_query_has_exactly_one_definition_under_backend_src() -> None:
    """`ADR-008/DoD-1`: exactly ONE definition of `ingest_health_query` in the source tree."""
    definitions = _definitions_named(INGEST_HEALTH_QUERY_NAME, (SRC_ROOT,))
    assert len(definitions) == 1, f"definicoes encontradas: {definitions}"
    assert definitions[0].startswith(str(SRC_ROOT / "modules" / "sentimento" / "use_cases"))


def test_the_single_definition_scan_bites_a_planted_duplicate(tmp_path: Path) -> None:
    """The OTHER side of the same pass: plant a second definition and the scan must see it.

    A guard that returns the same number with and without a violator is not measuring
    anything. This test and the one above run the SAME scanner over two universes.
    """
    duplicate = tmp_path / "second_implementation.py"
    duplicate.write_text(
        '"""A second implementation of the shared query — exactly what ADR-008 forbids."""\n'
        "\n\n"
        f"def {INGEST_HEALTH_QUERY_NAME}(source: object) -> None:\n"
        '    """Return nothing at all, quietly."""\n'
        "    return None\n",
        encoding="utf-8",
    )
    definitions = _definitions_named(INGEST_HEALTH_QUERY_NAME, (SRC_ROOT, tmp_path))
    assert len(definitions) == 2, f"o varredor ficou cego ao duplicado: {definitions}"


def test_the_column_contract_still_matches_what_adr_008_and_the_spec_wrote() -> None:
    """The constants in `domain` are checked against a HAND-TRANSCRIBED copy of the documents.

    This is the half that the projection test cannot do for itself: `_project_run` reads
    `INGEST_HEALTH_RUN_COLUMNS`, so comparing the two would compare a value with itself.
    """
    assert INGEST_HEALTH_RUN_COLUMNS == ADR_008_D3_RUN_COLUMNS
    assert INGEST_HEALTH_GAP_COLUMNS == SPEC_001_3_5_GAP_COLUMNS


def test_the_verdict_enumeration_cannot_grow_or_shrink_without_somebody_signing_for_it() -> None:
    """The containment the `/review` prescribed, and it is the guard on my OWN `[INFERRED]`.

    The first line pins what the SPEC literally SPELLS. The second is the one that matters: it
    says the delivered enumeration exceeds the document by EXACTLY ONE member, and names it. On
    the day a fourth value enters by inference, this fails — which is the whole point, because
    an inference that can grow in silence is not an inference any more, it is an invention.

    It is deliberately NOT the answer to the open question. `quant-architect` owns the
    enumeration; whoever answers changes this line in the same commit that changes `domain`,
    and that is `ADR-008/DoD-3` applied to the enum instead of to the consumers.
    """
    assert VERDICTS_SPELLED_IN_THE_SPEC == ("ACCEPTED_WITH_WARNING", "REJECTED")
    assert KNOWN_VERDICTS - set(VERDICTS_SPELLED_IN_THE_SPEC) == {"ACCEPTED"}
    assert KNOWN_VERDICTS == KNOWN_VERDICTS_TRANSCRIBED


def test_the_projection_carries_exactly_the_fifteen_columns_adr_008_fixed() -> None:
    """The 15 run columns, in the fixed order — reordering them changes every fingerprint."""
    health = ingest_health_query(FakeIngestRecordSource((build_run(0),), (_gap(),)))
    lines = health.canonical_lines()

    assert json.loads(lines[0]) == {"query": INGEST_HEALTH_QUERY_NAME, "n_runs": 1, "n_gaps": 1}
    assert json.loads(lines[1]) == {"section": "ingest_run", "n": 1}
    assert list(json.loads(lines[2])) == list(ADR_008_D3_RUN_COLUMNS)
    assert json.loads(lines[3]) == {"section": "ingest_gap", "n": 1}
    assert list(json.loads(lines[4])) == list(SPEC_001_3_5_GAP_COLUMNS)
    # The `md.ingest_gap` column is still called `class` on the wire even though the dataclass
    # field is `gap_class` — renaming it would break S1 with no Python test complaining.
    assert json.loads(lines[4])["class"] == "SOURCE_GAP"


def test_the_loss_window_column_is_present_and_explicitly_not_computed_in_f0() -> None:
    """`janela_de_perda` exists in the projection and is `null` — never a number nobody measured.

    `D7.12` makes it a FORMULA per series and gives it an owner in `T-07.12`. Dropping the
    column would let S1 reintroduce it under another name; filling it would publish a
    retention window this phase never measured.
    """
    health = ingest_health_query(FakeIngestRecordSource((build_run(0),)))
    projected = json.loads(health.canonical_lines()[2])
    assert "janela_de_perda" in projected
    assert projected["janela_de_perda"] is None


def test_the_fingerprint_follows_the_projection_byte_for_byte() -> None:
    """The `sha256` `ADR-008/DoD-2` compares is over exactly the bytes the CLI writes."""
    health = ingest_health_query(FakeIngestRecordSource((build_run(0),), (_gap(),)))
    expected = hashlib.sha256(health.canonical_projection().encode("utf-8")).hexdigest()
    assert health.fingerprint() == expected


def test_two_reports_over_the_same_state_have_the_same_fingerprint() -> None:
    """Same state, same bytes — otherwise `DoD-2` could never distinguish signal from noise."""
    rows = (build_run(1), build_run(0))
    first = IngestHealthReport(runs=rows, gaps=(_gap(),))
    second = IngestHealthReport(runs=rows, gaps=(_gap(),))
    assert first.fingerprint() == second.fingerprint()


def test_a_different_state_moves_the_fingerprint() -> None:
    """And the control on the line above: if the state changes, the fingerprint MUST change."""
    one = IngestHealthReport(runs=(build_run(0),), gaps=())
    other = IngestHealthReport(runs=(build_run(1),), gaps=())
    assert one.fingerprint() != other.fingerprint()


# ── `ADR-008/DoD-3` — the unheard-of `verdict`: both change together or both fail ──────────


@pytest.mark.parametrize("verdict", sorted(KNOWN_VERDICTS_TRANSCRIBED))
def test_every_known_verdict_passes_the_shared_query(verdict: str) -> None:
    """At least one run of EACH known verdict goes through — the query is not simply strict.

    PARAMETRISED OVER THE TRANSCRIPTION, NEVER OVER `KNOWN_VERDICTS`. The delivered version
    used `sorted(KNOWN_VERDICTS)` — the same constant `ingest_health_query` consults to decide
    — so shrinking the enumeration shrank the parametrisation and the test stayed green with
    FEWER cases `[MEDIDO 2026-08-29 by the /review: mutant "`VERDICTS_SPELLED_IN_THE_SPEC` loses
    `REJECTED`" -> `bash backend/scripts/test.sh` rc=0, SURVIVED]`. It is the same family as
    the column mutant above, one constant along.
    """
    health = ingest_health_query(FakeIngestRecordSource((_run_with_verdict(0, verdict),)))
    assert health.runs[0].verdict == verdict


def test_a_verdict_no_consumer_knows_makes_the_shared_query_fail_loudly() -> None:
    """`ADR-008/DoD-3`, the F0 half: an unheard-of `verdict` REPROVES instead of hiding the run.

    This is the falsifier of the whole ADR, and it only works because there is ONE place where
    the decision is taken. When `T-07.13` wires S1 to this same function, a new verdict breaks
    both consumers at once. A consumer that quietly dropped the row would be the second
    implementation — and the defect would be invisible, which is why it gets a test and not a
    paragraph.
    """
    unheard_of = _run_with_verdict(0, "ACCEPTED_WITH_QUARANTINE")
    with pytest.raises(UnknownVerdictError) as raised:
        ingest_health_query(FakeIngestRecordSource((unheard_of,)))
    assert "ACCEPTED_WITH_QUARANTINE" in str(raised.value)


def test_an_unknown_verdict_persisted_by_someone_else_still_reproves(tmp_path: Path) -> None:
    """The same falsifier through the REAL store: writing the row is allowed, hiding it is not.

    The record is written RAW — the phase plan says so — so a collector that observes a new
    verdict must be able to persist it. What must never happen is the shared read path showing
    the record as if it understood it.
    """
    store = SqliteIngestRecordStore(tmp_path / "record.sqlite3")
    store.initialise()
    store.record_run(_run_with_verdict(0, "ACCEPTED_WITH_QUARANTINE"))

    assert len(store.runs()) == 1, "o store CRU aceita o verdict novo — e tem de aceitar"
    with pytest.raises(UnknownVerdictError):
        ingest_health_query(store)


# ── `ADR-008/D1`+`D2` — relatorio de CLI, registrador nomeado, nunca `print` ───────────────


def test_the_cli_writes_the_canonical_projection_through_its_named_logger(
    tmp_path: Path, isolated_cli_logger: io.StringIO
) -> None:
    """`ADR-008/D2`: the report leaves through a logger named after the module, onto a stream."""
    store_path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))
    store.record_gap(_gap())

    emitted = ingest_health_cli.report(store_path)
    written = isolated_cli_logger.getvalue().rstrip("\n")

    assert ingest_health_cli.logger.name == "src.modules.sentimento.infra.ingest_health_cli"
    assert written == emitted
    expected = ingest_health_query(SqliteIngestRecordStore(store_path)).fingerprint()
    assert hashlib.sha256(written.encode("utf-8")).hexdigest() == expected


def test_the_cli_entrypoint_wires_the_logger_and_reports(tmp_path: Path) -> None:
    """`main` is the composition root: it wires `stdout` and reports, returning 0."""
    store_path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))

    # `main` MUTATES TWO LOGGERS, not one, and both are restored here. Restoring only the CLI
    # logger would leave the `src` logger of the whole application holding a stderr handler and
    # `propagate = False` for the rest of the session — global state leaking out of a test,
    # which is the kind of thing that makes a LATER test fail for a reason nobody can find.
    cli_logger = ingest_health_cli.logger
    app_logger = logging.getLogger(ingest_health_cli._APPLICATION_LOGGER)
    saved = [
        (log, list(log.handlers), log.level, log.propagate) for log in (cli_logger, app_logger)
    ]
    try:
        assert ingest_health_cli.main([str(store_path)]) == 0
        assert cli_logger.handlers, "main has to install the stdout logger"
        assert app_logger.handlers, "main has to take diagnostics off the product stream"
        assert app_logger.propagate is False
    finally:
        for log, handlers, level, propagate in saved:
            log.handlers = handlers
            log.setLevel(level)
            log.propagate = propagate


def test_the_product_never_leaks_onto_the_diagnostic_stream(tmp_path: Path) -> None:
    """`stdout` carries the projection and `stderr` carries NONE of it — the split is two-way.

    ── THIS TEST EXISTS BECAUSE A MUTANT SURVIVED, AND THE MUTANT WAS MINE ────────────────

    Routing this application's diagnostics to `stderr` (the fix for the `/qa` defect) MOVED
    where `logger.propagate = False` earns its keep. Before the fix, flipping it duplicated
    every line onto `stdout` and broke the `sha256`. After the fix, the CLI logger's records
    propagate up to the `src` logger, whose handler is on `stderr` — so `stdout` stays
    perfectly correct and every existing test, including the `/qa`'s, still passes
    `[MEDIDO 2026-08-29, private bench, mutant J "propagate = False -> True":
     `bash backend/scripts/test.sh` rc=0, 55 passed, SURVIVED; and the same hosted process hands
     back the 5 product lines REPEATED on `stderr`, prefixed `INFO src.modules…`]`.

    A line on a covered statement that no mutant can reach is a line nobody is measuring. The
    property it actually protects now is this one, and it is not cosmetic: an operator running
    the report under `cron` writes `cmd >record.jsonl 2>&1` by reflex, and with the product on
    both streams that merged file holds every row twice — which is neither valid JSON Lines nor
    the projection `ADR-008/DoD-2` compares.
    """
    store_path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    for index in range(2):
        store.record_run(build_run(index))
    expected = ingest_health_query(SqliteIngestRecordStore(store_path)).canonical_lines()

    hosted = (
        "import logging, sys\n"
        "logging.basicConfig(stream=sys.stdout, format='%(message)s', level=logging.INFO)\n"
        "from src.modules.sentimento.infra.ingest_health_cli import main\n"
        "raise SystemExit(main(sys.argv[1:]))\n"
    )
    completed = subprocess.run(
        [sys.executable, "-c", hosted, str(store_path)],
        cwd=str(BACKEND_ROOT),
        env=dict(os.environ, PYTHONPATH=str(BACKEND_ROOT)),
        capture_output=True,
        text=True,
        check=True,
    )

    assert completed.stdout.rstrip("\n").split("\n") == list(expected)
    leaked = [line for line in expected if line in completed.stderr]
    assert leaked == [], f"the product leaked onto the diagnostic stream: {len(leaked)} line(s)"


def test_the_cli_entrypoint_refuses_a_call_without_a_store_path() -> None:
    """No store, no report — and the refusal is explicit rather than a silent empty table."""
    with pytest.raises(SystemExit):
        ingest_health_cli.main([])


def test_no_module_under_src_calls_print() -> None:
    """`core.print-statement` as a structural check: zero calls to the builtin `print`."""
    assert _print_calls((SRC_ROOT,)) == []


def test_the_print_scan_bites_a_planted_call(tmp_path: Path) -> None:
    """And the other side, in the same pass: plant a `print` and the scanner must see it.

    The scanner is AST-based on purpose, so it catches `print(...)` in places the blocking
    rule cannot reach: its regex is anchored to the start of a line, so a call nested inside a
    comprehension or handed as the argument of another call escapes it. The planted case below
    is exactly that shape. Empty output from a search is not the same as no violation.
    """
    planted = tmp_path / "with_print.py"
    planted.write_text(
        '"""A module that prints, which is what the rule and this test both forbid."""\n'
        "\n\n"
        "def emit() -> None:\n"
        '    """Print instead of logging."""\n'
        "    _ = [print(item) for item in range(1)]\n",
        encoding="utf-8",
    )
    assert len(_print_calls((SRC_ROOT, tmp_path))) == 1
