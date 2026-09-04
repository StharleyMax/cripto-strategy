"""The intrabar tie-break method — `ADR-021`/D5, `docs/decisoes-do-owner.md:367-373`."""

from __future__ import annotations

from enum import StrEnum


class IntrabarConvention(StrEnum):
    """Which rule decided a trade's SL-vs-TP outcome when both fall in the same bar.

    This is METHOD, not measure — fixed by the version of the engine that ran, never per
    trade. `RunRegistryEntry.intrabar_decided_count` is the companion MEASURE: how many
    trades of THIS run were actually decided by this rule (`ADR-021`/D5). The two travel
    together so the convention's influence on a published number is legible instead of
    embedded.
    """

    PESSIMISTIC_STOP_FIRST = "pessimistic_stop_first"
    """Assume the stop is touched before the target. `docs/decisoes-do-owner.md:367-373`:
    756/768 = 98.44% of 15m bars resolve without ambiguity (high and low land in different
    1m bars); the 1.56% residue gets this convention, which biases the result downward — the
    correct direction for capital, but a bias that has to be measurable, not silent."""
