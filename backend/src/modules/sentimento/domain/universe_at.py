"""`universe_at(ts, filtro)`: the point-in-time universe, with `s3_inferred` barred BY TYPE."""

# `SPEC-001` §3.7, `CA-F3-4`, plan `07` item 7.10 (`T-07.8`/`CST-62`). `SPEC-001` §3.7 fixes the
# general vocabulary as a three-member type-sum:
#
#   universe_source ∈ { snapshot, s3_inferred, premium_index_witness }
#
# and then, one line below it, disqualifies one of the three for exactly one purpose:
#
#   "universe_source = s3_inferred e INADMISSIVEL no caminho de decisao. Ele deduz existencia
#    do simbolo da existencia do arquivo -- fato conhecivel ~30,3h depois e so para simbolos
#    cujos arquivos continuam publicados: survivorship e lookahead na mesma coluna."
#
# `PRD-001` §CA-F0-1 explains WHY this is not a hypothetical: the daily `exchangeInfo` snapshot
# series (`T-02.1`) only started being captured on `2026-08-25` (one manual capture; `Q1` -- the
# cron that would make this a real series -- is still open). Every `ts` requested before that
# date has NO snapshot witness at all, ONLY the S3-derived one. Without a TYPE-level exclusion,
# the tempting shortcut ("no snapshot? use the S3 witness as if it decided") turns every
# cross-sectional read of the past into a retrospective read by construction -- exactly the
# defect `PRD-001` line 613 names: "resultado anterior a primeira data de snapshot sai rotulado
# 'universo retrospectivo (s3_inferred) -- nao e o universo conhecivel em t'", never silently
# promoted to a decided answer.
#
# ── THE TWO TYPES, AND WHY THERE ARE TWO ────────────────────────────────────────────────────
#
# `UniverseSource` is `SPEC-001` §3.7's own three members, spelled once, for callers that need
# to TAG a witness (this module does, on `UniverseAtResult.s3_witness_source`).
# `DecisiveUniverseSource` is the ADMISSIBLE subset `decide_universe_membership` accepts --
# `Literal["snapshot", "premium_index_witness"]`, which has no `s3_inferred` member AT ALL. A
# caller cannot construct a `Mapping[DecisiveUniverseSource, frozenset[str]]` with an
# `"s3_inferred"` key and pass `mypy --strict` (`backend/scripts/lint.sh`): the key type itself
# has no such variant to assign, the same technique `SurvivorshipVerdict`
# (`dump_survivorship.py`) uses to make a third verdict unrepresentable. This is BY TYPE, not
# validation -- there is no `if source == "s3_inferred": raise` anywhere in this module, and
# `test_universe_at.py`'s structural falsifier proves none is needed.
#
# ── UNION OF THE TWO TESTEMUNHAS, DIVERGENCE MARKED (SPEC-001 §3.7, "D-18") ────────────────
#
# `universe_at` never merges the two witnesses silently: `UniverseAtResult.symbols` is the
# UNION (decided ∪ s3-witness), and `divergence` (`compare_symbol_sets`, reused from
# `instrument_universe_snapshot.py` -- the same function `D2.3`/`D2.4` already use, per the
# handoff's instruction not to invent a third representation) names exactly which symbols only
# one side attests. When no snapshot is available for `ts` at all (the `2025-08-01` case, per
# `CA-F0-1`), `decided_symbols` is `frozenset()` -- not because the decision confirmed an empty
# universe, but because there was nothing admissible to decide FROM -- and `label` carries
# `RETROSPECTIVE_LABEL` so a caller cannot mistake "empty because unconfirmed" for "empty
# because measured".
#
# ── DOMAIN, NOT infra/use_cases (`ADR-016`, `Natureza`) ─────────────────────────────────────
#
# No socket, no clock, no file. The two witnesses arrive as already-loaded data the caller
# built with `instrument_universe_snapshot.build_instrument_rows` (the snapshot side) and
# whatever S3-survivorship-derived listing `T-07.2`'s vocabulary already names (the s3 side) --
# this module reads no second representation of either.

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final, Literal

from src.modules.sentimento.domain.instrument_universe_snapshot import (
    InstrumentRow,
    SymbolSetDivergence,
    compare_symbol_sets,
)

UniverseSource = Literal["snapshot", "s3_inferred", "premium_index_witness"]

# The decision-path admissible subset -- EXCLUDES `s3_inferred` structurally (see module
# docstring). `decide_universe_membership` below is the ONLY function whose signature carries
# this type; nothing else in this module needs to talk about "an admissible source" at all.
DecisiveUniverseSource = Literal["snapshot", "premium_index_witness"]

SNAPSHOT: Final[DecisiveUniverseSource] = "snapshot"
PREMIUM_INDEX_WITNESS: Final[DecisiveUniverseSource] = "premium_index_witness"

# Typed `UniverseSource`, deliberately NOT `DecisiveUniverseSource` -- assigning this constant
# where a `DecisiveUniverseSource` is expected is exactly the misuse `mypy --strict` refuses.
S3_INFERRED: Final[UniverseSource] = "s3_inferred"

# `PRD-001` line 613, literal: "universo retrospectivo (s3_inferred) -- nao e o universo
# conhecivel em t". The CODE, per this repository's exception-message and identifier rules
# (`CLAUDE.md`, "idioma de identificador"), names the reason in English; the SPEC's own words
# are what the comment above quotes.
RETROSPECTIVE_LABEL: Final[str] = "retrospective_before_first_snapshot"


@dataclass(frozen=True)
class UniverseFilter:
    """A read-time filter over the point-in-time universe.

    `SPEC-001` §6/Q5, literal: "universo e filtro na LEITURA; contractType, underlyingSubType,
    venue_symbol persistidos por linha" -- this dataclass filters on the two of those three
    fields `InstrumentRow` (`T-02.1`) already stores; it adds no new column. `None` on a field
    means "do not filter on this axis", not "match rows where the field is absent" -- the two
    are different questions and this dataclass keeps them apart the way `InstrumentRow`'s own
    `None`-vs-`()` distinction does.
    """

    market: str | None = None
    underlying_sub_type: tuple[str, ...] | None = None

    def matches(self, row: InstrumentRow) -> bool:
        """Return whether `row` survives every axis this filter constrains."""
        if self.market is not None and row.market != self.market:
            return False
        return not (
            self.underlying_sub_type is not None
            and row.underlying_sub_type != self.underlying_sub_type
        )


NO_FILTER: Final[UniverseFilter] = UniverseFilter()


def decide_universe_membership(
    witnesses: Mapping[DecisiveUniverseSource, frozenset[str]],
) -> frozenset[str]:
    """Return the union of every symbol an ADMISSIBLE witness names -- the decision path.

    `witnesses` is keyed by `DecisiveUniverseSource`, which has no `s3_inferred` member: no
    call site can add an `s3_inferred`-sourced set to this mapping and still pass
    `mypy --strict`. An empty `witnesses` (no admissible source available for the requested
    `ts`) returns `frozenset()` -- the caller (`universe_at`) is the one that distinguishes
    "decided, and empty" from "nothing admissible to decide from" via `RETROSPECTIVE_LABEL`,
    because that distinction depends on WHY the mapping is empty, which this function is never
    told.
    """
    decided: frozenset[str] = frozenset()
    for symbols in witnesses.values():
        decided = decided | symbols
    return decided


@dataclass(frozen=True)
class UniverseAtResult:
    """The point-in-time universe at `ts`: the union of both testemunhas, divergence marked.

    `symbols` is `decided_symbols | s3_witness_symbols` -- never one side alone. `label` is
    `None` when a snapshot witness was available (the decision is confirmed) and
    `RETROSPECTIVE_LABEL` when it was not (`decided_symbols` is `frozenset()` for lack of an
    admissible witness, and `symbols` is carried entirely by the `s3_inferred` side).
    """

    ts: str
    symbols: frozenset[str]
    decided_symbols: frozenset[str]
    s3_witness_symbols: frozenset[str]
    divergence: SymbolSetDivergence
    label: str | None


def universe_at(
    ts: str,
    filtro: UniverseFilter | None = None,
    *,
    snapshot_rows: Sequence[InstrumentRow] | None = None,
    s3_witness_symbols: frozenset[str] = frozenset(),
) -> UniverseAtResult:
    """Return the universe vigente at `ts`, filtered by `filtro` -- `SPEC-001` §3.7, `D7.7`.

    `snapshot_rows=None` means "no `exchangeInfo` snapshot exists for `ts`" (the honest state
    for any `ts` before `T-02.1`'s series started, `CA-F0-1`) -- distinct from `snapshot_rows=()`
    ("a snapshot exists and its filtered projection is empty"), the same `None`-vs-empty
    distinction `InstrumentRow.underlying_sub_type` already relies on elsewhere in this
    component. Only the former yields `RETROSPECTIVE_LABEL`.

    `s3_witness_symbols` is the S3-survivorship-derived witness (`T-07.2`'s vocabulary) -- it is
    NEVER passed to `decide_universe_membership`; it only contributes to the union and to
    `divergence`, per `s3_inferred`'s exclusion from the decision path.
    """
    resolved_filtro = filtro if filtro is not None else NO_FILTER
    witnesses: dict[DecisiveUniverseSource, frozenset[str]] = {}
    if snapshot_rows is not None:
        witnesses[SNAPSHOT] = frozenset(
            row.symbol for row in snapshot_rows if resolved_filtro.matches(row)
        )
    decided_symbols = decide_universe_membership(witnesses)
    return UniverseAtResult(
        ts=ts,
        symbols=decided_symbols | s3_witness_symbols,
        decided_symbols=decided_symbols,
        s3_witness_symbols=s3_witness_symbols,
        divergence=compare_symbol_sets(decided_symbols, s3_witness_symbols),
        label=None if snapshot_rows is not None else RETROSPECTIVE_LABEL,
    )
