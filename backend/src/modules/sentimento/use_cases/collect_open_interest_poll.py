"""Settle one `/fapi/v1/openInterest` poll cycle: every call gets one fate, and a row or none."""

# `T-03.4` (`SPEC-009` §6.1/§6.7, plan `03` trail `03a`) composes three pieces that already exist —
# the client of `T-03.1`, the stamp of `T-03.2` (as corrected by `[Q-STAMP-1]`,
# `docs/context/paineis-de-fluxo/handoff/Q-STAMP-1-quant-architect.md`) and the writer's stream —
# into a collector. The loop, the clock and the sink live in `infra/collectors_cli.py`; THIS module
# is the part of a cycle that needs none of them: given what each call returned and when, decide
# which readings become rows, and account for every call that did not.
#
# Why it is its own module and not three lines inside the loop: `ADR-016/D4` forbids `use_cases`
# from reading a clock (`make natureza`), so the instants (`sent_at_ms`, `received_at_ms`) come IN
# as values, already read by the composition root — which is what lets the suite pin every fate
# below with literal instants instead of a sleeping test.
#
# ── FIVE FATES, CLOSED, AND THEY ADD UP TO THE CALLS ──────────────────────────────────────────
#
#   * `admitted`         — the freshest reading of its `(symbol, T)` inside `[T - 20 s, T]`: a row;
#   * `out_of_window`    — a reading whose `time` falls in no minute's window: that minute is ABSENT
#                          (`RN-2`), never filled with a neighbour;
#   * `superseded`       — an in-window reading a fresher one of the same `(symbol, T)` took;
#   * `behind_watermark` — an admitted reading for a minute at or before the newest one this
#                          process already WROTE for the symbol: it is not written twice (the
#                          cross-cycle twin of `superseded`, reachable only when a cycle's calls
#                          run ~45 s late), and it cannot rewrite the past;
#   * `not_read`         — the call ended in `TRANSPORT`/`HTTP_STATUS`/`PAYLOAD`: no reading exists.
#
# The first three are `stamp_open_interest_readings`' own verdict, honoured rather than re-derived.
# `len(calls) == ` the number of fetches handed in, always — no call is dropped from the account.
#
# ── WHAT EACH CALL CARRIES, BECAUSE THE VERDICT ASKS FOR IT (`Q-STAMP-1` §3, item 3) ─────────
#
# `lag_ms = sent_at - time` for every reading, and `staleness_ms = T - time` for every admitted one.
# They are what lets the owner check the envelope in production without trusting the verdict's
# file: a `p5` of `lag_ms` below zero is a local clock running behind Binance's, and an admitted
# row with `staleness_ms` outside `[0, 20 000]` is impossible by construction.

from __future__ import annotations

import hashlib
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from enum import Enum

from src.modules.sentimento.domain.open_interest_grid_stamp import (
    StampedOpenInterest,
    stamp_open_interest_readings,
)
from src.modules.sentimento.domain.open_interest_snapshot import (
    OpenInterestFetch,
    OpenInterestFetchOutcome,
    OpenInterestSnapshot,
)
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.use_cases.collector_series_mapping import OpenInterestPollToRows


class OpenInterestPollFate(Enum):
    """Where one call of a cycle ended — the closed vocabulary of the per-call log line."""

    ADMITTED = "admitted"
    OUT_OF_WINDOW = "out_of_window"
    SUPERSEDED = "superseded"
    BEHIND_WATERMARK = "behind_watermark"
    NOT_READ = "not_read"


@dataclass(frozen=True)
class TimedOpenInterestFetch:
    """One call's outcome, with the two instants THIS process read around it (epoch ms).

    `sent_at_ms` is read just before the request, `received_at_ms` just after the answer. Neither
    is ever the reading's instant — that is the response's `time`, inside the snapshot.
    """

    fetch: OpenInterestFetch
    sent_at_ms: int
    received_at_ms: int


@dataclass(frozen=True)
class OpenInterestPollCall:
    """The account of one call: its fate and the numbers the per-call log line prints."""

    symbol: str
    outcome: OpenInterestFetchOutcome
    fate: OpenInterestPollFate
    status: int | None
    """The HTTP status of the answer; `None` for a `TRANSPORT` failure (nothing answered)."""

    event_time_ms: int | None
    """The response's `time`; `None` when nothing was read."""

    grid_instant_ms: int | None
    """The `T` the reading was stamped on; set only for `admitted` and `behind_watermark`."""

    lag_ms: int | None
    """`sent_at_ms - event_time_ms`, for every reading; `None` when nothing was read."""

    staleness_ms: int | None
    """`grid_instant_ms - event_time_ms`, set only for `admitted`: always in `[0, 20 000]`."""

    weight_used: int | None
    """The `x-mbx-used-weight-1m` this answer carried, READ; `None` when absent."""

    failure: str | None
    """Why nothing was read, for `not_read`; `None` otherwise."""


@dataclass(frozen=True)
class OpenInterestPollSettlement:
    """One settled cycle: the per-call account, in call order, and the rows to publish."""

    calls: tuple[OpenInterestPollCall, ...]
    rows: tuple[SeriesRow, ...]
    src_sha256: str
    """`sha256` over every reading read, in call order (`symbol|openInterest|time` per line)."""

    @property
    def n_calls(self) -> int:
        """How many calls the cycle made — the collector's own weight share (`DoD-2`)."""
        return len(self.calls)

    @property
    def n_read(self) -> int:
        """How many calls came back as a reading."""
        return sum(1 for call in self.calls if call.outcome is OpenInterestFetchOutcome.READ)

    @property
    def n_admitted(self) -> int:
        """How many readings became rows' stamps (before the four-symbol filter of the mapping)."""
        return sum(1 for call in self.calls if call.fate is OpenInterestPollFate.ADMITTED)

    @property
    def weight_used(self) -> int | None:
        """The largest used weight READ in the cycle; `None` when no answer carried the header."""
        readable = [call.weight_used for call in self.calls if call.weight_used is not None]
        return max(readable) if readable else None

    @property
    def api_code(self) -> int | None:
        """The first non-`200` HTTP status the source answered; `None` when there was none."""
        for call in self.calls:
            if call.outcome is OpenInterestFetchOutcome.HTTP_STATUS:
                return call.status
        return None

    @property
    def shortfall_notes(self) -> str | None:
        """`symbol: fate` for every call that did not become a row; `None` when all did."""
        missing = [
            f"{call.symbol}: {call.fate.value}"
            + (f" ({call.failure})" if call.failure is not None else "")
            for call in self.calls
            if call.fate is not OpenInterestPollFate.ADMITTED
        ]
        return "; ".join(missing) if missing else None


def _unread_call(timed: TimedOpenInterestFetch) -> OpenInterestPollCall:
    """Account a call that ended without a reading."""
    fetch = timed.fetch
    return OpenInterestPollCall(
        symbol=fetch.symbol,
        outcome=fetch.outcome,
        fate=OpenInterestPollFate.NOT_READ,
        status=fetch.status,
        event_time_ms=None,
        grid_instant_ms=None,
        lag_ms=None,
        staleness_ms=None,
        weight_used=fetch.weight_used,
        failure=fetch.failure,
    )


def settle_open_interest_poll_cycle(
    fetches: Sequence[TimedOpenInterestFetch],
    newest_written: Mapping[str, int],
    to_rows: OpenInterestPollToRows,
) -> OpenInterestPollSettlement:
    """Sort every call of one cycle into one fate and build the rows of the admitted ones.

    `newest_written` is the collector's watermark — `{symbol: newest grid instant already
    written by this process}` — read, never mutated: the caller advances it only AFTER the rows
    were published, so a publish that fails leaves the watermark where it was.

    Stamping is done over the whole cycle at once, so "freshest wins" is decided among every
    reading of a `(symbol, T)` the cycle holds, whatever order the calls ran in.
    """
    snapshots: list[OpenInterestSnapshot] = [
        timed.fetch.snapshot for timed in fetches if timed.fetch.snapshot is not None
    ]
    stamping = stamp_open_interest_readings(snapshots)
    out_of_window = {id(snapshot) for snapshot in stamping.out_of_window}
    superseded = {id(snapshot) for snapshot in stamping.superseded}
    admitted_in_order = iter(stamping.admitted)

    digest = hashlib.sha256()
    calls: list[OpenInterestPollCall] = []
    rows: list[SeriesRow] = []
    for timed in fetches:
        snapshot = timed.fetch.snapshot
        if snapshot is None:
            calls.append(_unread_call(timed))
            continue
        digest.update(
            f"{snapshot.symbol}|{snapshot.open_interest_raw}|{snapshot.event_time_ms}\n".encode()
        )
        lag_ms = timed.sent_at_ms - snapshot.event_time_ms
        if id(snapshot) in out_of_window:
            fate, stamped = OpenInterestPollFate.OUT_OF_WINDOW, None
        elif id(snapshot) in superseded:
            fate, stamped = OpenInterestPollFate.SUPERSEDED, None
        else:
            stamped = _next_admitted(admitted_in_order, snapshot)
            watermark = newest_written.get(snapshot.symbol)
            behind = watermark is not None and stamped.grid_instant_ms <= watermark
            fate = (
                OpenInterestPollFate.BEHIND_WATERMARK if behind else OpenInterestPollFate.ADMITTED
            )
            if not behind:
                rows.extend(to_rows(timed.received_at_ms, stamped))
        calls.append(
            OpenInterestPollCall(
                symbol=snapshot.symbol,
                outcome=timed.fetch.outcome,
                fate=fate,
                status=timed.fetch.status,
                event_time_ms=snapshot.event_time_ms,
                grid_instant_ms=None if stamped is None else stamped.grid_instant_ms,
                lag_ms=lag_ms,
                staleness_ms=(
                    stamped.grid_instant_ms - snapshot.event_time_ms
                    if stamped is not None and fate is OpenInterestPollFate.ADMITTED
                    else None
                ),
                weight_used=timed.fetch.weight_used,
                failure=None,
            )
        )
    return OpenInterestPollSettlement(
        calls=tuple(calls), rows=tuple(rows), src_sha256=digest.hexdigest()
    )


def _next_admitted(
    admitted_in_order: Iterator[StampedOpenInterest], snapshot: OpenInterestSnapshot
) -> StampedOpenInterest:
    """Take the next admitted stamp, refusing one that is not this very reading's.

    `stamp_open_interest_readings` returns `admitted` in input order, so the k-th reading that is
    neither out of window nor superseded IS the k-th admitted stamp. The check turns a future
    change of that ordering into a loud error instead of a row stamped with a neighbour's value.
    """
    stamped = next(admitted_in_order)
    if (stamped.symbol, stamped.event_time_ms, stamped.open_interest_raw) != (
        snapshot.symbol,
        snapshot.event_time_ms,
        snapshot.open_interest_raw,
    ):
        raise ValueError(
            f"admitted stamp {stamped!r} does not belong to reading {snapshot!r}: the stamping "
            "no longer returns admitted readings in input order"
        )
    return stamped
