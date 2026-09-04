"""`classify_grid_multiple` — `ADR-026/D1`: 3 named states, never a bare boolean."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.panel_grid_enablement import (
    GridMultipleReason,
    GridMultipleVerdict,
    InvalidGridMultipleInputError,
    classify_grid_multiple,
)

ONE_MINUTE_MS = 60_000
FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS
SIXTY_MINUTES_MS = 60 * ONE_MINUTE_MS


def test_falsifier_60m_over_5m_native_is_multiple_of_native() -> None:
    """`ADR-026` falsifier: 60m over a 5m native grid — the `719/720` case `CA-F4-4` measures."""
    verdict = classify_grid_multiple(SIXTY_MINUTES_MS, FIVE_MINUTES_MS)
    assert verdict.enabled is True
    assert verdict.reason is GridMultipleReason.MULTIPLE_OF_NATIVE
    assert verdict.multiple == 12


def test_falsifier_1m_over_5m_native_is_upsampling_and_disabled() -> None:
    """`ADR-026` falsifier: 1m over 5m native — the `20,0%` coverage case `CA-F4-4` measures."""
    verdict = classify_grid_multiple(ONE_MINUTE_MS, FIVE_MINUTES_MS)
    assert verdict.enabled is False
    assert verdict.reason is GridMultipleReason.UPSAMPLING
    assert verdict.multiple is None


def test_7m_over_5m_native_is_non_multiple_and_disabled() -> None:
    """A panel grid coarser than native, not an exact multiple: `NON_MULTIPLE`, not upsampling."""
    verdict = classify_grid_multiple(7 * ONE_MINUTE_MS, FIVE_MINUTES_MS)
    assert verdict.enabled is False
    assert verdict.reason is GridMultipleReason.NON_MULTIPLE
    assert verdict.multiple is None


def test_upsampling_and_non_multiple_are_distinct_reasons() -> None:
    """The whole point of D1: two different failures never collapse into the same reason."""
    upsampling = classify_grid_multiple(ONE_MINUTE_MS, FIVE_MINUTES_MS)
    non_multiple = classify_grid_multiple(7 * ONE_MINUTE_MS, FIVE_MINUTES_MS)
    assert upsampling.reason != non_multiple.reason
    assert upsampling.enabled is False
    assert non_multiple.enabled is False


def test_equal_to_native_grid_is_multiple_of_native_with_multiple_one() -> None:
    """A panel grid exactly at native: enabled, multiple of 1 — the boundary case of `>=`."""
    verdict = classify_grid_multiple(FIVE_MINUTES_MS, FIVE_MINUTES_MS)
    assert verdict.enabled is True
    assert verdict.reason is GridMultipleReason.MULTIPLE_OF_NATIVE
    assert verdict.multiple == 1


@pytest.mark.parametrize(
    ("panel_grid_ms", "native_grid_ms"),
    [(0, FIVE_MINUTES_MS), (-ONE_MINUTE_MS, FIVE_MINUTES_MS), (FIVE_MINUTES_MS, 0)],
)
def test_a_non_positive_grid_step_is_refused(panel_grid_ms: int, native_grid_ms: int) -> None:
    """A grid does not exist at zero or negative width — construction refuses it."""
    with pytest.raises(InvalidGridMultipleInputError):
        classify_grid_multiple(panel_grid_ms, native_grid_ms)


@pytest.mark.parametrize(
    ("panel_grid_ms", "native_grid_ms"),
    [(0, FIVE_MINUTES_MS), (FIVE_MINUTES_MS, 0)],
)
def test_direct_construction_of_verdict_is_guarded_too(
    panel_grid_ms: int, native_grid_ms: int
) -> None:
    """`__post_init__` guards direct `GridMultipleVerdict(...)` construction, not just the fn."""
    with pytest.raises(InvalidGridMultipleInputError):
        GridMultipleVerdict(
            panel_grid_ms=panel_grid_ms,
            native_grid_ms=native_grid_ms,
            enabled=False,
            reason=GridMultipleReason.NON_MULTIPLE,
            multiple=None,
        )


def test_verdict_is_frozen_and_hashable() -> None:
    """`GridMultipleVerdict` is a value type: same fields compare and hash equal."""
    a = GridMultipleVerdict(
        panel_grid_ms=SIXTY_MINUTES_MS,
        native_grid_ms=FIVE_MINUTES_MS,
        enabled=True,
        reason=GridMultipleReason.MULTIPLE_OF_NATIVE,
        multiple=12,
    )
    b = classify_grid_multiple(SIXTY_MINUTES_MS, FIVE_MINUTES_MS)
    assert a == b
    assert hash(a) == hash(b)
