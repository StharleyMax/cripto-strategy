"""`SingleAxisSeries` — a panel carries exactly one `denom`, by the SHAPE of the type.

`ADR-026/D4`, literal.

`CA-F4-13`: `p99|delta15m|` of the taker is 824,6% against 0,75% of open interest (1.100x)
— the two scales are far enough apart that a visual reading of correlation between two
curves plotted on two different Y axes would be FABRICATED by the arbitrary alignment of
the two axes, never by the data itself. `SingleAxisSeries` has exactly ONE `denom: str`
field — not `denom: str | tuple[str, str]`, not `denoms: list[str]`, not two fields
`left_denom`/`right_denom`. There is no constructor call for "both at once" to make: this is
a stronger guarantee than a constructor that REFUSES two populated denoms (a validation,
which only fires if a caller remembers to invoke it) — the illegal state has no
representation to construct in the first place.

`denom` reuses the SAME two literals `FieldIdentity.denom` already fixes verbatim
(`base_contracts` / `notional_usd`, `ADR-020/D1`, `backend/src/modules/charts/domain/
field_identity.py`) — never rescaled here, and this module does not reopen `FieldIdentity`
itself (`ADR-026` §"O que já existe": a panel-of-one-symbol type does not need `metric`/
`unit` too).

`ScalarSlot` mirrors `frontend/src/charts/s2-scalar-grid.ts`'s `ScalarSlot` interface
(`{time, value}`) as VOCABULARY, not by import — Python and TypeScript do not share a
module system, the same posture `histogram_recipe.Interpolation` already takes for
`threshold-spec-bundle.ts`'s `Interpolation`. `value: float | None` keeps the same
never-fabricated-gap posture as the TS side: a slot the grid says exists with no source
point is `None`, never a guessed number.

Rejected form (`ADR-026` "alternativas recusadas"): two optional fields (`primary_denom`,
`secondary_denom: str | None`) — still represents the forbidden state (`secondary_denom`
populated), because the pair `(str, str)` remains constructible; that is a validation
disguised as a type, not a shape that closes the question.

Falsifier (`ADR-026` §"Falsificador desta ADR"): a type in `charts/domain` able to
represent two `denom` values at once for the same panel (two fields, a tuple, an
`Optional` second denom) breaks `D4` by construction, not by a test someone has to
remember to run.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class ScalarSlot:
    """One canonical grid slot for a single-value series — mirrors the TS `ScalarSlot` shape."""

    time: int  # epoch milliseconds UTC -- the bucket-start instant this value belongs to
    value: float | None  # `None` = the grid has a slot here and no source point filled it


class UnknownDenomError(Exception):
    """`switch_denom` was asked for a `denom` that `slots_by_denom` does not carry."""


@dataclass(frozen=True)
class SingleAxisSeries:
    """A panel's series for exactly one `denom` — `ADR-026/D4`, literal.

    No combination of this type's field values represents two Y axes at once.
    """

    denom: str  # "base_contracts" | "notional_usd" -- verbatim vocabulary of `ADR-020/D1`
    slots: tuple[ScalarSlot, ...]


def switch_denom(
    current: SingleAxisSeries,
    new_denom: str,
    slots_by_denom: Mapping[str, tuple[ScalarSlot, ...]],
) -> SingleAxisSeries:
    """Switch a panel's `denom` — REPLACES the series, never merges/accumulates a second axis.

    `CA-F4-13`'s "toggle", read literally: `current`'s slots are discarded, not kept
    alongside the new ones — the return value is a fresh `SingleAxisSeries`, not `current`
    mutated or extended.
    """
    del current  # discarded on purpose -- switching denom never merges the previous series
    if new_denom not in slots_by_denom:
        raise UnknownDenomError(
            f"no slots available for denom {new_denom!r} (have {sorted(slots_by_denom)!r})"
        )
    return SingleAxisSeries(denom=new_denom, slots=slots_by_denom[new_denom])
