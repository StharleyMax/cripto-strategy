"""`FieldIdentity` — the 3-of-15 `SeriesKey` terms that key an `S4` histogram (`ADR-020/D1`).

`S4` is a cross-symbol bancada by design (`SPEC-001` §6, `S4`'s own job: "que taxa de disparo
um limiar produziria — antes de escolher o limiar", over a UNIVERSE, not one symbol). If bin
edges were keyed by `instrument_id`/`venue`/`cohort` too, every symbol would carry its own
incomparable histogram and `scan` would lose the one thing it counts: how many symbols crossed
a common edge. `unit`/`denom` stay IN the key because `CA-F4-13` already measured that the SAME
`metric` (open interest) changes scale by `denom` (`base_contracts` vs `notional_usd`) — folding
them out would reopen the exact failure `D8.6` measured one field over (11 fixed bin edges,
calibrated for one field's scale, missing 47,2% of another's).

`nature` is deliberately NOT a term of `FieldIdentity` — it is a sibling axis, reused whole from
`src.modules.sentimento.domain.series_key.Nature`, because it carries no scale of its own: it
governs the absence policy (`SPEC-001` §5.11) and the point-mass pre-step (`ADR-020/D3`), never
a unit conversion. `ADR-020/D1` names this the same split `SPEC-001` already writes as
`(field, nature)` — two axes, not one.
"""

from __future__ import annotations

from dataclasses import dataclass

# The three terms, in the order `ADR-020/D1` writes them — feeds no hash today (unlike
# `SeriesKey.SERIES_KEY_TERMS`, `FieldIdentity` is not persisted with a `sha256` identity of
# its own), but kept as an explicit tuple anyway so a future consumer that DOES need to iterate
# the terms in a stable order has one place to read it from, instead of inventing a second.
FIELD_IDENTITY_TERMS: tuple[str, ...] = ("metric", "unit", "denom")


class IncompleteFieldIdentityError(Exception):
    """A term of `FieldIdentity` that is blank.

    The same failure `SeriesKey` refuses, one axis down: a blank term does not distinguish one
    field from another.
    """


@dataclass(frozen=True)
class FieldIdentity:
    """`field := (metric, unit, denom)` — `ADR-020/D1`, literal.

    Frozen and hashable by the dataclass default (`frozen=True` implies `eq=True` implies a
    generated `__hash__`): two `FieldIdentity` values with the same three terms are the SAME
    field, and this type is meant to be a dict/set key (the point-mass and bin-edge cache a
    future task may add would key on exactly this).
    """

    metric: str
    unit: str
    denom: str

    def __post_init__(self) -> None:
        """Refuse a `FieldIdentity` with a blank term."""
        for term in FIELD_IDENTITY_TERMS:
            value = getattr(self, term)
            if not value.strip():
                raise IncompleteFieldIdentityError(
                    f"field term '{term}' is blank: a blank term does not distinguish one "
                    f"field from another, which is the failure ADR-020/D1 exists to prevent"
                )
