"""`instrument_alias(from_symbol, to_symbol, effective_from, evidence_url)` — `Q12`'s mechanism.

`SPEC-001` §3.4 fixes the schema (`instrument_alias ( de, para, effective_from, evidence_url )`,
prosa em português por ser texto de documento — `CLAUDE.md`, tabela de fronteira, linha 7).
Plan `07` item 7.11 (`T-07.9`/`CST-63`) builds the mechanism that reads it; column names in CODE
are English (`CLAUDE.md` linha 1) because this is a NEW contract born today — unlike
`janela_de_perda` (linha 11), there is no production consumer already quoting the Portuguese
name from an existing ADR, so no inheritance exception applies.

── `Q12` IS OPEN, AND THE OPEN PART IS THE CONTENT, NOT THE MECHANISM ───────────────────────

`docs/decisoes-do-owner.md` marks `Q12` `ABERTA`: "a resposta e o CONTEUDO de ~5 linhas/ano".
This module is the mechanism `Q12` needs to exist BEFORE that content is curated — the same
posture `T-07.10`/`clock_skew_tolerance.py` took for `>= 7 dias de runs`: build the real thing,
refuse rather than fabricate the part that is not there yet. `backend/config/instrument_alias.yaml`
ships with ZERO real entries; this module has to be correct with zero, one or many.

`evidence_url` OBLIGATORY BY VALIDATION (not by convention): `MissingEvidenceUrlError` fires at
construction time, so an entry without it can never become an `AliasEntry` in the first place —
the handoff's third fact, `[MEDIDO]`: `MATICUSDT` is not on Coinalyze but `ICXUSDT` is, so no
source in this project can INFER a rename; every entry has to be curated with external proof.

── DOMAIN, NOT infra (`ADR-016`, `Natureza`) ────────────────────────────────────────────────

No file, no socket. `date` is used as a VALUE type for pure calendar comparison
(`effective_from <= at`), never `.today()`/`.now()` — the same use `domain/dump_window.py`
already makes of `date`, guarded by `backend/scripts/natureza.py` BY USE and not by import.
Reading the YAML file from disk, and turning its text into a nested `dict`/`list` structure,
is `infra/instrument_alias_reader.py`'s job; this module only ever sees the already-parsed
structure (or an already-built `AliasEntry`).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Final

# The exact 4 columns `SPEC-001` §3.4 declares — no more, no fewer. An entry with an unexpected
# fifth key is refused by name (`MalformedAliasEntryError`) rather than silently accepted with
# the extra key dropped: a typo in a curated file should be loud, not swallowed.
REQUIRED_FIELDS: Final[frozenset[str]] = frozenset(
    {"from_symbol", "to_symbol", "effective_from", "evidence_url"}
)

_ALIASES_KEY: Final[str] = "aliases"


class InstrumentAliasRejectedError(Exception):
    """Base of every refusal below — a caller can fail closed with a single `except`.

    Same shape `ChecksumRejectedError` (`domain/checksum_manifest.py`) already uses for this
    repository: splitting the refusals into unrelated siblings would let a caller catch three
    and forget the fourth, and the one forgotten is the one that lets a bad entry through.
    """


class InstrumentAliasFileMissingError(InstrumentAliasRejectedError):
    """No `instrument_alias.yaml` at the declared path — absence is not an empty catalog."""


class MalformedInstrumentAliasDocumentError(InstrumentAliasRejectedError):
    """The top-level YAML document is not the shape this contract declares.

    Raised for a document that is not a mapping, that carries a key other than `aliases`, for
    an `aliases` value that is not a list, or for YAML that does not even parse — the WHOLE
    file is refused in every one of these cases, because there is no single entry to blame.
    """


class MalformedAliasEntryError(InstrumentAliasRejectedError):
    """One entry is not `instrument_alias(from_symbol, to_symbol, effective_from, evidence_url)`.

    Refuses the ENTRY that is wrong, named in the message, rather than the whole catalog — the
    same "forma errada recusada por nome" the sibling stores in this component already apply
    (`ChecksumManifest`, `JsonlContentDedupeStore._entry_of`).
    """


class MissingEvidenceUrlError(InstrumentAliasRejectedError):
    """An alias entry with no `evidence_url` — refused BY VALIDATION, never loaded silently.

    Deliberately its OWN type and not a case of `MalformedAliasEntryError`: the handoff singles
    this field out as "obrigatorio, POR TIPO/VALIDACAO, nao por convencao", and a caller that
    wants to report specifically on missing evidence (as opposed to any other malformed shape)
    can catch this one without string-matching a message.
    """


class DuplicateAliasEntryError(InstrumentAliasRejectedError):
    """Two entries share `(from_symbol, effective_from)` — `resolve` would have to guess.

    A guess here is a silent one: absent this refusal, `resolve` would pick whichever entry
    happened to sort last, and that choice would depend on file order rather than on a fact
    about the rename.
    """


class AliasCycleError(InstrumentAliasRejectedError):
    """A chain of aliases loops back on a symbol already visited — refused, never looped forever.

    `resolve` walks live data curated by hand; this is the guard against a future curation
    mistake (`A -> B` and `B -> A`), not a case this task's zero-real-entries file can trigger.
    """


@dataclass(frozen=True)
class AliasEntry:
    """One curated row of `instrument_alias(from_symbol, to_symbol, effective_from, evidence_url)`.

    Validated at CONSTRUCTION time (`__post_init__`), so a direct call to `AliasEntry(...)` —
    from a test, or from any future caller — cannot bypass the invariants `from_raw` enforces
    when building from a parsed YAML mapping. `from_raw` is the only place that translates raw,
    untyped YAML values (`object`) into the typed fields this dataclass declares.
    """

    from_symbol: str
    to_symbol: str
    effective_from: date
    evidence_url: str

    def __post_init__(self) -> None:
        """Refuse a shape that could never be a curated alias, before it exists as one."""
        if not self.from_symbol:
            raise MalformedAliasEntryError("from_symbol is empty")
        if not self.to_symbol:
            raise MalformedAliasEntryError("to_symbol is empty")
        if self.from_symbol == self.to_symbol:
            raise MalformedAliasEntryError(
                f"from_symbol and to_symbol are both {self.from_symbol!r}: an alias to itself "
                f"resolves nothing, and chaining it would loop forever"
            )
        if not self.evidence_url:
            raise MissingEvidenceUrlError(
                f"alias {self.from_symbol!r} -> {self.to_symbol!r} (effective_from="
                f"{self.effective_from}) has no evidence_url: every curated rename needs "
                f"external proof, never inferred from a source of this project (the handoff's "
                f"own witness: MATICUSDT is absent from Coinalyze while ICXUSDT is present)"
            )

    @classmethod
    def from_raw(cls, raw: Mapping[str, object]) -> AliasEntry:
        """Build one `AliasEntry` from an already-parsed YAML mapping, refusing by name.

        Exactly the 4 declared keys, no more and no fewer — an entry with a 5th key or a
        misspelled one is refused here, at the shape check, rather than accepted with the typo
        silently ignored.
        """
        actual_keys = frozenset(raw.keys())
        if actual_keys != REQUIRED_FIELDS:
            missing = sorted(REQUIRED_FIELDS - actual_keys)
            unexpected = sorted(actual_keys - REQUIRED_FIELDS)
            raise MalformedAliasEntryError(
                f"alias entry has the wrong shape: missing {missing}, unexpected {unexpected} "
                f"(raw={raw!r})"
            )
        return cls(
            from_symbol=_require_str(raw, "from_symbol"),
            to_symbol=_require_str(raw, "to_symbol"),
            effective_from=_require_date(raw, "effective_from"),
            evidence_url=_require_str(raw, "evidence_url"),
        )


def _require_str(raw: Mapping[str, object], field_name: str) -> str:
    """Return `raw[field_name]` as `str`, refusing any other type by name."""
    value = raw[field_name]
    if not isinstance(value, str):
        raise MalformedAliasEntryError(
            f"{field_name} must be a string, got {type(value).__name__} (raw={raw!r})"
        )
    return value


def _require_date(raw: Mapping[str, object], field_name: str) -> date:
    """Return `raw[field_name]` parsed as an ISO `YYYY-MM-DD` date, refusing anything else.

    PyYAML parses an unquoted `2026-09-05` as `datetime.date` already, per the YAML 1.1 core
    schema — accepted here too (`isinstance(value, date)`), so a curator does not have to
    remember to quote the date for this loader to accept it.
    """
    value = raw[field_name]
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        raise MalformedAliasEntryError(
            f"{field_name} must be an ISO date (YYYY-MM-DD), got {type(value).__name__} "
            f"(raw={raw!r})"
        )
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise MalformedAliasEntryError(
            f"{field_name} {value!r} is not an ISO date (YYYY-MM-DD): {exc}"
        ) from exc


@dataclass(frozen=True)
class InstrumentAliasCatalog:
    """The curated alias catalog: resolvable at any date, `Q12`'s mechanism (`SPEC-001` §3.4).

    `entries` is a plain tuple, not indexed by `from_symbol`: the SAME symbol can legitimately
    appear as `from_symbol` in more than one entry (renamed twice), so `resolve` picks the
    entry with the LATEST `effective_from` that is still `<= at`, at read time, rather than
    this type collapsing the history into one mapping at construction time.
    """

    entries: tuple[AliasEntry, ...]

    @classmethod
    def from_raw_entries(
        cls, raw_entries: Sequence[Mapping[str, object]]
    ) -> InstrumentAliasCatalog:
        """Build a catalog from already-parsed YAML mappings, refusing an ambiguous natural key."""
        entries = tuple(AliasEntry.from_raw(raw) for raw in raw_entries)
        _reject_duplicate_natural_key(entries)
        return cls(entries=entries)

    @classmethod
    def from_yaml_document(cls, document: object) -> InstrumentAliasCatalog:
        """Build a catalog from a whole parsed YAML document: `{"aliases": [...]}`, nothing else.

        The ENTIRE document is refused (`MalformedInstrumentAliasDocumentError`) for a
        top-level shape mistake — there is no single entry to name when the mistake is that
        `aliases` itself is missing, misspelled, or not a list.
        """
        if not isinstance(document, Mapping):
            raise MalformedInstrumentAliasDocumentError(
                f"top-level document must be a mapping with one key, {_ALIASES_KEY!r}; "
                f"got {type(document).__name__}"
            )
        actual_keys = frozenset(document.keys())
        if actual_keys != {_ALIASES_KEY}:
            raise MalformedInstrumentAliasDocumentError(
                f"top-level document must have exactly one key, {_ALIASES_KEY!r}; "
                f"got {sorted(actual_keys)!r}"
            )
        raw_aliases = document[_ALIASES_KEY]
        if not isinstance(raw_aliases, list):
            raise MalformedInstrumentAliasDocumentError(
                f"{_ALIASES_KEY!r} must be a list, got {type(raw_aliases).__name__}"
            )
        raw_entries: list[Mapping[str, object]] = []
        for index, item in enumerate(raw_aliases):
            if not isinstance(item, Mapping):
                raise MalformedAliasEntryError(
                    f"{_ALIASES_KEY}[{index}] must be a mapping, got {type(item).__name__}"
                )
            raw_entries.append(item)
        return cls.from_raw_entries(raw_entries)

    def resolve(self, symbol: str, at: date) -> str:
        """Return the canonical symbol for `symbol` as of `at`, walking the whole chain.

        `MATICUSDT` renamed to `POLUSDT` with `effective_from = 2024-09-05` (a hypothetical,
        not one of this file's zero real entries): a caller resolving `MATICUSDT` at any date
        ON OR AFTER that gets `POLUSDT`; a caller resolving it at a date BEFORE gets
        `MATICUSDT` back unchanged, because the rename had not taken effect yet — continuity is
        a fact of the calendar, not a blanket substitution (`T-07.9` handoff, distinguishing
        this from `universe_at`/`T-07.8`, which decides MEMBERSHIP, not IDENTITY).

        Chains hop transparently: if `POLUSDT` were itself later renamed again, one call to
        `resolve` follows both hops. Bounded to `len(entries)` hops and guarded by `visited` so
        a curation mistake that cycles (`A -> B`, `B -> A`) raises `AliasCycleError` instead of
        looping forever — the bound is safe because an acyclic chain can never need more hops
        than there are entries to walk.
        """
        current = symbol
        visited = {current}
        for _ in range(len(self.entries)):
            next_symbol = self._active_alias(current, at)
            if next_symbol is None:
                return current
            if next_symbol in visited:
                raise AliasCycleError(
                    f"alias chain starting at {symbol!r} cycles back to {next_symbol!r} "
                    f"resolving as of {at}"
                )
            current = next_symbol
            visited.add(current)
        return current

    def _active_alias(self, symbol: str, at: date) -> str | None:
        """Return the `to_symbol` in effect for `symbol` at `at`, or `None` if none applies.

        Among every entry naming `symbol` with `effective_from <= at`, the one with the LATEST
        `effective_from` wins — the most recent rename that had already taken effect.
        """
        candidates = [
            entry
            for entry in self.entries
            if entry.from_symbol == symbol and entry.effective_from <= at
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda entry: entry.effective_from).to_symbol


def _reject_duplicate_natural_key(entries: Sequence[AliasEntry]) -> None:
    """Refuse two entries sharing `(from_symbol, effective_from)` — `resolve` cannot pick one."""
    seen: set[tuple[str, date]] = set()
    for entry in entries:
        key = (entry.from_symbol, entry.effective_from)
        if key in seen:
            raise DuplicateAliasEntryError(
                f"duplicate alias entry for from_symbol={entry.from_symbol!r} "
                f"effective_from={entry.effective_from}: two entries would leave `resolve` "
                f"choosing between them arbitrarily"
            )
        seen.add(key)
