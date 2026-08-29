"""The ordering guarantee of `ingest_verified` has a WATCHER now, not a comment describing one.

── O QUE MUDOU, E POR QUE ISSO IMPORTA ───────────────────────────────────────────────────────

`use_cases/ingest_verified_payload.py` and `backend/README.md` both carry a reopening trigger for
the same gap: the assertion of `CallOrderSpy` watches `ingest_verified` and NOTHING ELSE, so a
SECOND use case written later could call `payload.lines()` before verifying and pass all four
gates. The trigger counts call sites from the AST and is armed to bite at 2, and it was measured
on both sides `[MEDIDO 2026-08-29: arvore como esta -> 1, rc=0; com um segundo chamador plantado
-> 2, rc=1]`.

**But it lived TYPED INSIDE A COMMENT, and a gate nobody runs is not a gate.** This repository
already made that argument once and acted on it — `ADR-011:268` refused the weaker form
(*"ferramenta so no lint.sh fica fora do portao"*), and `T-01.7` moved `D` into `select` for
exactly this reason. `T-03.10` is the declared owner of this gap, so the trigger moves here,
where `bash backend/scripts/test.sh` runs it.

── E O GATILHO TINHA DOIS PONTOS CEGOS, QUE EU MEDI ANTES DE FECHAR ──────────────────────────

The comment version matched `ast.Call` whose `func` is an `ast.Attribute` named `lines`. Two
forms slip past it, and both are ordinary Python rather than sabotage
`[MEDIDO 2026-08-29, n=3 formas, cada uma sozinha numa arvore isolada, `python -B` com
`PYTHONDONTWRITEBYTECODE=1` e `__pycache__` apagado]`:

    forma                                gatilho antigo   este scanner
    `pull = payload.lines` + `pull()`     0  [CEGO]        1  [VE]
    `getattr(payload, "lines")()`         0  [CEGO]        1  [VE]
    `payload.lines()`                     1  [VE]          1  [VE]

Those are the SAME two evasions that `[tool.importlinter]` of this repository already names in
writing as its own inherited limit — *"ele NAO ve `importlib.import_module(...)` nem alias
construido em runtime"*. A static reader cannot close the dynamic case in general, and this one
does not claim to: `getattr(payload, name)()` with `name` computed at runtime is still invisible,
and that is stated rather than papered over. What it closes is the two forms a person actually
writes.

**THE DETECTOR IS FALSIFIED BY THE SUITE ITSELF**, below: each of the three forms is fed to the
scanner as source text and must be SEEN. A watcher that cannot demonstrate what it catches is
the family of defect this repository has now named twelve times.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

SOURCE_ROOT = Path(__file__).resolve().parents[2] / "src"
WATCHED_ATTRIBUTE = "lines"

# The single call site the guarantee is allowed to have: the loop inside `ingest_verified`,
# which runs only AFTER `manifest.verify` has returned.
SANCTIONED_MODULE = "modules/sentimento/use_cases/ingest_verified_payload.py"

# `getattr(obj, "lines")` — the name is the SECOND argument, so the call needs two.
GETATTR_MINIMUM_ARGS = 2


def _lines_references(source: str, label: str = "<memory>") -> list[str]:
    """Return every place `.lines` is reached for, by call, by alias, or by `getattr`.

    Three shapes, and the second and third are the ones the comment-era trigger could not see.
    `called` is collected first so that an attribute which IS the callee of a call is not counted
    twice — once as a call and once as an alias.
    """
    tree = ast.parse(source)
    called = {
        node.func
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == WATCHED_ATTRIBUTE:
            kind = "call" if node in called else "alias"
            found.append(f"{label}:{node.lineno}:{kind}")
        elif isinstance(node, ast.Call) and _is_getattr_of_watched(node):
            found.append(f"{label}:{node.lineno}:getattr")
    return found


def _is_getattr_of_watched(node: ast.Call) -> bool:
    """Return whether `node` is `getattr(<anything>, "lines")` written literally."""
    return (
        isinstance(node.func, ast.Name)
        and node.func.id == "getattr"
        and len(node.args) >= GETATTR_MINIMUM_ARGS
        and isinstance(node.args[1], ast.Constant)
        and node.args[1].value == WATCHED_ATTRIBUTE
    )


@pytest.mark.parametrize(
    ("form", "source"),
    [
        ("direct call", "def f(p):\n    return list(p.lines())\n"),
        ("runtime alias", "def f(p):\n    pull = p.lines\n    return list(pull())\n"),
        ("getattr", 'def f(p):\n    return list(getattr(p, "lines")())\n'),
    ],
)
def test_the_scanner_sees_every_form_a_person_actually_writes(form: str, source: str) -> None:
    """FALSIFIER OF THE WATCHER: each evasive form must be SEEN, or this gate is theatre.

    The comment-era trigger returned 0 for the middle and the last one. If a future edit
    reintroduces that blindness, this parametrised case fails by name instead of the gate going
    quietly green.
    """
    assert _lines_references(source, form), f"{form} slipped past the scanner"


def test_the_scanner_does_not_fire_on_an_unrelated_attribute_named_something_else() -> None:
    """Do not count `p.readlines()` or `p.line`: a watcher that over-fires gets switched off."""
    assert _lines_references("def f(p):\n    return p.readlines() + [p.line]\n") == []


def test_exactly_one_place_in_production_reaches_for_the_payload_lines() -> None:
    """THE GATE. The count is 1, and it is the loop inside `ingest_verified`.

    THE DAY THIS REACHES 2, the ordering guarantee has stopped covering the code — the second
    caller is outside the one function `CallOrderSpy` watches, and nothing else asserts that it
    verified before streaming.

    `T-03.10` brought the first PRODUCTION caller of the edge
    (`infra/dump_ingest_worker.py`) and deliberately did NOT add a call site: it hands a sink to
    `ingest_verified` and never touches `payload.lines` itself. That is why the count below is
    still 1 after this task, and it is the evidence that the routing decision was the cheap one.
    """
    found: list[str] = []
    for module in sorted(SOURCE_ROOT.rglob("*.py")):
        found.extend(
            _lines_references(
                module.read_text(encoding="utf-8"), str(module.relative_to(SOURCE_ROOT))
            )
        )

    assert len(found) == 1, f"the ordering guarantee no longer covers every caller: {found}"
    assert found[0].startswith(SANCTIONED_MODULE), found
    assert found[0].endswith(":call"), found


def test_the_source_tree_the_gate_scans_is_not_empty() -> None:
    """The instrument is checked before its verdict is believed.

    A `rglob` over a mistyped root returns an empty iterator, the count is 0, `0 <= 1` holds, and
    the gate reports success having read NOTHING. That is the exact defect this repository
    measured on `harness code-paths classify`, which returns `producao`/`rc=0` with an identical
    sentence for a file that does not exist. A universe of zero is not a passing universe.
    """
    modules = list(SOURCE_ROOT.rglob("*.py"))

    assert SOURCE_ROOT.is_dir(), SOURCE_ROOT
    assert len(modules) >= 10, f"scanned {len(modules)} modules — the root is wrong"
