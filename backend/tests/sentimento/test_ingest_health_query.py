"""`ADR-008` D1+D2+D3: ONE named query, a named logger on `stdout`, and no silent verdict."""

from __future__ import annotations

import ast
import hashlib
import io
import json
import logging
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path

import pytest

from src.modules.sentimento.domain.ingest_record import (
    INGEST_HEALTH_GAP_COLUMNS,
    INGEST_HEALTH_RUN_COLUMNS,
    KNOWN_VERDICTS,
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

# ── AS DUAS LISTAS ABAIXO SAO TRANSCRICAO INDEPENDENTE, E ISSO NAO E DUPLICACAO ────────────
#
# Elas foram copiadas A MAO de `ADR-008/D3` e de `SPEC-001` §3.5, e existem para nao serem
# `INGEST_HEALTH_RUN_COLUMNS`. Uma versao anterior deste teste comparava a projecao com a
# propria constante do `domain` — e uma MUTACAO que trocou duas colunas de ordem passou VERDE,
# porque os dois lados da comparacao se moviam juntos [MEDIDO 2026-08-29: mutante "duas das 15
# colunas trocam de ordem" -> 17 passed; com a transcricao abaixo -> reprova].
#
# Um controle que devolve o mesmo numero dos dois lados nao esta medindo. Se alguem reordenar
# ou renomear uma coluna no `domain`, quem reprova e a comparacao com esta transcricao, e o
# conserto correto e reabrir a ADR — nao editar as duas listas ate baterem.
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


# ── `ADR-008/D3` — a consulta e UMA, e as colunas dela sao contrato ────────────────────────


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


def test_the_projection_carries_exactly_the_fifteen_columns_adr_008_fixed() -> None:
    """The 15 run columns, in the fixed order — reordering them changes every fingerprint."""
    health = ingest_health_query(FakeIngestRecordSource((build_run(0),), (_gap(),)))
    lines = health.canonical_lines()

    assert json.loads(lines[0]) == {"query": INGEST_HEALTH_QUERY_NAME, "n_runs": 1, "n_gaps": 1}
    assert json.loads(lines[1]) == {"section": "ingest_run", "n": 1}
    assert list(json.loads(lines[2])) == list(ADR_008_D3_RUN_COLUMNS)
    assert json.loads(lines[3]) == {"section": "ingest_gap", "n": 1}
    assert list(json.loads(lines[4])) == list(SPEC_001_3_5_GAP_COLUMNS)
    # A coluna do `md.ingest_gap` continua se chamando `class` na saida, ainda que o campo do
    # dataclass seja `gap_class` — renomea-la quebraria S1 sem teste de Python nenhum reclamar.
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


# ── `ADR-008/DoD-3` — o `verdict` inedito: os dois mudam juntos ou os dois reprovam ────────


@pytest.mark.parametrize("verdict", sorted(KNOWN_VERDICTS))
def test_every_known_verdict_passes_the_shared_query(verdict: str) -> None:
    """At least one run of EACH known verdict goes through — the query is not simply strict."""
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
    inedito = _run_with_verdict(0, "ACCEPTED_WITH_QUARANTINE")
    with pytest.raises(UnknownVerdictError) as raised:
        ingest_health_query(FakeIngestRecordSource((inedito,)))
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

    logger = ingest_health_cli.logger
    previous_handlers, previous_level = list(logger.handlers), logger.level
    previous_propagate = logger.propagate
    try:
        assert ingest_health_cli.main([str(store_path)]) == 0
        assert logger.handlers, "main tem de instalar o registrador de stdout"
    finally:
        logger.handlers = previous_handlers
        logger.setLevel(previous_level)
        logger.propagate = previous_propagate


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
