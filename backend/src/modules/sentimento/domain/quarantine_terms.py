"""The quarantine predicate — three terms, `SPEC-001` §5.2, quoted verbatim below."""

#     QUARENTENA  <=>  label_shift IS NULL  OR  unit IS NULL  OR  available_at IS NULL
#
# The handoff for this task is explicit that quarantine "não é um campo booleano ingênuo" and
# that this task must design the predicate with `T-03.11` (the future consumer) in mind WITHOUT
# building the promotion mechanism — that is out of scope here. This module is the minimum that
# satisfies both halves: the three-term predicate is expressed as a type so a caller cannot
# forget a term, and nothing here decides HOW or WHEN a term gets resolved.
#
# For the Coinalyze one-shot specifically, `SPEC-001` §5.2 already states which terms are
# settled and which is not: *"A medição resolveu `unit` … e `label_shift`… Não resolveu
# `available_at IS NULL`"* — because `Q19` (the `availability_probe_set` that would measure
# `lag_ms` for the Coinalyze endpoints) is still open. `available_at_present` is therefore
# always `False` for a row this task writes, and the module enforces that as
# `COINALYZE_ONE_SHOT_TERMS` below rather than leaving it to every caller to remember.

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class QuarantineTerms:
    """The three presence bits `SPEC-001` §5.2 ORs together — one field per term, none implicit.

    `is_quarantined` is a De Morgan flip of the spec's `OR of NULL`s into `AND of present`s:
    a row is NOT quarantined only when all three terms are present, so anything else — one
    absent, two absent, all three absent — quarantines it. This is the "predicado de três
    termos" the handoff warns is not a naive boolean: it is three independent facts, not one.
    """

    label_shift_present: bool
    unit_present: bool
    available_at_present: bool

    @property
    def is_quarantined(self) -> bool:
        """Return whether this row is quarantined under the three-term predicate."""
        return not (self.label_shift_present and self.unit_present and self.available_at_present)

    @property
    def open_terms(self) -> tuple[str, ...]:
        """Name every term that is absent — the falsifier's own explanation of its verdict."""
        missing = []
        if not self.label_shift_present:
            missing.append("label_shift")
        if not self.unit_present:
            missing.append("unit")
        if not self.available_at_present:
            missing.append("available_at")
        return tuple(missing)


# `SPEC-001` §5.2, literal: "A medição resolveu `unit`… e `label_shift`… Não resolveu
# `available_at IS NULL`". Every row this one-shot writes carries these two terms present and
# the third absent — `Q19` is the only thing that can flip it, and `Q19` is not this task.
COINALYZE_ONE_SHOT_TERMS: Final[QuarantineTerms] = QuarantineTerms(
    label_shift_present=True,
    unit_present=True,
    available_at_present=False,
)
