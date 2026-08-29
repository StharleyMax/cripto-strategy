"""Guards for four claims the delivered suite makes in prose and never puts under a mutant.

EVERY TEST HERE WAS BORN FROM A SURVIVING MUTANT, AND EACH ONE NAMES ITS OWN
`[MEDIDO 2026-08-29, bancada re-rodada com `PYTHONDONTWRITEBYTECODE=1` e `__pycache__`
 apagado entre mutantes, cada arvore restaurada conferida por `sha256` E por importacao
 efetiva; n = 11 mutantes, 6 mortos, 5 sobreviventes]`. A hundred per cent of statements
covered with zero misses is not the absence of a defect: it is the absence of a STATEMENT
nobody ran, which is a different sentence. The five survivors below were all on covered lines.
"""

from __future__ import annotations

import ast
import hashlib
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from src.modules.sentimento.domain.ingest_record import (
    KNOWN_VERDICTS,
    VERDICTS_SPELLED_IN_THE_SPEC,
    IngestGap,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import (
    INGEST_HEALTH_QUERY_NAME,
    ingest_health_query,
)
from tests.helpers.ingest_record_driver import build_run

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = BACKEND_ROOT / "src"
CLI_MODULE = "src.modules.sentimento.infra.ingest_health_cli"

# ── TRANSCRICAO INDEPENDENTE, PELO MESMO MOTIVO QUE A DAS 15 COLUNAS ───────────────────────
#
# `test_ingest_health_query.py::test_every_known_verdict_passes_the_shared_query` e
# parametrizado por `sorted(KNOWN_VERDICTS)` — a MESMA constante que `ingest_health_query`
# consulta para decidir. Os dois lados se movem juntos: encolher a enumeracao encolhe a
# parametrizacao, e o teste continua verde com menos casos
# `[MEDIDO 2026-08-29: mutante "VERDICTS_SPELLED_IN_THE_SPEC perde `REJECTED`" ->
#  `bash backend/scripts/test.sh` rc=0, SOBREVIVEU]`. E a mesma familia do mutante D que o
# builder ja tinha caçado nas colunas, uma constante adiante.
#
# Fonte das duas linhas abaixo, lidas e citadas: `SPEC-001` §5.6 escreve
# `verdict = 'ACCEPTED_WITH_WARNING'` e `NUNCA 'REJECTED'`; §5.7/`CA-F3-1` escrevem
# `verdict='REJECTED'` para `-1130`. Nenhum outro valor aparece escrito em `docs/`
# `[MEDIDO 2026-08-29: `grep -rn "ACCEPTED\|REJECTED" docs/ | wc -l` -> 15 ocorrencias,
#  nenhuma com um terceiro valor]`.
SPEC_001_VERDICTS_TRANSCRIBED_BY_HAND: tuple[str, str] = ("ACCEPTED_WITH_WARNING", "REJECTED")

# O terceiro membro e `[INFERRED]` no `domain` e a PERGUNTA DE DONO ESTA ABERTA para o
# `quant-architect` — este teste NAO a decide. Ele congela o conjunto de HOJE para que uma
# mudanca dele seja um ATO, e nao uma linha que ninguem viu passar: e literalmente o que
# `ADR-008/DoD-3` pede ("os dois mudam juntos ou os dois reprovam"). Quem responder a pergunta
# muda esta linha no mesmo commit em que muda o `domain`.
KNOWN_VERDICTS_AS_DELIVERED_BY_T_02_3: frozenset[str] = frozenset(
    {"ACCEPTED", "ACCEPTED_WITH_WARNING", "REJECTED"}
)


def _gap(symbol: str, detected_at: str) -> IngestGap:
    return IngestGap(
        source="binance-futures",
        symbol=symbol,
        series_key_id="oi-5m",
        from_ts="2026-08-12T11:45:00Z",
        to_ts="2026-08-12T12:05:00Z",
        n_missing=3,
        gap_class="SOURCE_GAP",
        detected_at=detected_at,
    )


# ── 1. A enumeracao de `verdict` nao pode encolher em silencio ─────────────────────────────


def test_the_verdicts_spelled_in_the_spec_match_a_hand_transcribed_reading_of_it() -> None:
    """The two verdicts written in `SPEC-001` are compared against a copy made by hand."""
    assert VERDICTS_SPELLED_IN_THE_SPEC == SPEC_001_VERDICTS_TRANSCRIBED_BY_HAND
    assert KNOWN_VERDICTS == KNOWN_VERDICTS_AS_DELIVERED_BY_T_02_3


@pytest.mark.parametrize("verdict", SPEC_001_VERDICTS_TRANSCRIBED_BY_HAND)
def test_each_verdict_the_spec_spells_out_survives_the_shared_query(
    tmp_path: Path, verdict: str
) -> None:
    """`ADR-008/DoD-2` asks for at least one run of EACH verdict — over a FIXED universe.

    Parametrising over `KNOWN_VERDICTS` would let the universe shrink together with the code
    under test. This one is parametrised over the transcription, so a shrinking enumeration
    turns a silent pass into `UnknownVerdictError` on the verdict that went missing.
    """
    path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(path)
    store.initialise()
    store.record_run(replace(build_run(0), verdict=verdict))

    assert ingest_health_query(SqliteIngestRecordStore(path)).runs[0].verdict == verdict


# ── 2. O `ORDER BY` e TOTAL, e o desempate e o que torna a impressao digital reproduzivel ──


def test_runs_sharing_a_start_instant_come_back_ordered_by_run_id(tmp_path: Path) -> None:
    """The tie-break in `_SELECT_RUNS` is load-bearing, and nothing measured it until here.

    `sqlite_ingest_record_store` claims in a comment that "o `ORDER BY` e TOTAL: ele termina
    numa chave unica em cada tabela, e nao num campo que empata", and the reason given is that
    `ADR-008/DoD-2` compares `sha256` of projections — an unstable order would make the
    falsifier of the whole ADR indistinguishable from noise. Every run in the delivered
    fixtures has a DISTINCT `started_at`, so dropping the tie-break changed nothing
    `[MEDIDO 2026-08-29: mutante "ORDER BY started_at, run_id -> ORDER BY started_at" ->
     `bash backend/scripts/test.sh` rc=0, SOBREVIVEU]`.

    The rows are written in DESCENDING `run_id` so insertion order and sorted order disagree:
    without the tie-break the read comes back in insertion order.
    """
    path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(path)
    store.initialise()
    same_instant = "2026-08-29T00:00:00Z"
    for index in (2, 1, 0):
        store.record_run(replace(build_run(index), started_at=same_instant))

    read_back = ingest_health_query(SqliteIngestRecordStore(path)).runs

    assert [run.run_id for run in read_back] == ["run-0000", "run-0001", "run-0002"]


def test_gaps_sharing_a_detection_instant_come_back_in_a_total_order(tmp_path: Path) -> None:
    """Same claim, same measurement, the other table: `md.ingest_gap` also ties on its clock."""
    path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(path)
    store.initialise()
    same_instant = "2026-08-29T02:00:00Z"
    for symbol in ("SOLUSDT", "ETHUSDT", "BTCUSDT"):
        store.record_gap(_gap(symbol, same_instant))

    read_back = ingest_health_query(SqliteIngestRecordStore(path)).gaps

    assert [gap.symbol for gap in read_back] == ["BTCUSDT", "ETHUSDT", "SOLUSDT"]


# ── 3. O relatorio na saida de um processo hospedeiro que JA configurou log ────────────────


def _report_stdout_from_a_host_that_configured_logging(store_path: Path) -> str:
    """Run the CLI inside a process that called `logging.basicConfig` first, as a host does.

    A `cron` wrapper, a scheduler or a supervisor configures the root logger before calling
    anything. The delivered suite only ever runs the CLI in a BARE interpreter, where the root
    logger has no handler at all — the one configuration in which none of this can show up.
    """
    hosted = (
        "import logging, sys\n"
        "logging.basicConfig(stream=sys.stdout, format='%(message)s', level=logging.INFO)\n"
        f"from {CLI_MODULE} import main\n"
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
    return completed.stdout.rstrip("\n")


def _store_with_three_runs(tmp_path: Path) -> Path:
    path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(path)
    store.initialise()
    for index in range(3):
        store.record_run(build_run(index))
    return path


def test_no_line_of_the_report_is_emitted_twice_when_the_host_configured_logging(
    tmp_path: Path,
) -> None:
    """`logger.propagate = False` is load-bearing, and until here nothing measured it.

    The comment on that line predicts exactly what its absence does — "o registrador raiz
    reemitiria cada linha, e a saida deixaria de ser a projecao canonica exata" — and the
    delivered suite never runs the CLI in a process whose root logger has a handler, so
    flipping the flag back changed no verdict `[MEDIDO 2026-08-29: mutante "propagate = True"
    -> `bash backend/scripts/test.sh` rc=0, SOBREVIVEU]`.
    """
    path = _store_with_three_runs(tmp_path)
    expected_lines = ingest_health_query(SqliteIngestRecordStore(path)).canonical_lines()

    emitted = _report_stdout_from_a_host_that_configured_logging(path).split("\n")

    duplicated = [line for line in expected_lines if emitted.count(line) != 1]
    assert duplicated == [], f"linha(s) reemitida(s) pelo registrador raiz: {duplicated}"


def test_the_report_of_a_hosted_process_is_still_exactly_the_canonical_projection(
    tmp_path: Path,
) -> None:
    """`ADR-008/DoD-2` compares `sha256` of what the CLI writes — and a host breaks it today.

    MEASURED, and the extra line is named `[MEDIDO 2026-08-29: com
    `logging.basicConfig(stream=sys.stdout, level=logging.INFO)` no processo hospedeiro, a
    PRIMEIRA linha de `stdout` passa a ser `ingest_health_query_lida`, o registro de
    diagnostico de `use_cases/ingest_health.py:57`, e a saida deixa de bater `sha256` com
    `IngestHealthReport.fingerprint()`]`.

    TWO DECLARED PROPERTIES BREAK AT ONCE, and both are quoted rather than inferred:
    `IngestHealthReport.canonical_lines` promises that "EVERY line is valid JSON on its own …
    so the raw record stays greppable and sortable line by line", and `ingest_health_cli`
    promises a "formato ESTAVEL" because "`ADR-008/DoD-2` compara o `sha256` do que sai daqui
    com o `sha256` do que alimenta S1". `ingest_health_query_lida` is not JSON and moves the
    fingerprint.

    THE CLI DEFENDED ITS OWN LOGGER AND ONLY THE OWN. `propagate = False` is set on
    `ingest_health_cli.logger`; the diagnostic loggers of `use_cases/ingest_health.py` and of
    `infra/sqlite_ingest_record_store.py` sit in the SAME call path, log at INFO, and reach
    whatever handler the host installed. Which fix to apply — diagnostics at DEBUG, a
    dedicated product stream, or `stderr` for diagnostics — is the builder's call and this
    test does not make it; it only refuses to let the choice stay implicit.
    """
    path = _store_with_three_runs(tmp_path)
    expected = ingest_health_query(SqliteIngestRecordStore(path)).fingerprint()

    emitted = _report_stdout_from_a_host_that_configured_logging(path)

    not_json = [line for line in emitted.split("\n") if not line.startswith("{")]
    assert not_json == [], f"linha nao-JSON contaminou o relatorio: {not_json}"
    assert hashlib.sha256(emitted.encode("utf-8")).hexdigest() == expected


# ── 4. O store nasce onde o operador pedir, e nao so onde o diretorio ja existia ───────────


def test_initialising_the_store_creates_the_missing_parent_directories(tmp_path: Path) -> None:
    """`parents=True` is a promise, and every fixture handed it a directory that already existed.

    `[MEDIDO 2026-08-29: mutante "mkdir(parents=True) -> mkdir(parents=False)" ->
     `bash backend/scripts/test.sh` rc=0, SOBREVIVEU]`. A record whose path is
    `data/registro/f0/ingest.sqlite3` on the first run of a fresh host is the ordinary case,
    not the exotic one.
    """
    path = tmp_path / "data" / "registro" / "f0" / "record.sqlite3"
    store = SqliteIngestRecordStore(path)
    store.initialise()
    store.record_run(build_run(0))

    assert path.exists()
    assert ingest_health_query(SqliteIngestRecordStore(path)).runs == (build_run(0),)


# ── 5. `ADR-008/DoD-1` — a definicao unica tambem tem forma de ATRIBUICAO ──────────────────


def _bindings_named(name: str, roots: tuple[Path, ...]) -> list[str]:
    """Find bindings of `name` made by ASSIGNMENT — the shape the delivered scanner cannot see.

    `test_ingest_health_query.py::_definitions_named` walks the AST looking for `FunctionDef`,
    `AsyncFunctionDef` and `ClassDef`. Its docstring names three shapes a line regex would
    miss and it is right about all three — but a module doing `ingest_health_query = _other`
    or `ingest_health_query = lambda source: None` binds the shared name to a SECOND
    implementation while the scan keeps answering "exactly one"
    `[MEDIDO 2026-08-29: `_definitions_named` sobre a arvore + um modulo plantado com
     `ingest_health_query = _really_the_second_implementation` -> 1 definicao, o duplicado
     INVISIVEL; o mesmo com `lambda` -> 1]`. `ADR-008/DoD-1` says "exactly ONE definition in
    the repository", so the two scans together are the claim, and neither alone is.
    """
    found: list[str] = []
    for root in roots:
        for module in sorted(root.rglob("*.py")):
            tree = ast.parse(module.read_text(encoding="utf-8"), filename=str(module))
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    targets: list[ast.expr] = list(node.targets)
                    lineno = node.lineno
                elif isinstance(node, ast.AnnAssign):
                    targets = [node.target]
                    lineno = node.lineno
                else:
                    continue
                for target in targets:
                    if isinstance(target, ast.Name) and target.id == name:
                        found.append(f"{module}:{lineno}")
    return sorted(found)


def test_no_module_binds_the_shared_query_name_by_assignment() -> None:
    """Today's tree binds `ingest_health_query` by `def` only — zero assignment bindings."""
    assert _bindings_named(INGEST_HEALTH_QUERY_NAME, (SRC_ROOT,)) == []


def test_the_assignment_scan_bites_a_planted_alias(tmp_path: Path) -> None:
    """The other side of the same pass: an aliased second implementation must be seen."""
    alias = tmp_path / "alias_implementation.py"
    alias.write_text(
        '"""A second implementation bound by assignment — what ADR-008/DoD-1 forbids."""\n'
        "\n\n"
        "def _second_implementation(source: object) -> None:\n"
        '    """Quietly return nothing."""\n'
        "    return None\n"
        "\n\n"
        f"{INGEST_HEALTH_QUERY_NAME} = _second_implementation\n",
        encoding="utf-8",
    )
    assert len(_bindings_named(INGEST_HEALTH_QUERY_NAME, (SRC_ROOT, tmp_path))) == 1
