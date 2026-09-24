"""Stamp `/fapi/v1/openInterest` readings on the 1-minute grid: in `[T, T + 20 s]` or ABSENT."""

# `SPEC-009` §6.1 (`T-03.2`, `RN-2`, `[Q-STAMP-1]`), literal: "a leitura do minuto `T` e a
# primeira chamada feita em `T` ou depois dele cujo `time` fique em `[T, T + 20 s]`. Leitura fora
# dessa janela nao entra como ponto de `T`: `T` fica ausente (`RN-2`), nunca carregando o valor
# anterior." This module is that sentence as a pure function, and nothing else: no clock, no I/O,
# no knowledge of how often the collector calls (that is `T-03.4`).
#
# Three decisions are made here, each with the case that pins it in the test module:
#
#   1. The window is CLOSED on both ends: `T + 20 000 ms` is admitted, `T + 20 001 ms` is not.
#      `[T, T + 20 s]` is written with square brackets on both sides in `SPEC-009` §6.1.
#   2. `T` is the grid instant AT OR BEFORE `event_time` (floor), never the nearest one. A reading
#      taken at `T - 1 ms` belongs to minute `T - 1 min` at offset 59 999 ms, outside that minute's
#      window, so it is absent — it is NOT pulled forward into `T`. Rounding would admit readings
#      the source took BEFORE `T` as the value "at `T`", which is the look-ahead in reverse.
#   3. Absent means NO ROW. A minute with no admitted reading produces nothing; the previous
#      minute's value is never repeated into it (`RN-2`: "buraco nao vira candle"). The guard is
#      structural as well as behavioural: `StampedOpenInterest` refuses to exist unless its OWN
#      `event_time_ms` lies in its OWN `[T, T + 20 s]`, so a carried value — whose event time
#      belongs to an earlier minute — cannot be represented at a later `T` at all.
#
# "A primeira chamada feita em `T` ou depois dele": the source's `time` is never LATER than the
# request (`[MEDIDO 2026-09-23, n=30]`: `time` lags the request by 0,5 s to 7,6 s), so a call made
# before `T` cannot return a `time >= T`, and filtering by `time` alone already enforces "made at
# or after `T`". "A primeira" is the order the readings are handed in, i.e. call order: when two
# calls for the same `(symbol, T)` both land in the window, the first wins and the second is
# reported as SUPERSEDED, never silently dropped — the collector counts all three fates.

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.open_interest_snapshot import OpenInterestSnapshot

# The grid of the default timeframe (`SPEC-009` §6.1, "a grade de 1 min e a do TF default").
OPEN_INTEREST_GRID_MS: Final[int] = 60_000

# `[Q-STAMP-1]`, `SPEC-009` §11: "inferivel", owner of validation `quant-architect` (fase `03a`),
# default 20 s. Rationale in §6.1: the worst measured lag of `time` behind the request is 7,6 s,
# so 20 s is ~2,6x that margin. `DoD-1` of `03a` measures the admitted fraction after 24 h.
OPEN_INTEREST_ADMISSION_WINDOW_MS: Final[int] = 20_000


class InvalidOpenInterestStampError(Exception):
    """A stamp whose grid instant is not the minute its own reading was admitted into."""


def admitted_grid_instant(event_time_ms: int) -> int | None:
    """Return the grid instant `T` whose `[T, T + 20 s]` holds `event_time_ms`, or `None`.

    `T` is the 1-minute grid instant at or before `event_time_ms` (floor, never nearest). `None`
    means the reading belongs to NO minute: that minute stays absent.
    """
    grid_instant = event_time_ms - event_time_ms % OPEN_INTEREST_GRID_MS
    if event_time_ms - grid_instant <= OPEN_INTEREST_ADMISSION_WINDOW_MS:
        return grid_instant
    return None


@dataclass(frozen=True)
class StampedOpenInterest:
    """One admitted reading, placed at grid instant `grid_instant_ms` (epoch ms, UTC).

    `grid_instant_ms` is the `T` of `SPEC-009` §6.1 — the instant the value is AT, which the
    catalog of `T-03.3` records as `POINT_AT_BUCKET_END` (the close of `[T - 1 min, T)`).
    `event_time_ms` is kept beside it so the admission is auditable row by row.
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
                f"event_time_ms {self.event_time_ms} is outside [T, T + "
                f"{OPEN_INTEREST_ADMISSION_WINDOW_MS} ms] for T = {self.grid_instant_ms}: "
                "a reading can only be stamped on the minute it was admitted into"
            )


@dataclass(frozen=True)
class OpenInterestStamping:
    """Every input reading, sorted into exactly one of three fates, in input order.

    - `admitted`: the first in-window reading of its `(symbol, T)` — the only rows that exist;
    - `out_of_window`: readings whose `time` falls in no minute's window (their minute is absent);
    - `superseded`: in-window readings of a `(symbol, T)` an earlier call already took.

    Nothing is invented: `admitted` never holds a minute without its own reading, and the three
    tuples together account for every input exactly once.
    """

    admitted: tuple[StampedOpenInterest, ...]
    out_of_window: tuple[OpenInterestSnapshot, ...]
    superseded: tuple[OpenInterestSnapshot, ...]


def stamp_open_interest_readings(
    readings: Iterable[OpenInterestSnapshot],
) -> OpenInterestStamping:
    """Stamp readings, given in CALL order, on the 1-minute grid (`SPEC-009` §6.1, `RN-2`).

    A minute with no admitted reading is simply not in `admitted`; it is never filled from a
    neighbour.
    """
    admitted: list[StampedOpenInterest] = []
    out_of_window: list[OpenInterestSnapshot] = []
    superseded: list[OpenInterestSnapshot] = []
    taken: set[tuple[str, int]] = set()
    for reading in readings:
        grid_instant = admitted_grid_instant(reading.event_time_ms)
        if grid_instant is None:
            out_of_window.append(reading)
            continue
        slot = (reading.symbol, grid_instant)
        if slot in taken:
            superseded.append(reading)
            continue
        taken.add(slot)
        admitted.append(
            StampedOpenInterest(
                symbol=reading.symbol,
                grid_instant_ms=grid_instant,
                open_interest_raw=reading.open_interest_raw,
                event_time_ms=reading.event_time_ms,
            )
        )
    return OpenInterestStamping(
        admitted=tuple(admitted),
        out_of_window=tuple(out_of_window),
        superseded=tuple(superseded),
    )
