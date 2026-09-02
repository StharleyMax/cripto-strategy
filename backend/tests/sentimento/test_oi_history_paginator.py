"""`T-07.1`: the window is enumerated A PRIORI, and `classify_page` catches the D7.3 exploit."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.oi_history_paginator import (
    END_OF_HISTORY_API_CODE,
    REASON_API_ERROR,
    REASON_END_OF_HISTORY,
    REASON_TIMESTAMP_OUTSIDE_REQUESTED_WINDOW,
    ClosedWindow,
    InvalidPaginationParametersError,
    InvalidWindowError,
    MalformedHistoryPointError,
    OiHistoryPageResponse,
    classify_page,
    enumerate_history_pages,
)

ONE_MINUTE_MS = 60_000
FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS


def _point(timestamp_ms: int) -> dict[str, object]:
    """Build a minimal `openInterestHist` point carrying only what `classify_page` reads."""
    return {"timestamp": timestamp_ms, "sumOpenInterest": "123.4"}


# ── `ClosedWindow` — both bounds required, never a naked `startTime` ────────────────────────


def test_a_window_requires_both_bounds_and_refuses_to_start_after_it_ends() -> None:
    """The dangerous `D7.3` shape (`startTime` alone) cannot be built: both fields are required."""
    with pytest.raises(TypeError):
        ClosedWindow(start_time_ms=1_000)  # type: ignore[call-arg]

    with pytest.raises(InvalidWindowError):
        ClosedWindow(start_time_ms=2_000, end_time_ms=1_000)


def test_contains_is_inclusive_on_both_bounds() -> None:
    """A closed window includes its own edges — `D7.4`'s invariant is exact, not a fencepost."""
    window = ClosedWindow(start_time_ms=1_000, end_time_ms=2_000)

    assert window.contains(1_000)
    assert window.contains(2_000)
    assert window.contains(1_500)
    assert not window.contains(999)
    assert not window.contains(2_001)


# ── `enumerate_history_pages` — pure arithmetic, no response involved ────────────────────────


def test_pages_are_enumerated_from_arithmetic_alone_oldest_first_and_never_overlap() -> None:
    """Three pages of 2 points at 1-minute spacing cover the window, no gap, no overlap."""
    window = ClosedWindow(start_time_ms=0, end_time_ms=5 * ONE_MINUTE_MS - 1)
    pages = enumerate_history_pages(window, period_ms=ONE_MINUTE_MS, limit=2)

    assert [(p.start_time_ms, p.end_time_ms) for p in pages] == [
        (0, 2 * ONE_MINUTE_MS - 1),
        (2 * ONE_MINUTE_MS, 4 * ONE_MINUTE_MS - 1),
        (4 * ONE_MINUTE_MS, 5 * ONE_MINUTE_MS - 1),
    ]
    # No overlap and no gap: each page's end + 1 is exactly the next page's start.
    for earlier, later in zip(pages, pages[1:], strict=False):
        assert earlier.end_time_ms + 1 == later.start_time_ms


def test_a_window_narrower_than_one_page_produces_exactly_one_clipped_page() -> None:
    """A window smaller than `period_ms * limit` still produces one page, clipped to the window."""
    window = ClosedWindow(start_time_ms=1_000, end_time_ms=1_500)
    pages = enumerate_history_pages(window, period_ms=ONE_MINUTE_MS, limit=500)

    assert pages == (window,)


@pytest.mark.parametrize(
    "period_ms,limit", [(0, 500), (-1, 500), (ONE_MINUTE_MS, 0), (ONE_MINUTE_MS, -1)]
)
def test_pagination_parameters_that_cannot_produce_a_page_are_refused(
    period_ms: int, limit: int
) -> None:
    """A non-positive `period_ms` or `limit` describes no page at all — refuse rather than loop."""
    window = ClosedWindow(start_time_ms=0, end_time_ms=1_000)
    with pytest.raises(InvalidPaginationParametersError):
        enumerate_history_pages(window, period_ms=period_ms, limit=limit)


def test_enumeration_is_deterministic_and_never_consults_a_response() -> None:
    """Calling enumeration twice with identical inputs yields identical pages — no hidden state."""
    window = ClosedWindow(start_time_ms=0, end_time_ms=10 * FIVE_MINUTES_MS)
    first = enumerate_history_pages(window, period_ms=FIVE_MINUTES_MS, limit=3)
    second = enumerate_history_pages(window, period_ms=FIVE_MINUTES_MS, limit=3)

    assert first == second


# ── `classify_page` — `D7.1`: `-1130` is end of history, not a transient error ───────────────


def test_end_of_history_api_code_is_rejected_with_zero_rows_written() -> None:
    """`D7.1`: `startTime` 60 days back -> `api_code=-1130` -> `REJECTED`, zero lines."""
    window = ClosedWindow(start_time_ms=0, end_time_ms=1_000)
    response = OiHistoryPageResponse(status=400, api_code=END_OF_HISTORY_API_CODE)

    verdict = classify_page(window, response)

    assert verdict.verdict == "REJECTED"
    assert verdict.reason == REASON_END_OF_HISTORY
    assert verdict.api_code == END_OF_HISTORY_API_CODE
    assert verdict.points_to_write == ()


def test_a_different_api_error_code_is_also_rejected_but_labelled_distinctly() -> None:
    """Any OTHER `api_code` is still `REJECTED`, but the reason names it as a generic API error."""
    window = ClosedWindow(start_time_ms=0, end_time_ms=1_000)
    response = OiHistoryPageResponse(status=400, api_code=-1121)

    verdict = classify_page(window, response)

    assert verdict.verdict == "REJECTED"
    assert verdict.reason == REASON_API_ERROR
    assert verdict.points_to_write == ()


# ── `classify_page` — `D7.3`/`D7.4`: THE FALSIFIER. Prove the paginator REFUSES, not accepts ─


def test_d7_3_the_binance_measured_exploit_is_rejected_not_accepted() -> None:
    """`[MEDIDO]`: a `startTime`-alone-shaped request returns TODAY's tail, `HTTP 200`, no warning.

    This plants exactly that response against an OLD requested window and proves the paginator
    REFUSES it rather than writing today's data stamped with a weeks-old timestamp. Without this
    check, a naive `cursor += janela` loop never advances and corrupts `available_at` silently —
    this test is the falsifier for that failure mode.
    """
    sixty_days_ago_ms = 0
    old_window_end_ms = sixty_days_ago_ms + FIVE_MINUTES_MS
    old_window = ClosedWindow(start_time_ms=sixty_days_ago_ms, end_time_ms=old_window_end_ms)
    todays_timestamp_ms = sixty_days_ago_ms + 60 * 24 * 60 * ONE_MINUTE_MS  # far outside the window
    response = OiHistoryPageResponse(status=200, points=(_point(todays_timestamp_ms),))

    verdict = classify_page(old_window, response)

    assert verdict.verdict == "REJECTED"
    assert verdict.reason == REASON_TIMESTAMP_OUTSIDE_REQUESTED_WINDOW
    assert verdict.points_to_write == (), "the exploit must write ZERO rows, not the poisoned point"


def test_d7_4_the_permanent_invariant_one_bad_point_rejects_the_whole_page() -> None:
    """`D7.4`: no timestamp is written outside the requested window — one bad point rejects ALL."""
    window = ClosedWindow(start_time_ms=1_000, end_time_ms=2_000)
    response = OiHistoryPageResponse(
        status=200, points=(_point(1_500), _point(1_800), _point(2_001))
    )

    verdict = classify_page(window, response)

    assert verdict.verdict == "REJECTED"
    assert verdict.points_to_write == ()


def test_a_page_entirely_inside_the_window_is_accepted() -> None:
    """The positive control for `D7.3`/`D7.4`: a well-behaved page is `ACCEPTED` and written."""
    window = ClosedWindow(start_time_ms=1_000, end_time_ms=2_000)
    points = (_point(1_000), _point(1_500), _point(2_000))
    response = OiHistoryPageResponse(status=200, points=points)

    verdict = classify_page(window, response)

    assert verdict.verdict == "ACCEPTED"
    assert verdict.reason is None
    assert verdict.points_to_write == points


# ── `classify_page` — `D7.5`: the OBSERVED limit, not the documented one ─────────────────────


def test_d7_5_a_page_with_501_points_inside_the_window_is_accepted_uncapped() -> None:
    """`[MEDIDO]`: `limit=501` returned 501 rows against a documented max of 500 — use observed.

    Nothing in `classify_page` caps `points_to_write` at 500: it accepts and writes every point
    that is inside the window, regardless of count.
    """
    window = ClosedWindow(start_time_ms=0, end_time_ms=501 * ONE_MINUTE_MS)
    points = tuple(_point(offset * ONE_MINUTE_MS) for offset in range(501))
    response = OiHistoryPageResponse(status=200, points=points)

    verdict = classify_page(window, response)

    assert verdict.verdict == "ACCEPTED"
    assert len(verdict.points_to_write) == 501


def test_a_point_with_no_usable_timestamp_is_refused_rather_than_silently_skipped() -> None:
    """A point missing `timestamp` cannot be checked against the window — refuse, don't guess."""
    window = ClosedWindow(start_time_ms=0, end_time_ms=1_000)
    response = OiHistoryPageResponse(status=200, points=({"sumOpenInterest": "1.0"},))

    with pytest.raises(MalformedHistoryPointError):
        classify_page(window, response)


def test_a_response_cannot_carry_both_an_api_code_and_points() -> None:
    """`OiHistoryPageResponse` is XOR by construction, mirroring `CoinalizeHistoryResponse`."""
    with pytest.raises(ValueError, match="both"):
        OiHistoryPageResponse(status=200, api_code=-1130, points=(_point(0),))
