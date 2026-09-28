"""`connect_autocommit` is injected by the API's composition root ALONE — WI, `D-2` (2026-09-27).

`D-2` bought autocommit for the API's read-only connections and EXCLUDED the writer and the
collector, which `commit` explicitly and may rely on multi-statement atomicity.
`test_default_composition_stays_transactional_for_writer_and_collector` pins the DEFAULT
`connect` of the shared composition functions; it does not see a writer/collector entrypoint
that passes `connect=connect_autocommit` EXPLICITLY. This file closes that gap statically: the
only production modules allowed to name `connect_autocommit` are the one that defines it and
`src.main` (the `api` service's `command: python -m src.main`, `deploy/compose.yml`).

The rejected case lives here too: a synthetic source tree where a collector names it must be
reported by the same checker the real tree passes.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Final

_BACKEND_ROOT: Final[Path] = Path(__file__).resolve().parents[2]
_SOURCE_ROOT: Final[Path] = _BACKEND_ROOT / "src"
_FACTORY_NAME: Final[str] = "connect_autocommit"
_ALLOWED_MODULES: Final[frozenset[str]] = frozenset(
    {
        "src/main/__init__.py",
        "src/modules/sentimento/infra/ingest_record_store_composition.py",
    }
)


def _names_factory(source: str) -> bool:
    """Report whether `source` references `connect_autocommit` as a name, attribute or import."""
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Name) and node.id == _FACTORY_NAME:
            return True
        if isinstance(node, ast.Attribute) and node.attr == _FACTORY_NAME:
            return True
        if isinstance(node, ast.alias) and node.name == _FACTORY_NAME:
            return True
    return False


def _offending_modules(sources: dict[str, str]) -> list[str]:
    """Every module (path relative to `backend/`) naming the factory outside the allowed set."""
    return sorted(
        path
        for path, source in sources.items()
        if path not in _ALLOWED_MODULES and _names_factory(source)
    )


def _real_sources() -> dict[str, str]:
    return {
        path.relative_to(_BACKEND_ROOT).as_posix(): path.read_text(encoding="utf-8")
        for path in _SOURCE_ROOT.rglob("*.py")
    }


def test_only_the_api_composition_root_injects_connect_autocommit() -> None:
    """The real `backend/src` names the factory only where `D-2` allows it."""
    sources = _real_sources()
    assert _offending_modules(sources) == []
    # The universe is not empty: the API root really does inject it (else `[]` proves nothing).
    assert _names_factory(sources["src/main/__init__.py"])


def test_checker_rejects_a_collector_that_injects_connect_autocommit() -> None:
    """Rejected case: a collector entrypoint passing `connect=connect_autocommit` is named."""
    sources = _real_sources()
    collector = "src/modules/sentimento/infra/collectors_cli.py"
    sources[collector] += (
        "\nfrom src.modules.sentimento.infra.ingest_record_store_composition import "
        "connect_autocommit\n"
        "_store = compose_ingest_record_store(os.environ, connect=connect_autocommit)\n"
    )
    assert _offending_modules(sources) == [collector]


def test_checker_rejects_an_attribute_reference() -> None:
    """Rejected case: `module.connect_autocommit` (no `from … import`) is still named."""
    writer = "src/modules/sentimento/infra/single_writer_cli.py"
    sources = {writer: "x = composition.connect_autocommit\n"}
    assert _offending_modules(sources) == [writer]
