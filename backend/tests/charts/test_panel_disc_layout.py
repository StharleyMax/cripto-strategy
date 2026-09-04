"""`classify_disc_layout` — `ADR-026/D2`: reconciled `2x(radius_px+ring_px) <= spacing_px`."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.panel_disc_layout import (
    DiscLayout,
    InvalidDiscLayoutError,
    classify_disc_layout,
)

WIDTH_PX = 1200.0
NATIVE_GRID_MS = 300_000  # 5 minutes -- OI's native grid, `CA-F4-4`/`CA-F4-5`
RADIUS_PX = 4.0
RING_PX = 2.0


def test_falsifier_24h_window_fuses_at_65_percent_overlap() -> None:
    """`ADR-026` falsifier: 1200px/24h/(r=4,ring=2) -> `spacing=4.1667px`, fuses, 65,3% overlap."""
    window_ms = 86_400_000  # 24h
    layout = classify_disc_layout(WIDTH_PX, NATIVE_GRID_MS, window_ms, RADIUS_PX, RING_PX)
    assert layout.spacing_px == pytest.approx(4.166666, rel=1e-5)
    assert layout.min_required_px == 12.0
    assert layout.fuses is True
    assert layout.downsample_declared is True
    overlap = (layout.min_required_px - layout.spacing_px) / layout.min_required_px
    assert overlap == pytest.approx(0.6528, rel=1e-3)


def test_falsifier_at_the_8_33h_threshold_does_not_fuse_inclusive() -> None:
    """`ADR-026` falsifier: at `window=30_000_000ms` (~8,33h) `spacing == min_required`, no fuse."""
    window_ms = 30_000_000  # ~8,3333h, the threshold `ADR-026` reconciles to
    layout = classify_disc_layout(WIDTH_PX, NATIVE_GRID_MS, window_ms, RADIUS_PX, RING_PX)
    assert layout.spacing_px == pytest.approx(12.0)
    assert layout.min_required_px == 12.0
    assert layout.fuses is False


def test_just_below_the_threshold_window_fuses() -> None:
    """A window one tick narrower than the threshold: `spacing_px` drops below `min_required_px`."""
    layout = classify_disc_layout(WIDTH_PX, NATIVE_GRID_MS, 30_000_001, RADIUS_PX, RING_PX)
    assert layout.spacing_px < layout.min_required_px
    assert layout.fuses is True


def test_the_compact_reading_2r_plus_2_would_have_given_10h_not_8_33h() -> None:
    """Documents the rejected reading (`ADR-026` §"Achado"): `2r+2` at r=4 gives 10, not 12px."""
    rejected_min_required_px = 2 * RADIUS_PX + 2
    assert rejected_min_required_px == 10.0
    reconciled_min_required_px = 2 * (RADIUS_PX + RING_PX)
    assert reconciled_min_required_px == 12.0
    assert rejected_min_required_px != reconciled_min_required_px


@pytest.mark.parametrize(
    ("width_px", "native_grid_ms", "window_ms", "radius_px", "ring_px"),
    [
        (0.0, NATIVE_GRID_MS, 86_400_000, RADIUS_PX, RING_PX),
        (WIDTH_PX, 0, 86_400_000, RADIUS_PX, RING_PX),
        (WIDTH_PX, NATIVE_GRID_MS, 0, RADIUS_PX, RING_PX),
        (WIDTH_PX, NATIVE_GRID_MS, 86_400_000, 0.0, RING_PX),
        (WIDTH_PX, NATIVE_GRID_MS, 86_400_000, RADIUS_PX, -1.0),
    ],
)
def test_an_invalid_input_is_refused(
    width_px: float, native_grid_ms: int, window_ms: int, radius_px: float, ring_px: float
) -> None:
    """Every one of the 5 inputs has a lower bound, and violating any of them refuses."""
    with pytest.raises(InvalidDiscLayoutError):
        classify_disc_layout(width_px, native_grid_ms, window_ms, radius_px, ring_px)


def test_ring_px_zero_is_allowed() -> None:
    """`ring_px >= 0` (not `> 0`, per `ADR-026/D2`'s own guard list) — zero ring is legal."""
    layout = classify_disc_layout(WIDTH_PX, NATIVE_GRID_MS, 86_400_000, RADIUS_PX, 0.0)
    assert layout.min_required_px == 2 * RADIUS_PX


def test_radius_and_ring_are_parameters_not_hardcoded_constants() -> None:
    """`ADR-026/D2`: a different (radius_px, ring_px) pair changes the verdict — nothing fixed."""
    small_disc = classify_disc_layout(WIDTH_PX, NATIVE_GRID_MS, 86_400_000, 1.0, 0.5)
    big_disc = classify_disc_layout(WIDTH_PX, NATIVE_GRID_MS, 86_400_000, RADIUS_PX, RING_PX)
    assert small_disc.min_required_px != big_disc.min_required_px
    assert small_disc.fuses is False
    assert big_disc.fuses is True


def test_direct_construction_of_disc_layout_is_guarded_too() -> None:
    """`__post_init__` guards direct `DiscLayout(...)` construction, not just the function."""
    with pytest.raises(InvalidDiscLayoutError):
        DiscLayout(
            spacing_px=-1.0,
            radius_px=RADIUS_PX,
            ring_px=RING_PX,
            min_required_px=12.0,
            fuses=True,
            downsample_declared=True,
        )
