"""`classify_disc_layout` — disc-collision geometry for an S2 panel (`ADR-026/D2`).

`CA-F4-5`'s own two sentences do not reconcile under the same reading of "r" (`ADR-026`
§"Achado"): the compact inequality `2r + 2 <= espaçamento_px` with `r=4` (the radius the
same paragraph cites) puts the threshold at 10h; the worked example in the SAME paragraph
("disco r=4 com anel de 2px = 12px") puts it at 8,3333h — the number the DoD itself
publishes as "~8,33h". This module implements the reconciled reading,
`2 x (radius_px + ring_px) <= spacing_px`, because it is the one that reproduces the number
already published as the citable threshold — not because it copies the compact inequality
literally. `PRD-001`/plano `08` are NOT corrected by this module: the ambiguous "2r+2"
wording stays there; that edit belongs to the owner of those documents, not to this ADR.

`radius_px`/`ring_px` are always PARAMETERS of `classify_disc_layout`, never constants
hardcoded inside it — the same posture `ADR-020` already took for bin edges (`ADR-020`
"alternativas recusadas"): a hardcoded radius that fits today's disc design would break
silently the day the disc design changes.

Falsifier (`ADR-026` §"Falsificador desta ADR"): `classify_disc_layout(1200, 300_000,
86_400_000, 4, 2)` must yield `spacing_px == 4.1666...`, `min_required_px == 12`,
`fuses == True` (65,3% overlap); at the threshold itself,
`classify_disc_layout(1200, 300_000, 30_000_000, 4, 2)` must yield
`spacing_px == min_required_px == 12.0`, `fuses == False` (the comparison is inclusive,
`<=`). Both are fixed as regression tests in
`backend/tests/charts/test_panel_disc_layout.py` — this IS the proof of the "Achado"
reconciliation, not a prose claim.
"""

from __future__ import annotations

from dataclasses import dataclass


class InvalidDiscLayoutError(Exception):
    """A `classify_disc_layout` input outside its declared bound."""


@dataclass(frozen=True)
class DiscLayout:
    """The verdict `classify_disc_layout` returns — `ADR-026/D2`, literal.

    Never a bare boolean of "cabe": every number that produced the verdict is carried on
    the type, so a caller can render "why" without recomputing the geometry.
    """

    spacing_px: float
    radius_px: float
    ring_px: float
    min_required_px: float  # `2 * (radius_px + ring_px)` — see module docstring "Achado"
    fuses: bool  # `min_required_px > spacing_px`
    downsample_declared: bool  # == fuses; named separately because the panel TITLE reads this

    def __post_init__(self) -> None:
        """Refuse a non-positive geometry field — a panel does not exist at zero width."""
        if self.spacing_px <= 0:
            raise InvalidDiscLayoutError(f"spacing_px must be positive, got {self.spacing_px!r}")
        if self.radius_px <= 0:
            raise InvalidDiscLayoutError(f"radius_px must be positive, got {self.radius_px!r}")
        if self.ring_px < 0:
            raise InvalidDiscLayoutError(f"ring_px must be non-negative, got {self.ring_px!r}")


def classify_disc_layout(
    width_px: float,
    native_grid_ms: int,
    window_ms: int,
    radius_px: float,
    ring_px: float,
) -> DiscLayout:
    """Classify whether adjacent discs on an S2 panel fuse — `CA-F4-5`, reconciled reading.

    Pure function of 5 numbers: no I/O, no clock read (`ADR-003/FR-1`).
    """
    if width_px <= 0:
        raise InvalidDiscLayoutError(f"width_px must be positive, got {width_px!r}")
    if native_grid_ms <= 0:
        raise InvalidDiscLayoutError(f"native_grid_ms must be positive, got {native_grid_ms!r}")
    if window_ms <= 0:
        raise InvalidDiscLayoutError(f"window_ms must be positive, got {window_ms!r}")

    spacing_px = width_px * native_grid_ms / window_ms
    min_required_px = 2 * (radius_px + ring_px)
    fuses = min_required_px > spacing_px
    return DiscLayout(
        spacing_px=spacing_px,
        radius_px=radius_px,
        ring_px=ring_px,
        min_required_px=min_required_px,
        fuses=fuses,
        downsample_declared=fuses,
    )
