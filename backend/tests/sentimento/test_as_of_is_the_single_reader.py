"""Proof that `as_of` is the ONLY path by which a stored series turns into a number.

"Acessor UNICO" is the half of this task that is lost first, and losing it is silent: two read
paths do not fail, they DIVERGE — one of them applies R-2 and the other does not, and the two
answers are both plausible. So this file does not assert "I looked and found nothing". It scans
`backend/src` and pins the exact, measured set of places that touch a read-path column, so a
second reader appearing anywhere in the tree turns a green suite red.

⚠️ WHAT THIS FILE DOES NOT PROVE, SAID OUT LOUD BECAUSE `ADR-012` NAMES THE TRAP. There is no
store in this repository yet and no consumer of this module, so the "nobody else imports it"
half is VACUOUS today — and `rc=0` over an empty universe is indistinguishable from `rc=0` over
a universe that was checked. The `morde` side of the column scan is therefore NOT vacuous and is
what carries the weight: `backend/src` has 116 modules, FOUR of which legitimately touch a
read-path column (`as_of_accessor.py`, `provenance.py`, `sqlite_series_quarantine_store.py` and
`write_series_row.py`, all named in `DECLARED_TOUCHERS` below), and the scan finds exactly those
four — no more, no fewer.

    python3 -c "from pathlib import Path; print(len(list(Path('backend/src').rglob('*.py'))))"
    # 116                                       [MEASURED 2026-09-02, T-07.5]

The previous version of this sentence said `36` and `TWO`, and both were already stale by the
time `T-07.5` read them: `DECLARED_TOUCHERS` already carried a third entry
(`sqlite_series_quarantine_store.py`, added by `T-02.2`) that this docstring never mentioned, and
the module count had grown along with the rest of `backend/src`. The `116` matters beyond
bookkeeping: it is the floor of the anti-vacuity guard below, so a stale, lower number puts the
reader further from believing the guard has slack it does not have. The `36` measurement's own
history is in `docs/context/plataforma-dados/gates/T-04.4-builder.md`.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path

from src.modules.sentimento.domain import as_of_accessor
from src.modules.sentimento.domain.as_of_accessor import AsOfReading

SRC_ROOT = Path(__file__).resolve().parents[2] / "src"
"""`backend/src` — the production tree, resolved from this file so it does not depend on cwd."""

READ_PATH_COLUMNS = frozenset({"observed_at", "available_at", "bucket_end"})
"""The three columns a series read has to consult, and the three a second reader would need.

They are the terms of R-1, R-2 and the knowledge horizon. A module that touches none of them
cannot be reducing a series to a value at a decision instant; a module that touches any of them
is either this accessor or a second read path.
"""

# ── THE DECLARED SET, AND EVERY ENTRY CARRIES ITS REASON ───────────────────────────────────
#
# This is a PIN over a MEASURED set, not an allowlist that absolves. Each entry names the
# enclosing functions permitted to touch the columns, so a new function inside an
# already-listed module is caught too — which is where a second reader would most naturally be
# born, next to code that already has the row in its hands.
DECLARED_TOUCHERS: dict[str, frozenset[str]] = {
    # The accessor itself. `as_of` and its four private helpers are ONE read path split for
    # `C90` (max-complexity 10); `AsOfReading.projection` reads the winning row back out.
    "modules/sentimento/domain/as_of_accessor.py": frozenset(
        {"as_of", "_r2_admits", "_first_observation_order", "projection"}
    ),
    # WRITE path, not read path, and the distinction is the whole point: `reject_clock_skew`
    # compares a row against ITSELF (`event_time` against `available_at`) to decide whether it
    # may be STORED. It never sees a decision instant, so it cannot answer "what was the value
    # at `t`" — which is what a second reader would be.
    "modules/sentimento/domain/provenance.py": frozenset({"reject_clock_skew"}),
    # `T-02.2`: ANOTHER write path, same category as `provenance.py` above. `record()` persists
    # `entry.available_at` (always `None` in F0 — `domain/quarantine_terms.py`'s
    # `COINALYZE_ONE_SHOT_TERMS` never sets it) and never compares it against a decision instant
    # `t`. `read_promoted()` in the SAME module does not appear here on purpose: it filters
    # `available_at IS NOT NULL` in a SQL STRING (a presence check, "has this row been
    # promoted", never "what was the value at t") and never touches `.available_at` as a Python
    # attribute — `ast.Attribute` cannot see inside a string, and there is nothing to declare.
    "modules/sentimento/infra/sqlite_series_quarantine_store.py": frozenset({"record"}),
    # `T-07.5`: a THIRD write path, same category as the two above. `write_series_row` reads
    # `row.bucket_end` only to put it in a `logger.info` `extra={}` dict, identifying WHICH
    # bucket a write outcome was about — never comparing it against a decision instant `t`, and
    # never returning a value "as of" anything. `D7.16`'s own comparison
    # (`modeled_write_overwrites_observed`, `domain/provenance.py`) does not touch a read-path
    # column at all: it takes the caller's already-computed `observed_already_present: bool`,
    # which is exactly why it needs no entry here.
    "modules/sentimento/use_cases/write_series_row.py": frozenset({"write_series_row"}),
}


class _ColumnToucherVisitor(ast.NodeVisitor):
    """Collect the names of the functions that reference a read-path column, per module.

    A class rather than a closure because `ruff`'s `B023` is right about the closure: a nested
    function that reads a loop variable is a real hazard, and the scan is over a loop of files.
    """

    def __init__(self) -> None:
        """Start with an empty scope stack and an empty hit set."""
        self.scope: list[str] = []
        self.hits: set[str] = set()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        """Push the function name, walk its body, pop it."""
        self._in_scope(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:  # noqa: N802
        """Push the coroutine name, walk its body, pop it."""
        self._in_scope(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:  # noqa: N802
        """Record the enclosing function when the attribute is a read-path column."""
        if node.attr in READ_PATH_COLUMNS:
            self.hits.add(self.scope[-1] if self.scope else "<module>")
        self.generic_visit(node)

    def _in_scope(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()


def _touchers() -> dict[str, set[str]]:
    """Return, per production module, the functions that reference a read-path column."""
    found: dict[str, set[str]] = {}
    for path in sorted(SRC_ROOT.rglob("*.py")):
        visitor = _ColumnToucherVisitor()
        visitor.visit(ast.parse(path.read_text(encoding="utf-8")))
        if visitor.hits:
            found[path.relative_to(SRC_ROOT).as_posix()] = visitor.hits
    return found


def test_the_set_of_modules_touching_a_read_path_column_is_exactly_the_declared_one() -> None:
    """A new module reading `observed_at`/`available_at`/`bucket_end` fails here."""
    assert set(_touchers()) == set(DECLARED_TOUCHERS)


def test_inside_those_modules_the_set_of_functions_is_exactly_the_declared_one() -> None:
    """A new FUNCTION next to the existing ones fails here — the likelier way a fork is born."""
    measured = _touchers()
    for module, functions in DECLARED_TOUCHERS.items():
        assert measured[module] == set(functions), module


def test_the_scan_has_a_non_empty_universe_so_a_green_result_means_something() -> None:
    """`ADR-012`: `rc=0` over an empty universe cannot tell "clean" from "never looked"."""
    modules = list(SRC_ROOT.rglob("*.py"))
    assert len(modules) >= 116, f"only {len(modules)} modules scanned — the universe collapsed"


def test_exactly_one_public_callable_in_the_module_produces_a_reading() -> None:
    """The uniqueness stated inside the module: one function returns `AsOfReading`.

    `reject_delay_threshold_above_staleness` is public and is NOT an accessor — it returns
    `None` and only refuses. The distinction is the return type, so this test asks for it
    directly instead of trusting the naming.
    """
    producers = [
        name
        for name, member in vars(as_of_accessor).items()
        if not name.startswith("_")
        and inspect.isfunction(member)
        and member.__module__ == as_of_accessor.__name__
        and inspect.signature(member).return_annotation in {AsOfReading, "AsOfReading"}
    ]
    assert producers == ["as_of"]


def test_no_production_module_imports_this_accessor_yet_and_that_is_recorded_not_claimed() -> None:
    """Today's importer set is EMPTY, which is a fact about the tree and not a proof of safety.

    It is pinned so that the first consumer — `T-05.1`'s canonical grid is the likely one — is
    forced to notice this file and extend it, rather than quietly becoming importer number one.
    """
    importers = set()
    for path in SRC_ROOT.rglob("*.py"):
        if path.name == "as_of_accessor.py":
            continue
        if "as_of_accessor" in path.read_text(encoding="utf-8"):
            importers.add(path.relative_to(SRC_ROOT).as_posix())
    assert importers == set()
