"""`classify_grid_multiple` — grid-multiple enablement for an S2 panel (`ADR-026/D1`).

`CA-F4-4`, literal: enable when `panel_grid_ms >= native_grid_ms` AND `panel_grid_ms %
native_grid_ms == 0`; disable ONLY on upsampling (`panel_grid_ms < native_grid_ms`) or on a
non-multiple grid (`panel_grid_ms >= native_grid_ms` but not a multiple of it). A single
`enabled: bool` would collapse two different failures into the same `False`: upsampling
INVENTS points (TF=1m over a 5m native grid has real data for only 20,0% of instants,
`CA-F4-4`'s own measurement) while a non-multiple grid has real data but its bucket
alignment does not line up. The two need different operator-facing guidance ("choose a
coarser timeframe" vs "choose a multiple"), which means they have to be distinguishable in
the type, not only in prose an operator might not read.

Falsifier (`ADR-026` §"Falsificador desta ADR"): `classify_grid_multiple(60min, 5min)` must
yield `enabled=True, reason=MULTIPLE_OF_NATIVE, multiple=12` — the `719/720` case `CA-F4-4`
measures; `classify_grid_multiple(1min, 5min)` must yield `enabled=False,
reason=UPSAMPLING` — the `20,0%` case. Both are fixed as regression tests in
`backend/tests/charts/test_panel_grid_enablement.py`.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class GridMultipleReason(Enum):
    """Why a panel's grid is enabled or not — 3 named states, never a bare boolean.

    `ADR-026/D1`: collapsing `UPSAMPLING` and `NON_MULTIPLE` into one `False` would hide
    which of two structurally different problems the panel has.
    """

    MULTIPLE_OF_NATIVE = "multiple_of_native"
    UPSAMPLING = "upsampling"
    NON_MULTIPLE = "non_multiple"


class InvalidGridMultipleInputError(Exception):
    """A non-positive grid step — a grid does not exist at zero or negative width."""


@dataclass(frozen=True)
class GridMultipleVerdict:
    """The verdict `classify_grid_multiple` returns — `ADR-026/D1`, literal."""

    panel_grid_ms: int
    native_grid_ms: int
    enabled: bool
    reason: GridMultipleReason
    multiple: int | None  # `panel_grid_ms // native_grid_ms` when enabled, else `None`

    def __post_init__(self) -> None:
        """Refuse a non-positive grid step on either axis."""
        if self.panel_grid_ms <= 0:
            raise InvalidGridMultipleInputError(
                f"panel_grid_ms must be positive, got {self.panel_grid_ms!r}"
            )
        if self.native_grid_ms <= 0:
            raise InvalidGridMultipleInputError(
                f"native_grid_ms must be positive, got {self.native_grid_ms!r}"
            )


def classify_grid_multiple(panel_grid_ms: int, native_grid_ms: int) -> GridMultipleVerdict:
    """Classify a panel timeframe against its field's native grid — `CA-F4-4`, literal.

    Pure function of two integers: no I/O, no clock read (`ADR-003/FR-1`).
    """
    if panel_grid_ms <= 0:
        raise InvalidGridMultipleInputError(
            f"panel_grid_ms must be positive, got {panel_grid_ms!r}"
        )
    if native_grid_ms <= 0:
        raise InvalidGridMultipleInputError(
            f"native_grid_ms must be positive, got {native_grid_ms!r}"
        )
    if panel_grid_ms < native_grid_ms:
        return GridMultipleVerdict(
            panel_grid_ms=panel_grid_ms,
            native_grid_ms=native_grid_ms,
            enabled=False,
            reason=GridMultipleReason.UPSAMPLING,
            multiple=None,
        )
    if panel_grid_ms % native_grid_ms == 0:
        return GridMultipleVerdict(
            panel_grid_ms=panel_grid_ms,
            native_grid_ms=native_grid_ms,
            enabled=True,
            reason=GridMultipleReason.MULTIPLE_OF_NATIVE,
            multiple=panel_grid_ms // native_grid_ms,
        )
    return GridMultipleVerdict(
        panel_grid_ms=panel_grid_ms,
        native_grid_ms=native_grid_ms,
        enabled=False,
        reason=GridMultipleReason.NON_MULTIPLE,
        multiple=None,
    )
