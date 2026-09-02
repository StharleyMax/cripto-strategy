"""`ADR-002/D5`: exactly one production call site may reach `write_series_row`.

`write_series_row.py`'s own docstring names `run_single_writer.py` as the only caller. This file
is the watcher, in the shape `test_verified_edge_call_sites.py` already established for the same
family of guarantee (`ingest_verified`, `D`-shaped ordering gate): scan the AST of every module
under `backend/src`, count direct calls to the watched name, and fail the day a second one shows
up — a second production writer would reintroduce the concurrent-writer race `ADR-002/D5`
eliminates by construction, and it would do so silently: nothing else in this tree asserts that
only one path reaches the series sink.

⚠️ SAME BLIND SPOT AS `test_verified_edge_call_sites.py`, NAMED RATHER THAN HIDDEN: this scanner
sees a direct call `write_series_row(...)` and an aliased call `pull = write_series_row; pull()`,
but not `getattr(module, "write_series_row")(...)` with the name computed at runtime. That is the
same limit `[tool.importlinter]` already documents for its own import graph.
"""

from __future__ import annotations

import ast
from pathlib import Path

SOURCE_ROOT = Path(__file__).resolve().parents[2] / "src"
WATCHED_NAME = "write_series_row"
SANCTIONED_MODULE = "modules/sentimento/use_cases/run_single_writer.py"


def _call_sites(source: str, label: str = "<memory>") -> list[str]:
    """Return every place `WATCHED_NAME` is called or aliased, direct-call or attribute form."""
    tree = ast.parse(source)
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            target = node.func
            name = (
                target.id
                if isinstance(target, ast.Name)
                else target.attr
                if isinstance(target, ast.Attribute)
                else None
            )
            if name == WATCHED_NAME:
                found.append(f"{label}:{node.lineno}:call")
        elif (
            isinstance(node, ast.Name)
            and node.id == WATCHED_NAME
            and isinstance(node.ctx, ast.Load)
        ):
            # A bare reference that is NOT itself the callee of the `ast.Call` above — an alias
            # (`pull = write_series_row`) or an import. The definition site (`def
            # write_series_row(...)`) is an `ast.FunctionDef`, never an `ast.Name`, so it never
            # lands here.
            parent_calls = {n.func for n in ast.walk(tree) if isinstance(n, ast.Call)}
            if node not in parent_calls:
                found.append(f"{label}:{node.lineno}:reference")
    return found


def test_the_scanner_sees_a_direct_call() -> None:
    """FALSIFIER OF THE WATCHER, positive case: a planted direct call must be seen."""
    source = "from x import write_series_row\ndef f():\n    write_series_row(1)\n"
    calls = [entry for entry in _call_sites(source) if entry.endswith(":call")]
    assert calls, "the scanner missed a direct call"


def test_the_scanner_does_not_fire_on_an_unrelated_name() -> None:
    """A watcher that over-fires on `write_series_column`/`write_series_rows` gets switched off."""
    source = "def f():\n    write_series_column(1)\n    x = write_series_rows\n"
    assert _call_sites(source) == []


def test_exactly_one_production_module_calls_write_series_row() -> None:
    """THE GATE. The day this count reaches 2, `ADR-002/D5`'s single writer has a rival."""
    found: list[str] = []
    for module in sorted(SOURCE_ROOT.rglob("*.py")):
        text = module.read_text(encoding="utf-8")
        found.extend(_call_sites(text, str(module.relative_to(SOURCE_ROOT))))

    calls = [entry for entry in found if entry.endswith(":call")]
    assert len(calls) == 1, f"more than one production call site: {calls}"
    assert calls[0].startswith(SANCTIONED_MODULE), calls


def test_the_source_tree_the_gate_scans_is_not_empty() -> None:
    """`ADR-012`: `rc=0` over an empty universe cannot tell "clean" from "never looked"."""
    modules = list(SOURCE_ROOT.rglob("*.py"))
    assert SOURCE_ROOT.is_dir(), SOURCE_ROOT
    assert len(modules) >= 10, f"scanned {len(modules)} modules — the root is wrong"


def test_the_docstrings_pointing_at_this_guard_cite_a_file_that_exists() -> None:
    """QA falsifier: two production docstrings cite a guard file that was never written.

    `write_series_row.py` and `run_single_writer.py` each cite this guard by path in their own
    docstring — `tests/sentimento/test_write_series_row_call_sites.py` — but that path is not
    this file's name (`test_single_writer_call_sites.py`) and no file by that cited name exists
    anywhere under `backend/tests`. A citation to a file that was never written is the same
    defect this repo's own doctrine names for a number without the command that produced it: a
    reader who follows the citation gets nothing, and nothing in the test suite ever caught the
    drift between the name the guard shipped with and the name its two callers still cite.
    """
    cited_path = "tests/sentimento/test_write_series_row_call_sites.py"
    tests_root = Path(__file__).resolve().parents[1]
    write_series_row_source = (
        SOURCE_ROOT / "modules/sentimento/use_cases/write_series_row.py"
    ).read_text(encoding="utf-8")
    run_single_writer_source = (
        SOURCE_ROOT / "modules/sentimento/use_cases/run_single_writer.py"
    ).read_text(encoding="utf-8")
    assert cited_path in write_series_row_source
    assert cited_path in run_single_writer_source
    cited_file = tests_root.parent / cited_path
    assert cited_file.is_file(), (
        f"write_series_row.py and run_single_writer.py cite '{cited_path}', but no such file "
        f"exists — the guard actually shipped as '{Path(__file__).name}'"
    )
