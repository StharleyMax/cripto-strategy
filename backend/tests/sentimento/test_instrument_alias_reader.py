"""`load_instrument_alias_catalog`: file absence and malformed YAML refuse, by name."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from src.modules.sentimento.domain.instrument_alias import (
    InstrumentAliasFileMissingError,
    MalformedAliasEntryError,
    MalformedInstrumentAliasDocumentError,
    MissingEvidenceUrlError,
)
from src.modules.sentimento.infra.instrument_alias_reader import load_instrument_alias_catalog

_VALID_YAML = """\
aliases:
  - from_symbol: MATICUSDT
    to_symbol: POLUSDT
    effective_from: "2024-09-05"
    evidence_url: "https://example.invalid/exchange-announcement/EXAMPLE-rename"
"""


def test_loads_the_shipped_zero_entry_production_file() -> None:
    """`backend/config/instrument_alias.yaml`: the REAL file this task ships, zero entries.

    `Q12` is `ABERTA` — the assertion is on the MECHANISM accepting the file as-is, not on any
    claim about its content.
    """
    path = Path(__file__).parents[2] / "config" / "instrument_alias.yaml"

    catalog = load_instrument_alias_catalog(path)

    assert catalog.entries == ()


def test_refuses_a_missing_file(tmp_path: Path) -> None:
    """No file at the declared path refuses — absence is never an empty catalog."""
    with pytest.raises(InstrumentAliasFileMissingError, match="no instrument_alias"):
        load_instrument_alias_catalog(tmp_path / "does_not_exist.yaml")


def test_loads_a_valid_yaml_file(tmp_path: Path) -> None:
    """A well-formed file on disk round-trips into a catalog with the entry it declares."""
    path = tmp_path / "instrument_alias.yaml"
    path.write_text(_VALID_YAML, encoding="utf-8")

    catalog = load_instrument_alias_catalog(path)

    assert len(catalog.entries) == 1
    entry = catalog.entries[0]
    assert entry.from_symbol == "MATICUSDT"
    assert entry.to_symbol == "POLUSDT"
    assert entry.effective_from == date(2024, 9, 5)


def test_refuses_yaml_that_does_not_parse(tmp_path: Path) -> None:
    """YAML that fails to even parse wraps `yaml.YAMLError` into the domain's own refusal."""
    path = tmp_path / "instrument_alias.yaml"
    path.write_text("aliases: [this is: not, valid: yaml:\n", encoding="utf-8")

    with pytest.raises(MalformedInstrumentAliasDocumentError, match="not parseable YAML"):
        load_instrument_alias_catalog(path)


def test_refuses_an_empty_file(tmp_path: Path) -> None:
    """An empty file parses to `None` — refused by `domain`, not treated as an empty catalog."""
    path = tmp_path / "instrument_alias.yaml"
    path.write_text("", encoding="utf-8")

    with pytest.raises(MalformedInstrumentAliasDocumentError, match="NoneType"):
        load_instrument_alias_catalog(path)


def test_refuses_an_entry_missing_evidence_url(tmp_path: Path) -> None:
    """The reader propagates `MissingEvidenceUrlError` through, end to end from a real file."""
    path = tmp_path / "instrument_alias.yaml"
    path.write_text(
        "aliases:\n"
        "  - from_symbol: MATICUSDT\n"
        "    to_symbol: POLUSDT\n"
        '    effective_from: "2024-09-05"\n'
        '    evidence_url: ""\n',
        encoding="utf-8",
    )

    with pytest.raises(MissingEvidenceUrlError):
        load_instrument_alias_catalog(path)


def test_refuses_an_entry_with_the_wrong_shape(tmp_path: Path) -> None:
    """An entry missing declared columns refuses through the reader too, end to end."""
    path = tmp_path / "instrument_alias.yaml"
    path.write_text(
        "aliases:\n  - from_symbol: MATICUSDT\n    to_symbol: POLUSDT\n",
        encoding="utf-8",
    )

    with pytest.raises(MalformedAliasEntryError, match="missing"):
        load_instrument_alias_catalog(path)
