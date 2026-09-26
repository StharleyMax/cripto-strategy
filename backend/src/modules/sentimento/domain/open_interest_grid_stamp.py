"""Stamp `/fapi/v1/openInterest` readings on the 1-minute grid: in `[T - 20 s, T]` or ABSENT."""

# `SPEC-009` §6.1 (`T-03.2`, `RN-2`, `[Q-STAMP-1]`) as corrected by the `quant-architect` verdict
# on `[Q-STAMP-1]` (`docs/context/paineis-de-fluxo/handoff/Q-STAMP-1-quant-architect.md` §1, §4):
# the reading of minute `T` is the FRESHEST reading whose `time` lies in `[T - 20 s, T]`. A minute
# with no such reading is ABSENT (`RN-2`), never filled with a neighbour's value. The sentence of
# `SPEC-009` §6.1 as approved reads `[T, T + 20 s]`; that direction is look-ahead by construction
# and its amendment goes to the owner by exception — this module implements the corrected rule.
# Pure function, nothing else: no clock, no I/O, no knowledge of when the collector calls
# (`T-03.4` calls at `T - 5 s`, verdict §3).
#
# WHY the window sits BEFORE `T`. The catalog of `T-03.3` records the stamp as
# `POINT_AT_BUCKET_END` (`series_key.py:107-108`, "one reading, stamped at the close of the
# window"): `p(T)` is read as "the open interest when the bucket `(T - 1 min, T]` closes", and
# `ADR-045/D1` uses it as that bucket's `close`. A reading whose `time` is AFTER `T` carries what
# happened after the close — look-ahead of `time - T`. A reading whose `time` is BEFORE `T` is only
# stale by `T - time`, exactly like a kline `close` (the last trade UP TO the close). Staleness is
# the safe direction; look-ahead is the class this component exists to block.
#
# Four decisions, each with the case that pins it in the test module:
#
#   1. `T` is the grid instant AT OR AFTER `event_time_ms` (ceiling), never the one before it and
#      never the nearest. A reading at `T + 1 ms` goes to `T + 1 min` with staleness 59 999 ms,
#      outside that minute's window, so it is ABSENT — it is never pulled BACK to `T`. That is the
#      case that makes look-ahead unrepresentable: every admitted row satisfies
#      `0 <= grid_instant_ms - event_time_ms <= 20 000`.
#   2. The window is CLOSED on both ends: `T - 20 000 ms` is admitted, `T - 20 001 ms` is not; a
#      reading at exactly `T` is admitted with staleness 0.
#   3. Freshest wins: when several readings of the same `(symbol, T)` land in the window, the one
#      with the LARGEST `time` is the value "as of `T`", whatever order they were handed in. On a
#      tie of `time` (Binance serves the same snapshot to consecutive calls) the first stays. The
#      losers are reported as SUPERSEDED, never silently dropped.
#   4. Absent means NO ROW. The guard is structural as well as behavioural: `StampedOpenInterest`
#      refuses to exist unless its OWN `event_time_ms` lies in its OWN `[T - 20 s, T]`, so a
#      carried value — stale by more than a minute at any later `T` — cannot be represented.
#
# Robustness this buys, measured rather than assumed: a call scheduled before `T` CAN return a
# `time` after `T` when the send stalls (`[MEDIDO 2026-09-25, n=3.822]`: 1 case, round trip
# 5,31 s — verdict §2). Under the ceiling that reading lands in `T + 1 min` with ~57 s of
# staleness, i.e. ABSENT. No scheduling error of the collector can produce look-ahead: the worst
# it produces is a hole.

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.open_interest_snapshot import OpenInterestSnapshot

# The grid of the default timeframe (`SPEC-009` §6.1, "a grade de 1 min e a do TF default").
OPEN_INTEREST_GRID_MS: Final[int] = 60_000

# `[Q-STAMP-1]`, `SPEC-009` §11: "inferivel", validated by `quant-architect` (verdict §2): the
# width stays 20 s, only the side changes. With the call at `T - 5 s`, the measured lag of `time`
# behind the request (p99 8,37 s, max 9,75 s, `n=4.546`) puts `time` in `[T - 14,8 s, T - 2,8 s]`.
OPEN_INTEREST_ADMISSION_WINDOW_MS: Final[int] = 20_000


class InvalidOpenInterestStampError(Exception):
    """A stamp whose grid instant is not the minute its own reading was admitted into."""


def admitted_grid_instant(event_time_ms: int) -> int | None:
    """Return the grid instant `T` whose `[T - 20 s, T]` holds `event_time_ms`, or `None`.

    `T` is the 1-minute grid instant at or after `event_time_ms` (ceiling, never floor, never
    nearest), so `T - event_time_ms` is the staleness and is never negative. `None` means the
    reading belongs to NO minute: that minute stays absent.
    """
    grid_instant = event_time_ms + (-event_time_ms) % OPEN_INTEREST_GRID_MS
    if grid_instant - event_time_ms <= OPEN_INTEREST_ADMISSION_WINDOW_MS:
        return grid_instant
    return None


@dataclass(frozen=True)
class StampedOpenInterest:
    """One admitted reading, placed at grid instant `grid_instant_ms` (epoch ms, UTC).

    `grid_instant_ms` is the `T` of `SPEC-009` §6.1 — the instant the value is AT, which the
    catalog of `T-03.3` records as `POINT_AT_BUCKET_END` (the close of `(T - 1 min, T]`).
    `event_time_ms` is kept beside it so the admission is auditable row by row:
    `grid_instant_ms - event_time_ms` is the staleness, always in `[0, 20 000]`.
    """

    symbol: str
    grid_instant_ms: int
    open_interest_raw: str
    event_time_ms: int

    def __post_init__(self) -> None:
        """Refuse a stamp whose reading was not taken inside this very minute's window."""
        if self.grid_instant_ms % OPEN_INTEREST_GRID_MS != 0:
            raise InvalidOpenInterestStampError(
                f"grid_instant_ms {self.grid_instant_ms} is not on the "
                f"{OPEN_INTEREST_GRID_MS} ms grid"
            )
        if admitted_grid_instant(self.event_time_ms) != self.grid_instant_ms:
            raise InvalidOpenInterestStampError(
                f"event_time_ms {self.event_time_ms} is outside [T - "
                f"{OPEN_INTEREST_ADMISSION_WINDOW_MS} ms, T] for T = {self.grid_instant_ms}: "
                "a reading can only be stamped on the minute it was admitted into"
            )


@dataclass(frozen=True)
class OpenInterestStamping:
    """Every input reading, sorted into exactly one of three fates, each tuple in input order.

    - `admitted`: the freshest in-window reading of its `(symbol, T)` — the only rows that exist;
    - `out_of_window`: readings whose `time` falls in no minute's window (their minute is absent);
    - `superseded`: in-window readings of a `(symbol, T)` that a fresher reading took.

    Nothing is invented: `admitted` never holds a minute without its own reading, and the three
    tuples together account for every input exactly once.
    """

    admitted: tuple[StampedOpenInterest, ...]
    out_of_window: tuple[OpenInterestSnapshot, ...]
    superseded: tuple[OpenInterestSnapshot, ...]


def stamp_open_interest_readings(
    readings: Iterable[OpenInterestSnapshot],
) -> OpenInterestStamping:
    """Stamp readings on the 1-minute grid, freshest `time` per `(symbol, T)` (`SPEC-009` §6.1).

    Input order does not choose the winner; it only breaks a tie of `time` (the first stays) and
    orders each output tuple. A minute with no admitted reading is simply not in `admitted`; it is
    never filled from a neighbour.
    """
    ordered = list(readings)
    grid_instants = [admitted_grid_instant(reading.event_time_ms) for reading in ordered]

    winner_by_slot: dict[tuple[str, int], int] = {}
    for index, (reading, grid_instant) in enumerate(zip(ordered, grid_instants, strict=True)):
        if grid_instant is None:
            continue
        slot = (reading.symbol, grid_instant)
        current = winner_by_slot.get(slot)
        if current is None or reading.event_time_ms > ordered[current].event_time_ms:
            winner_by_slot[slot] = index
    winners = set(winner_by_slot.values())

    admitted: list[StampedOpenInterest] = []
    out_of_window: list[OpenInterestSnapshot] = []
    superseded: list[OpenInterestSnapshot] = []
    for index, (reading, grid_instant) in enumerate(zip(ordered, grid_instants, strict=True)):
        if grid_instant is None:
            out_of_window.append(reading)
        elif index in winners:
            admitted.append(
                StampedOpenInterest(
                    symbol=reading.symbol,
                    grid_instant_ms=grid_instant,
                    open_interest_raw=reading.open_interest_raw,
                    event_time_ms=reading.event_time_ms,
                )
            )
        else:
            superseded.append(reading)
    return OpenInterestStamping(
        admitted=tuple(admitted),
        out_of_window=tuple(out_of_window),
        superseded=tuple(superseded),
    )
