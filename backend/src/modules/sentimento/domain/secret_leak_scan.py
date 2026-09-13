"""The scan that answers "is the Coinalyze key anywhere a reader could find it?".

`RNF-4` and `CLAUDE.md` are literal: *"Nenhuma chave em documento, nunca. A key da Coinalyze
vive em `.env` (perms 600, gitignored) e os comandos a referenciam so como
`$COINALYZE_API_KEY`"*. Two rules in `harness.toml` already guard parts of this, and NEITHER
covers the surface this module exists for:

    core.hardcoded-secret          scope `production` -> `backend/src/`, `frontend/src/`
    own.compose-hardcoded-secret   paths `**/*.yml`, `**/*.yaml`

`include_prefixes` is `backend/src/`, `backend/tests/`, `frontend/src/`, `deploy/`. A key
pasted into `docs/medicao-coinalyze.md`, into `.env.example`, into `README.md` or into
`scripts/` is OUTSIDE every one of them — and a document is exactly where `CLAUDE.md` says a
key must never be. So this scan walks the VERSIONED TREE, not the code paths.

── WHY THE DETECTOR IS SHAPE-BASED AND NOT VALUE-BASED ────────────────────────────────────

A detector that knew the secret would have to CONTAIN the secret to be versioned, which is the
leak it exists to prevent. So the versioned half matches the SHAPE of the credential, and the
exact-value half reads the live `.env` at run time and is therefore never written down.

Both halves are needed and neither is redundant: shape alone cannot prove THIS key is absent
(a key of another shape slips through), and value alone cannot run where `.env` does not exist.

── THE PAIR THAT `ADR-012` DEMANDS ────────────────────────────────────────────────────────

`T-05.4`'s DoD is literal about it: the instrument has to BITE and to STAY SILENT. Without the
biting half, `rc=0` is indistinguishable between *"there is no key"* and *"the instrument does
not know how to look"* — the family of blindness `ADR-012` names. `find_leaks` is therefore
driven over synthetic violating lines in the suite, not only over the real tree.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Final

# The Coinalyze key is a UUID: 8-4-4-4-12 hexadecimal characters, 36 including the dashes
# `[MEDIDO 2026-09-12: a chave viva em `.env` tem 36 caracteres, e o formato e o do fornecedor]`.
# Anchored with `(?<![0-9A-Fa-f-])`/`(?![0-9A-Fa-f-])` so a longer hex run cannot yield a
# spurious inner match.
_UUID_SHAPE: Final[str] = (
    r"(?<![0-9A-Fa-f-])[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}"
    r"-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?![0-9A-Fa-f-])"
)
UUID_SHAPED_LITERAL: Final[re.Pattern[str]] = re.compile(_UUID_SHAPE)

# A line that TALKS about Coinalyze or about an api key. A UUID on such a line is the realistic
# leak: someone pastes the key next to the word that says what it is.
_CREDENTIAL_CONTEXT: Final[re.Pattern[str]] = re.compile(r"(?i:coinalyze|api[-_ ]?key)")

# `COINALYZE_API_KEY` given a LITERAL value. The negated class refuses the correct forms:
# `${VAR}` and `$VAR` are indirection, and an EMPTY value is what `.env.example` must carry
# (the NAME, never the value). `6,` keeps an obvious placeholder like `xxx` from biting.
ASSIGNED_LITERAL: Final[re.Pattern[str]] = re.compile(
    r"COINALYZE_API_KEY[\"']?\s*[:=]\s*[\"']?(?P<value>[^\s\"'{}$<>]{6,})"
)

# Values that are self-evidently not a credential. This is NOT a bypass allowlist keyed on
# FILES — it is keyed on the VALUE, and every member is a string that says "no key here" in
# words. A real key matches none of them, because a real key is a UUID.
_DECLARED_PLACEHOLDERS: Final[frozenset[str]] = frozenset(
    {
        "changeme",
        "your-key-here",
        "preencha",
        "placeholder",
        "redacted",
    }
)


class SecretScanError(Exception):
    """The scan could not be performed — which is never the same as finding nothing."""


@dataclass(frozen=True)
class Leak:
    """One place a credential was found, with enough to fix it and nothing that repeats it.

    `evidence` deliberately carries the MATCHED SHAPE and not the matched value: a report that
    quoted the secret would copy it into the log, the terminal and whatever captured them,
    which is the leak this scan reports rather than another instance of it.
    """

    path: str
    line_number: int
    rule: str
    evidence: str


def _is_placeholder(value: str) -> bool:
    """Return whether a literal is one of the declared non-credential stand-ins."""
    lowered = value.strip().strip("\"'").lower()
    return any(marker in lowered for marker in _DECLARED_PLACEHOLDERS)


def find_leaks_in_line(path: str, line_number: int, line: str) -> list[Leak]:
    """Return every credential leak on ONE line — the whole detector, and it is pure."""
    leaks: list[Leak] = []
    uuid_match = UUID_SHAPED_LITERAL.search(line)
    if uuid_match is not None and _CREDENTIAL_CONTEXT.search(line) is not None:
        leaks.append(
            Leak(
                path=path,
                line_number=line_number,
                rule="uuid-shaped-literal-on-a-credential-line",
                evidence="<uuid-shaped literal redacted>",
            )
        )
    assignment = ASSIGNED_LITERAL.search(line)
    if assignment is not None and not _is_placeholder(assignment.group("value")):
        leaks.append(
            Leak(
                path=path,
                line_number=line_number,
                rule="coinalyze-api-key-assigned-a-literal",
                evidence="<assigned literal redacted>",
            )
        )
    return leaks


def find_leaks(path: str, content: str) -> list[Leak]:
    """Run the line detector over a whole file body."""
    leaks: list[Leak] = []
    for offset, line in enumerate(content.splitlines(), start=1):
        leaks.extend(find_leaks_in_line(path, offset, line))
    return leaks


def find_exact_value(path: str, content: str, secret: str) -> list[Leak]:
    """Find the LIVE key verbatim — the half that cannot be written down, only run.

    Refuses a short or empty secret instead of scanning for it: a two-character "secret"
    matches half the tree and would turn this into noise that gets switched off.
    """
    if len(secret.strip()) < 16:
        raise SecretScanError(
            "refusing to scan for a secret shorter than 16 characters: a short needle "
            "matches everywhere and an instrument that cries wolf gets disabled"
        )
    needle = secret.strip()
    return [
        Leak(
            path=path,
            line_number=offset,
            rule="live-key-verbatim",
            evidence="<live key redacted>",
        )
        for offset, line in enumerate(content.splitlines(), start=1)
        if needle in line
    ]


def scan_files(
    files: Iterable[tuple[str, str]],
    secret: str | None = None,
) -> list[Leak]:
    """Scan `(path, content)` pairs with the shape detector, plus the exact one when given."""
    leaks: list[Leak] = []
    for path, content in files:
        leaks.extend(find_leaks(path, content))
        if secret:
            leaks.extend(find_exact_value(path, content, secret))
    return leaks


def coinalyze_key_from(environment: Mapping[str, str]) -> str | None:
    """Read the live key for the exact-value half, returning `None` when it is not set.

    NO DEFAULT, deliberately. A default would make "the operator has no key" and "the operator
    has this key" produce the same scan, and the caller could not tell that the strong half
    never ran.
    """
    value = environment.get("COINALYZE_API_KEY", "").strip()
    return value or None
