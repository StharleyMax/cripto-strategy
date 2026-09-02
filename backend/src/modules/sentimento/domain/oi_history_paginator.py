"""The REST paginator: `[start, end]` enumerated A PRIORI, and the invariant that catches D7.3."""

# `SPEC-001` §5.7, `T-07.1` (`CA-F3-2`, `CA-F3-1`): pagination over `/futures/data/openInterestHist`
# NEVER walks a cursor the provider hands back. It enumerates the whole closed window from
# arithmetic alone — `start_time_ms`, `end_time_ms`, `period_ms` and `limit` — before the first
# request is ever sent. Nothing here reads a response to decide what page comes next.
#
# The reason is measured, not stylistic: `openInterestHist` called with `startTime` ALONE returns
# `[MEDIDO]` the tail of TODAY, `HTTP 200`, with no warning — undocumented behaviour. A loop
# shaped `next_start = last_response_timestamp + period` never advances past that reply, and every
# subsequent write carries today's value stamped with a timestamp from weeks ago: silent
# corruption of `available_at`. Enumerating the window up front removes the failure mode at the
# root — there is no "next start" left for a response to corrupt.
#
# That alone is not the whole defence, because a caller could still (by mistake, or because some
# future code path forgets to set `endTime`) end up asking a question the provider answers with
# data outside the window. `classify_page` is the second half: it is the invariant CHECK that
# `D7.4` demands ("nenhum timestamp gravado fora da janela requisitada") applied to what actually
# came back, independent of how the request was built. A page whose points fall outside
# `[start_time_ms, end_time_ms]` is `REJECTED` and writes zero rows, `HTTP 200` or not.
#
# This module is `domain`: no socket, no clock, no file. Every millisecond arrives as a plain
# `int` argument.

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, Literal

# `[MEDIDO]`, `D7.1`: this is the Binance error code for "the window asked for is older than the
# endpoint retains" — `SPEC-001` §5.7 fixes it as END OF HISTORY, never a transient failure to
# retry. Retrying it would spin forever against a window that can never produce data.
END_OF_HISTORY_API_CODE: Final[int] = -1130

Verdict = Literal["ACCEPTED", "REJECTED"]

REASON_END_OF_HISTORY: Final[str] = "end_of_history"
REASON_API_ERROR: Final[str] = "api_error"
REASON_TIMESTAMP_OUTSIDE_REQUESTED_WINDOW: Final[str] = "timestamp_outside_requested_window"


class InvalidWindowError(Exception):
    """A window that starts after it ends — nothing can be enumerated from it."""


class InvalidPaginationParametersError(Exception):
    """A `period_ms` or `limit` that cannot produce a page — zero, negative, or absent."""


class MalformedHistoryPointError(Exception):
    """A returned point has no usable `timestamp` — the invariant cannot be checked on it."""


@dataclass(frozen=True)
class ClosedWindow:
    """One CLOSED `[start_time_ms, end_time_ms]` window, both bounds inclusive, in epoch ms.

    Both bounds are required fields — there is no constructor that accepts `start_time_ms`
    alone. That is deliberate: the dangerous call `D7.3` measured (`startTime` with no
    `endTime`) cannot be expressed by this type at all, so nothing downstream can replay it by
    accident.
    """

    start_time_ms: int
    end_time_ms: int

    def __post_init__(self) -> None:
        """Refuse a window that starts after it ends."""
        if self.start_time_ms > self.end_time_ms:
            raise InvalidWindowError(
                f"window [{self.start_time_ms}, {self.end_time_ms}] starts after it ends"
            )

    def contains(self, timestamp_ms: int) -> bool:
        """Return whether `timestamp_ms` falls inside this closed window."""
        return self.start_time_ms <= timestamp_ms <= self.end_time_ms


@dataclass(frozen=True)
class OiHistoryPageResponse:
    """What one call for one page produced: an API error code XOR a tuple of raw points.

    Mirrors `CoinalizeHistoryResponse`'s "XOR, never both nor neither" shape on purpose — the
    same control applies here: a page must never look like an empty success when it is really a
    dispatched-and-answered error.
    """

    status: int
    api_code: int | None = None
    points: tuple[Mapping[str, object], ...] = ()

    def __post_init__(self) -> None:
        """Reject a response that carries both an error code and data points."""
        if self.api_code is not None and self.points:
            raise ValueError("a response cannot carry both an api error code and data points")


@dataclass(frozen=True)
class HistoryPageVerdict:
    """The outcome of checking one page's response against the window it was requested for."""

    verdict: Verdict
    reason: str | None
    api_code: int | None
    points_to_write: tuple[Mapping[str, object], ...]


def _timestamp_of(point: Mapping[str, object]) -> int:
    """Return the point's `timestamp` field as an `int`, or refuse a point that has none."""
    raw = point.get("timestamp")
    if not isinstance(raw, int):
        raise MalformedHistoryPointError(
            f"point has no integer 'timestamp' field to check against the window: {point!r}"
        )
    return raw


def classify_page(window: ClosedWindow, response: OiHistoryPageResponse) -> HistoryPageVerdict:
    """Classify one page's response against the window it was requested for.

    `D7.1`: `api_code == END_OF_HISTORY_API_CODE` is REJECTED with zero rows — end of history,
    not a transient error to retry.

    `D7.3`/`D7.4`, THE FALSIFIER THIS FUNCTION EXISTS FOR: any returned point whose `timestamp`
    falls outside `[window.start_time_ms, window.end_time_ms]` REJECTS THE WHOLE PAGE, writing
    zero rows — even at `HTTP 200`, even with no `api_code` at all. This is what refuses the
    measured case of `openInterestHist` answering a stale window with today's tail: today's
    timestamp is outside the requested window by construction, so the invariant catches it
    regardless of why it happened.

    `D7.5`: no length cap is applied to `points_to_write` — an accepted page with 501 points
    (the OBSERVED behaviour against a documented max of 500) writes all 501, not 500.
    """
    if response.api_code is not None:
        reason = (
            REASON_END_OF_HISTORY
            if response.api_code == END_OF_HISTORY_API_CODE
            else REASON_API_ERROR
        )
        return HistoryPageVerdict(
            verdict="REJECTED", reason=reason, api_code=response.api_code, points_to_write=()
        )

    for point in response.points:
        if not window.contains(_timestamp_of(point)):
            return HistoryPageVerdict(
                verdict="REJECTED",
                reason=REASON_TIMESTAMP_OUTSIDE_REQUESTED_WINDOW,
                api_code=None,
                points_to_write=(),
            )

    return HistoryPageVerdict(
        verdict="ACCEPTED", reason=None, api_code=None, points_to_write=response.points
    )


def enumerate_history_pages(
    window: ClosedWindow, period_ms: int, limit: int
) -> tuple[ClosedWindow, ...]:
    """Enumerate `window` into consecutive closed sub-windows, oldest first — ARITHMETIC ONLY.

    Each page spans `period_ms * limit` milliseconds, the widest window that `limit` points at
    `period_ms` spacing can cover. The LAST page is clipped to `window.end_time_ms`, everything
    else is exact. Nothing here consults a response: the whole sequence is decided the moment
    `window`, `period_ms` and `limit` are known, which is the property `SPEC-001` §5.7 requires
    ("enumerado ANTES do loop").
    """
    if period_ms <= 0:
        raise InvalidPaginationParametersError(f"period_ms must be positive, got {period_ms}")
    if limit <= 0:
        raise InvalidPaginationParametersError(f"limit must be positive, got {limit}")

    span_ms = period_ms * limit
    pages: list[ClosedWindow] = []
    next_start = window.start_time_ms
    while next_start <= window.end_time_ms:
        page_end = min(next_start + span_ms - 1, window.end_time_ms)
        pages.append(ClosedWindow(start_time_ms=next_start, end_time_ms=page_end))
        next_start = page_end + 1
    return tuple(pages)
