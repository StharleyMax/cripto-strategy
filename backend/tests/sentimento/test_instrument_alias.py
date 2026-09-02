"""`instrument_alias`: `evidence_url` mandatory BY VALIDATION, `resolve` walks the calendar.

`Q12`'s mechanism (`SPEC-001` §3.4, plan `07` item 7.11, `T-07.9`/`CST-63`). Every example alias
below (`MATICUSDT`/`POLUSDT`, `RNDRUSDT`/`RENDERUSDT`) is a FIXTURE for this test file, not a
claim about `backend/config/instrument_alias.yaml` — that file ships with zero real entries,
`Q12` still `ABERTA`.
"""

from __future__ import annotations

from datetime import date

import pytest

from src.modules.sentimento.domain.instrument_alias import (
    REQUIRED_FIELDS,
    AliasCycleError,
    AliasEntry,
    DuplicateAliasEntryError,
    InstrumentAliasCatalog,
    MalformedAliasEntryError,
    MalformedInstrumentAliasDocumentError,
    MissingEvidenceUrlError,
)

_EVIDENCE = "https://example.invalid/exchange-announcement/EXAMPLE-rename"


def _raw(
    *,
    from_symbol: object = "MATICUSDT",
    to_symbol: object = "POLUSDT",
    effective_from: object = "2024-09-05",
    evidence_url: object = _EVIDENCE,
) -> dict[str, object]:
    """Build a raw mapping with every field overridable, defaulting to a valid EXAMPLE entry."""
    return {
        "from_symbol": from_symbol,
        "to_symbol": to_symbol,
        "effective_from": effective_from,
        "evidence_url": evidence_url,
    }


# ── `AliasEntry` construction — the invariants that fire regardless of entry point ──────────


def test_constructs_a_valid_entry_directly() -> None:
    """Direct construction (not through `from_raw`) enforces the same invariants."""
    entry = AliasEntry(
        from_symbol="MATICUSDT",
        to_symbol="POLUSDT",
        effective_from=date(2024, 9, 5),
        evidence_url=_EVIDENCE,
    )

    assert entry.from_symbol == "MATICUSDT"
    assert entry.to_symbol == "POLUSDT"


def test_refuses_empty_from_symbol() -> None:
    """An empty `from_symbol` refuses — there is nothing to resolve FROM."""
    with pytest.raises(MalformedAliasEntryError, match="from_symbol is empty"):
        AliasEntry(
            from_symbol="",
            to_symbol="POLUSDT",
            effective_from=date(2024, 9, 5),
            evidence_url=_EVIDENCE,
        )


def test_refuses_empty_to_symbol() -> None:
    """An empty `to_symbol` refuses — there is nothing to resolve TO."""
    with pytest.raises(MalformedAliasEntryError, match="to_symbol is empty"):
        AliasEntry(
            from_symbol="MATICUSDT",
            to_symbol="",
            effective_from=date(2024, 9, 5),
            evidence_url=_EVIDENCE,
        )


def test_refuses_an_alias_to_itself() -> None:
    """`from_symbol == to_symbol` would resolve nothing and loop forever if chained."""
    with pytest.raises(MalformedAliasEntryError, match="are both 'MATICUSDT'"):
        AliasEntry(
            from_symbol="MATICUSDT",
            to_symbol="MATICUSDT",
            effective_from=date(2024, 9, 5),
            evidence_url=_EVIDENCE,
        )


def test_refuses_missing_evidence_url_by_validation_not_convention() -> None:
    """The DoD's central invariant: no `evidence_url`, no entry — enforced at construction."""
    with pytest.raises(MissingEvidenceUrlError, match="MATICUSDT.*POLUSDT"):
        AliasEntry(
            from_symbol="MATICUSDT",
            to_symbol="POLUSDT",
            effective_from=date(2024, 9, 5),
            evidence_url="",
        )


# ── `AliasEntry.from_raw` — the translation from untyped YAML into the typed dataclass ──────


def test_from_raw_builds_a_valid_entry() -> None:
    """A well-formed raw mapping builds the equivalent typed `AliasEntry`."""
    entry = AliasEntry.from_raw(_raw())

    assert entry == AliasEntry(
        from_symbol="MATICUSDT",
        to_symbol="POLUSDT",
        effective_from=date(2024, 9, 5),
        evidence_url=_EVIDENCE,
    )


def test_from_raw_accepts_a_date_object_pyyaml_already_parsed() -> None:
    """PyYAML parses an UNQUOTED `2024-09-05` as `datetime.date` under the YAML 1.1 core schema."""
    entry = AliasEntry.from_raw(_raw(effective_from=date(2024, 9, 5)))

    assert entry.effective_from == date(2024, 9, 5)


def test_from_raw_refuses_a_missing_field() -> None:
    """A raw mapping missing `evidence_url` refuses by naming exactly what is missing."""
    raw = _raw()
    del raw["evidence_url"]

    with pytest.raises(MalformedAliasEntryError, match=r"missing \['evidence_url'\]"):
        AliasEntry.from_raw(raw)


def test_from_raw_refuses_an_unexpected_field() -> None:
    """A 5th, undeclared key refuses by name — a typo is never silently dropped."""
    raw = _raw()
    raw["notes"] = "a typo, not a declared column"

    with pytest.raises(MalformedAliasEntryError, match=r"unexpected \['notes'\]"):
        AliasEntry.from_raw(raw)


def test_from_raw_refuses_missing_evidence_url_as_empty_string() -> None:
    """`from_raw` refuses an empty `evidence_url` the same way direct construction does."""
    with pytest.raises(MissingEvidenceUrlError):
        AliasEntry.from_raw(_raw(evidence_url=""))


@pytest.mark.parametrize("field_name", ["from_symbol", "to_symbol", "evidence_url"])
def test_from_raw_refuses_a_non_string_field(field_name: str) -> None:
    """Each string-typed column refuses a non-string value, named by field."""
    raw = _raw()
    raw[field_name] = 42

    with pytest.raises(MalformedAliasEntryError, match="must be a string"):
        AliasEntry.from_raw(raw)


def test_from_raw_refuses_an_unparseable_effective_from() -> None:
    """A date string not in ISO `YYYY-MM-DD` shape refuses rather than being guessed at."""
    with pytest.raises(MalformedAliasEntryError, match="not an ISO date"):
        AliasEntry.from_raw(_raw(effective_from="05/09/2024"))


def test_from_raw_refuses_a_non_string_non_date_effective_from() -> None:
    """A bare integer (not a string, not a `datetime.date`) refuses `effective_from`."""
    with pytest.raises(MalformedAliasEntryError, match="must be an ISO date"):
        AliasEntry.from_raw(_raw(effective_from=20240905))


def test_required_fields_matches_spec_001_3_4_exactly() -> None:
    """`SPEC-001` §3.4: exactly 4 columns — no more, no fewer."""
    assert REQUIRED_FIELDS == {"from_symbol", "to_symbol", "effective_from", "evidence_url"}


# ── `InstrumentAliasCatalog.from_raw_entries` / `from_yaml_document` ────────────────────────


def test_from_raw_entries_builds_an_empty_catalog_from_zero_entries() -> None:
    """The real shipped state today: zero entries, `Q12` still `ABERTA`."""
    catalog = InstrumentAliasCatalog.from_raw_entries([])

    assert catalog.entries == ()


def test_from_raw_entries_refuses_a_duplicate_natural_key() -> None:
    """Two entries with the same `(from_symbol, effective_from)` are ambiguous — refused."""
    raw_one = _raw(evidence_url="https://example.invalid/one")
    raw_two = _raw(evidence_url="https://example.invalid/two")

    with pytest.raises(DuplicateAliasEntryError, match="MATICUSDT"):
        InstrumentAliasCatalog.from_raw_entries([raw_one, raw_two])


def test_from_raw_entries_admits_the_same_from_symbol_at_two_different_dates() -> None:
    """A symbol renamed TWICE is legitimate — two entries, two different `effective_from`."""
    first = _raw(to_symbol="INTERIM", effective_from="2020-01-01")
    second = _raw(to_symbol="POLUSDT", effective_from="2024-09-05")

    catalog = InstrumentAliasCatalog.from_raw_entries([first, second])

    assert len(catalog.entries) == 2


def test_from_yaml_document_builds_the_catalog() -> None:
    """A well-formed top-level document builds a catalog with the entries it lists."""
    catalog = InstrumentAliasCatalog.from_yaml_document({"aliases": [_raw()]})

    assert len(catalog.entries) == 1
    assert catalog.entries[0].from_symbol == "MATICUSDT"


def test_from_yaml_document_accepts_the_shipped_zero_entry_shape() -> None:
    """`backend/config/instrument_alias.yaml`'s real, shipped shape: `{"aliases": []}`."""
    catalog = InstrumentAliasCatalog.from_yaml_document({"aliases": []})

    assert catalog.entries == ()


def test_from_yaml_document_refuses_a_non_mapping_document() -> None:
    """A top-level YAML list (instead of a mapping) refuses the whole document."""
    with pytest.raises(MalformedInstrumentAliasDocumentError, match="must be a mapping"):
        InstrumentAliasCatalog.from_yaml_document(["not", "a", "mapping"])


def test_from_yaml_document_refuses_an_empty_document() -> None:
    """An empty YAML file parses to `None` — refused by name, not treated as an empty catalog."""
    with pytest.raises(MalformedInstrumentAliasDocumentError, match="NoneType"):
        InstrumentAliasCatalog.from_yaml_document(None)


def test_from_yaml_document_refuses_an_unexpected_top_level_key() -> None:
    """A top-level key spelled wrong (`instrument_alias` instead of `aliases`) refuses."""
    with pytest.raises(MalformedInstrumentAliasDocumentError, match="exactly one key"):
        InstrumentAliasCatalog.from_yaml_document({"instrument_alias": []})


def test_from_yaml_document_refuses_aliases_not_a_list() -> None:
    """`aliases` mapped to a mapping instead of a list refuses the whole document."""
    with pytest.raises(MalformedInstrumentAliasDocumentError, match="must be a list"):
        InstrumentAliasCatalog.from_yaml_document({"aliases": {"from_symbol": "MATICUSDT"}})


def test_from_yaml_document_refuses_a_non_mapping_entry_named_by_index() -> None:
    """A non-mapping item inside `aliases` refuses, naming its OWN index."""
    with pytest.raises(MalformedAliasEntryError, match=r"aliases\[1\] must be a mapping"):
        InstrumentAliasCatalog.from_yaml_document({"aliases": [_raw(), "not a mapping"]})


# ── `resolve` — the calendar-direction falsifier ────────────────────────────────────────────


def _catalog(*raw_entries: dict[str, object]) -> InstrumentAliasCatalog:
    return InstrumentAliasCatalog.from_raw_entries(list(raw_entries))


def test_resolve_returns_the_symbol_unchanged_with_no_alias_at_all() -> None:
    """An empty catalog resolves every symbol to itself."""
    catalog = _catalog()

    assert catalog.resolve("BTCUSDT", at=date(2026, 1, 1)) == "BTCUSDT"


def test_resolve_returns_the_new_symbol_on_or_after_effective_from() -> None:
    """`at == effective_from` and `at` well after it both resolve to the new symbol."""
    catalog = _catalog(_raw(effective_from="2024-09-05"))

    assert catalog.resolve("MATICUSDT", at=date(2024, 9, 5)) == "POLUSDT"
    assert catalog.resolve("MATICUSDT", at=date(2026, 1, 1)) == "POLUSDT"


def test_resolve_returns_the_old_symbol_strictly_before_effective_from() -> None:
    """THE FALSIFIER: one day before the rename, `resolve` must NOT have jumped ahead yet.

    This is the case that would catch a `<` vs `<=` mix-up in the wrong direction, or a
    lookahead defect analogous to the one `as_of_accessor.py`'s own falsifier hunts —
    resolving to the future identity before the calendar says the rename happened.
    """
    catalog = _catalog(_raw(effective_from="2024-09-05"))

    assert catalog.resolve("MATICUSDT", at=date(2024, 9, 4)) == "MATICUSDT"


def test_resolve_is_a_no_op_for_a_symbol_the_catalog_does_not_mention() -> None:
    """A symbol with no alias entry at all resolves to itself, regardless of `at`."""
    catalog = _catalog(_raw(from_symbol="MATICUSDT", to_symbol="POLUSDT"))

    assert catalog.resolve("BTCUSDT", at=date(2026, 1, 1)) == "BTCUSDT"


def test_resolve_walks_a_two_hop_chain_in_one_call() -> None:
    """`A -> B` then `B -> C`: resolving `A` after both dates returns `C`, not `B`."""
    catalog = _catalog(
        _raw(
            from_symbol="A", to_symbol="B", effective_from="2020-01-01", evidence_url="https://x/1"
        ),
        _raw(
            from_symbol="B", to_symbol="C", effective_from="2022-01-01", evidence_url="https://x/2"
        ),
    )

    assert catalog.resolve("A", at=date(2023, 1, 1)) == "C"


def test_resolve_stops_at_the_first_hop_before_the_second_takes_effect() -> None:
    """Between the two `effective_from` dates, only the FIRST hop has happened."""
    catalog = _catalog(
        _raw(
            from_symbol="A", to_symbol="B", effective_from="2020-01-01", evidence_url="https://x/1"
        ),
        _raw(
            from_symbol="B", to_symbol="C", effective_from="2022-01-01", evidence_url="https://x/2"
        ),
    )

    assert catalog.resolve("A", at=date(2021, 1, 1)) == "B"


def test_resolve_picks_the_latest_effective_from_among_two_renames_of_the_same_symbol() -> None:
    """A symbol renamed TWICE: at `at` after both dates, the SECOND rename wins."""
    catalog = _catalog(
        _raw(to_symbol="INTERIM", effective_from="2020-01-01", evidence_url="https://x/1"),
        _raw(to_symbol="POLUSDT", effective_from="2024-09-05", evidence_url="https://x/2"),
    )

    assert catalog.resolve("MATICUSDT", at=date(2026, 1, 1)) == "POLUSDT"
    assert catalog.resolve("MATICUSDT", at=date(2021, 1, 1)) == "INTERIM"


def test_resolve_refuses_a_cycle() -> None:
    """A curation mistake — `A -> B`, `B -> A` — refuses instead of looping forever."""
    catalog = _catalog(
        _raw(
            from_symbol="A", to_symbol="B", effective_from="2020-01-01", evidence_url="https://x/1"
        ),
        _raw(
            from_symbol="B", to_symbol="A", effective_from="2020-01-01", evidence_url="https://x/2"
        ),
    )

    with pytest.raises(AliasCycleError, match="cycles back"):
        catalog.resolve("A", at=date(2026, 1, 1))
