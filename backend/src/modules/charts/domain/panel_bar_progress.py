"""`Bar` — the final/in-progress bucket union for S2 candle rendering (`ADR-026/D3`).

`CA-F4-19`: 4 minutes into a 5-minute bucket, the definitive high is already known in
77,4% of buckets, low in 78,8%, both in 56,6%, and 90,0% of the eventual range has already
happened — `h`/`l`/`c` of an IN-PROGRESS bucket must NEVER be read as final. "Never read as
final" is not a naming convention: without a type that structurally lacks `high`/`low`/
`close` on the in-progress state, a future consumer reads the wrong field by an honest
mistake — the exact defect `SPEC-001:148` already names as the origin of `R-2`.

Rejected form (`ADR-026` "alternativas recusadas"): `Bar(is_final: bool, open, high, low,
close)` — one type with a boolean flag alongside the same three fields. That shape lets
`is_final=False` coexist with a populated `high` on the SAME object; an `if bar.is_final:
...` guard missing on one code path still compiles and still reads `bar.high` as if final.
With `Bar` as a union, `InProgressBar` has no `.high` attribute to forget to guard — code
typed against `InProgressBar` that tries `bar.high` fails at type-check time, not at
runtime under a rare case.

Visibility, the other half of `D8.13` ("não é escondido"): there is no third `HiddenBar`
variant and no `Optional[Bar]` at the render point — `Bar` is always one of the two cases,
never absent. Hiding the in-progress bucket would require a structural change (adding a
variant, or making the type optional), never an `if` some code path happens to omit.

Scope, explicit (`ADR-026/D3`): this type is for RENDERING, not entry-condition evaluation
— `CA-F4-19` already splits the two uses ("`bar_policy = intrabar` vale para renderização e
simulação de execução e NUNCA para avaliação de condição de entrada"). `Bar`/`InProgressBar`
are not consumed by `convergencia` nor by a signal trigger, and this module decides nothing
about that consumer.

Falsifier (`ADR-026` §"Falsificador desta ADR"): a `Bar` variant carrying a `high`/`low`/
`close` field in a state that represents a bucket not yet closed breaks `D3` directly —
`backend/tests/charts/test_panel_bar_progress.py` proves `InProgressBar` structurally lacks
those attributes, not just that today's code happens not to read them.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FinalBar:
    """A closed bucket — `high`/`low`/`close` are definitive."""

    open: float
    high: float
    low: float
    close: float


@dataclass(frozen=True)
class InProgressBar:
    """A bucket still forming — the field names ARE the barrier `CA-F4-19` requires.

    No `.high`, `.low`, or `.close` attribute exists on this type to read by mistake.
    """

    open: float
    high_so_far: float  # NEVER "high" -- the name is the barrier
    low_so_far: float  # NEVER "low"
    last: float  # NEVER "close"


type Bar = FinalBar | InProgressBar


def is_final(bar: Bar) -> bool:
    """Whether `bar` is a closed bucket — the one boolean question this module answers."""
    return isinstance(bar, FinalBar)
