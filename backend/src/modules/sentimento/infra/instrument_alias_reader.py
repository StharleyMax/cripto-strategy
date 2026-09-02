"""Read `instrument_alias.yaml` from disk and hand `domain` the already-parsed structure.

`Natureza` split (`ADR-016`, per the `T-07.9` handoff): touching `Path` — checking existence,
reading bytes — is `infra`; deciding whether the parsed structure is a valid catalog is
`domain/instrument_alias.py`, which never opens a file. This module is the thin seam between
the two, mirroring `infra/clock_skew_tolerance_reader.py`'s shape for the same kind of split.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from src.modules.sentimento.domain.instrument_alias import (
    InstrumentAliasCatalog,
    InstrumentAliasFileMissingError,
    MalformedInstrumentAliasDocumentError,
)


def load_instrument_alias_catalog(path: Path) -> InstrumentAliasCatalog:
    """Read `path` as a YAML `instrument_alias` document and return the validated catalog.

    Absence of the file is `InstrumentAliasFileMissingError`, never an empty catalog returned
    silently — the same "ausencia nao e verdicto vazio" discipline `provenance.py`'s `Absence`
    already fixes for a read of the data itself; here it is a read of the CONFIGURATION.

    YAML that fails to even parse is wrapped into `MalformedInstrumentAliasDocumentError`
    (`from exc`, never swallowed — `core.silent-except`), so a caller catching the domain's own
    refusal family does not also need to know this loader depends on `yaml.YAMLError`.
    """
    if not path.is_file():
        raise InstrumentAliasFileMissingError(f"no instrument_alias YAML file at {path}")
    text = path.read_text(encoding="utf-8")
    try:
        document: object = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise MalformedInstrumentAliasDocumentError(f"{path} is not parseable YAML: {exc}") from exc
    return InstrumentAliasCatalog.from_yaml_document(document)
