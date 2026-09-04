"""Ingestion record: the run that happened, the gap it left, and the shape both are read in."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.canonical_json import canonical_json

# ── THE 15 FIELDS ARE A CONTRACT, AND THE ORDER IS PART OF IT ─────────────────────────────
#
# `ADR-008/D3` fixes this list with the sentence "colunas que a consulta devolve, fixadas aqui
# porque sao o contrato entre os dois consumidores" (quoted literally from the ADR). It is NOT
# the column list of the `md.ingest_run` TABLE (`SPEC-001` §3.5), and it differs in BOTH
# directions:
#
#   TABLE only:  `started_at`, `ended_at`   -- stored, never projected
#   QUERY only:  `janela_de_perda`          -- derived, and in F0 it does not exist yet
#
# The order feeds the `sha256` of the canonical projection (`ADR-008/DoD-2`), so reordering
# this tuple changes the fingerprint of every report: a contract change, not a style change.
INGEST_HEALTH_RUN_COLUMNS: Final[tuple[str, ...]] = (
    "run_id",
    "source",
    "endpoint",
    "window",
    "n_expected",
    "n_returned",
    "n_written",
    "verdict",
    "api_code",
    "src_sha256",
    "weight_used",
    "observer_id",
    "observer_region",
    "clock_skew_ms",
    "janela_de_perda",
)

# `SPEC-001` §3.5, literal. `class` is a reserved word in Python, so the dataclass FIELD is
# named `gap_class` while the projected KEY stays `class` — renaming that key would break the
# contract with S1 without a single Python test noticing, which is why the translation is
# EXPLICIT in `_GAP_FIELD_BY_COLUMN` just below instead of implicit inside a comprehension.
INGEST_HEALTH_GAP_COLUMNS: Final[tuple[str, ...]] = (
    "source",
    "symbol",
    "series_key_id",
    "from_ts",
    "to_ts",
    "n_missing",
    "class",
    "detected_at",
)

_GAP_FIELD_BY_COLUMN: Final[dict[str, str]] = {
    column: ("gap_class" if column == "class" else column) for column in INGEST_HEALTH_GAP_COLUMNS
}

# ── THE CLOSED SET OF `verdict`, AND WHAT EACH MEMBER COSTS IN EVIDENCE ───────────────────
#
# `ACCEPTED_WITH_WARNING` and `REJECTED` are LITERAL in `SPEC-001` (§5.6 and §5.5/§5.7), and
# the `grep` that enumerates them returns only those two across all of `docs/`
# `[MEDIDO 2026-08-29: `grep -rn "ACCEPTED\|REJECTED" docs/` -> no other `verdict` value is
#  written anywhere; n = 1 documentation tree]`.
#
# `ACCEPTED` is the third and it is `[INFERRED: §5.6 calls `ACCEPTED_WITH_WARNING` the WITH-
# WARNING variant of an accept and orders "NUNCA 'REJECTED', NUNCA zero linhas gravadas"; an
# accept without a warning is presupposed by that sentence and never written literally
# anywhere]`. Without it a clean run would carry no `verdict` at all and the record would be
# born useless. WHO OWNS THE ENUMERATION IS AN OPEN QUESTION, addressed to the
# `quant-architect` — this module labels the inference, it does not settle it.
#
# THE TWO CONSTANTS ARE SEPARATE ON PURPOSE: the tuple below is what the SPEC WRITES, and the
# `frozenset` adds the third. Merging them into one line would erase the difference between
# measured and inferred — and `test_ingest_health_contract_guards.py` pins BOTH against a
# hand-made transcription, so shrinking either one is an act somebody has to sign for.
VERDICTS_SPELLED_IN_THE_SPEC: Final[tuple[str, str]] = ("ACCEPTED_WITH_WARNING", "REJECTED")
KNOWN_VERDICTS: Final[frozenset[str]] = frozenset({"ACCEPTED", *VERDICTS_SPELLED_IN_THE_SPEC})

# ── `janela_de_perda` IN F0: ABSENT BY DECLARATION, never by an invented number ────────────
#
# `D7.12` decides it is a FORMULA per series (`points x interval`), not a constant, and its
# owner is `T-07.12` (`web`, phase 07). In F0 there is no formula, and a bare number here is
# exactly what `D7.14` forbids. The COLUMN exists in the projection — `ADR-008/D3` fixes it —
# and the value is `null`. Dropping the column would let S1 reintroduce it under another name;
# filling it with a guess would publish a retention window nobody measured.
#
# The NAME stays Portuguese because it is a CONTRACT COLUMN NAME quoted from `ADR-008/D3`,
# like `window` — renaming it here would break the consumer of `T-07.13`.
LOSS_WINDOW_NOT_COMPUTED_IN_F0: Final[None] = None


class UnknownVerdictError(Exception):
    """A `verdict` that the shared query does not know — it FAILS instead of hiding the run."""


@dataclass(frozen=True)
class IngestRun:
    """One row of `md.ingest_run` (`SPEC-001` §3.5), stored RAW, exactly as observed."""

    run_id: str
    source: str
    endpoint: str
    window: str
    n_expected: int
    n_returned: int
    n_written: int
    verdict: str
    api_code: int | None
    src_sha256: str
    weight_used: int
    observer_id: str
    observer_region: str
    clock_skew_ms: int
    started_at: str
    ended_at: str


@dataclass(frozen=True)
class IngestGap:
    """One row of `md.ingest_gap` (`SPEC-001` §3.5): an absence, with the class of absence."""

    source: str
    symbol: str
    series_key_id: str
    from_ts: str
    to_ts: str
    n_missing: int
    gap_class: str
    detected_at: str


@dataclass(frozen=True)
class IngestHealthReport:
    """What `ingest_health_query` returns: the runs and the gaps, in a byte-stable shape.

    THE PROJECTION IS THE CONTRACT, NOT THE RENDERING. `ADR-008/DoD-2` compares the `sha256`
    of the CLI projection against the `sha256` of what feeds S1, so any consumer that wants
    to be the SAME implementation has to emit these bytes and not a prettier cousin.

    LOCALE INVARIANCE (`SPEC-001` §3.8) IS INHERITED, NOT CLAIMED BY HAND: every line goes
    through `canonical_json.py`'s `json.dumps` with `ensure_ascii=True`, and JSON has no
    locale — the decimal point is a dot and there is no thousands separator, by grammar.
    `tests/sentimento/test_ingest_record_durability.py` runs the §3.8 test literally
    (`LANG=pt_BR.UTF-8` against `LANG=C`, `sha256` compared) instead of trusting this
    paragraph.
    """

    runs: tuple[IngestRun, ...]
    gaps: tuple[IngestGap, ...]

    def canonical_lines(self) -> tuple[str, ...]:
        """Return the projection as one JSON object per line, sections marked.

        EVERY line is valid JSON on its own — including the header and the section markers —
        so the raw record stays greppable and sortable line by line, which is what a CLI
        record of F0 is for, without the format stopping being machine-exact.
        """
        header = canonical_json(
            {
                "query": "ingest_health_query",
                "n_runs": len(self.runs),
                "n_gaps": len(self.gaps),
            }
        )
        lines = [header, canonical_json({"section": "ingest_run", "n": len(self.runs)})]
        lines.extend(_project_run(run) for run in self.runs)
        lines.append(canonical_json({"section": "ingest_gap", "n": len(self.gaps)}))
        lines.extend(_project_gap(gap) for gap in self.gaps)
        return tuple(lines)

    def canonical_projection(self) -> str:
        """Return the whole projection as one string — the exact bytes the CLI writes out."""
        return "\n".join(self.canonical_lines())

    def fingerprint(self) -> str:
        """Return `sha256` of the canonical projection — the identity `ADR-008/DoD-2` compares."""
        return hashlib.sha256(self.canonical_projection().encode("utf-8")).hexdigest()

    def to_envelope(self) -> dict[str, object]:
        """Return the nested-object shape `ADR-005/D6.1` fixes for the HTTP consumer.

        SAME PROJECTION, DIFFERENT WIRE FORMAT. `canonical_lines()` serializes the run/gap
        columns to line-delimited JSON strings for the CLI (`ADR-008/DoD-2`'s byte contract);
        this method reuses the exact same column-order dict builders (`_project_run_dict`,
        `_project_gap_dict`) and nests them into one object instead — so the column set, the
        column order, and the `class`/`gap_class` translation have exactly ONE place they are
        decided, never two. Duplicating that decision across a CLI path and an HTTP path is
        the same defect `ADR-008/DoD-1` exists to prevent for SQL, one level up the stack.
        """
        return {
            "query": "ingest_health_query",
            "n_runs": len(self.runs),
            "n_gaps": len(self.gaps),
            "runs": [_project_run_dict(run) for run in self.runs],
            "gaps": [_project_gap_dict(gap) for gap in self.gaps],
        }


def _project_run_dict(run: IngestRun) -> dict[str, object]:
    """Build the 15-column dict `ADR-008/D3` fixed, in the order it fixed them.

    The SHARED step between the CLI's line-JSON (`_project_run`) and the HTTP envelope
    (`IngestHealthReport.to_envelope`) — extracted so the column set and order are decided
    exactly once, not once per wire format.
    """
    payload: dict[str, object] = {}
    for column in INGEST_HEALTH_RUN_COLUMNS:
        if column == "janela_de_perda":
            payload[column] = LOSS_WINDOW_NOT_COMPUTED_IN_F0
        else:
            payload[column] = getattr(run, column)
    return payload


def _project_gap_dict(gap: IngestGap) -> dict[str, object]:
    """Build the `md.ingest_gap` column dict, keeping `class` as the wire name.

    The SHARED step between the CLI's line-JSON (`_project_gap`) and the HTTP envelope
    (`IngestHealthReport.to_envelope`) — same reason as `_project_run_dict`.
    """
    return {
        column: getattr(gap, _GAP_FIELD_BY_COLUMN[column]) for column in INGEST_HEALTH_GAP_COLUMNS
    }


def _project_run(run: IngestRun) -> str:
    """Project one run onto the 15 columns `ADR-008/D3` fixed, in the order it fixed them."""
    return canonical_json(_project_run_dict(run))


def _project_gap(gap: IngestGap) -> str:
    """Project one gap onto the `md.ingest_gap` columns, keeping `class` as the wire name."""
    return canonical_json(_project_gap_dict(gap))
