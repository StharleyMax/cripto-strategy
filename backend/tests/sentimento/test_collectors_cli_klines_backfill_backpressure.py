"""`T-05.3`: the collector's boot backfill must not publish into the stream's trimmer.

The defect, measured on the local stack (`docs/context/paineis-de-fluxo/gates/T-05.3-build.md`):
the boot walk published `241.902` stream entries in ~26 s into a stream capped by
`XADD MAXLEN ~ 100.000`, the trim dropped what the writer had not read, and `BTCUSDT` — walked
FIRST — kept `1.248` of its `60.480` rows. Every restart re-read seven days and the minutes the
process had been down for stayed holes.

`CappedStream` (`tests/helpers/drain_gate_doubles.py`) models exactly that property, so the
first two tests are the defect and its fix side by side, against the REAL
`_run_klines_collector`. No socket is opened (`backend/scripts/test.sh`'s "ZERO REDE").
"""

from __future__ import annotations

import logging
import threading

import pytest

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.binance_klines_client import (
    MAX_LIMIT,
    KlineRow,
    KlinesPageResponse,
)
from src.modules.sentimento.infra.collectors_cli import (
    BackfillDrainGate,
    _catch_up_cursor,
    _run_klines_collector,
    default_klines_drain_gate,
    resolve_boot_config,
)
from src.modules.sentimento.infra.redis_resp_client import RedisCommandError, RespValue
from src.modules.sentimento.infra.redis_stream_backpressure import (
    StreamDrainGate,
    lag_ceiling_for,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    KLINES_BUCKET_WIDTH_MS,
    build_klines_to_rows,
)
from tests.helpers.drain_gate_doubles import CappedStream, OpenGate

_W = KLINES_BUCKET_WIDTH_MS
_T0 = 1_788_000_000_000
_SYMBOL = "BTCUSDT"
_ROWS_PER_BAR = 6
_STREAM = "md.series.write"
_GROUP = "single_writer"


def _kline(open_time_ms: int) -> KlineRow:
    """One real, CLOSED 12-field `KlineRow` at `open_time_ms`."""
    return KlineRow(
        raw=(
            open_time_ms,
            "100.0",
            "101.0",
            "99.0",
            "100.5",
            "10.5",
            open_time_ms + _W - 1,
            "1000.0",
            7,
            "5.0",
            "500.0",
            "0",
        )
    )


def _bars(first_open_ms: int, count: int) -> tuple[KlineRow, ...]:
    """`count` consecutive one-minute bars starting at `first_open_ms`."""
    return tuple(_kline(first_open_ms + i * _W) for i in range(count))


class _PagedClient:
    """Answers the scripted pages in order (the last repeats), recording each call."""

    def __init__(self, pages: list[tuple[KlineRow, ...]]) -> None:
        """Bind the pages, in the order the walk will ask for them."""
        self._pages = pages
        self.calls: list[tuple[int, int | None]] = []

    def klines(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        """Record `(limit, start_time_ms)` and answer the next page."""
        self.calls.append((limit, start_time_ms))
        rows = self._pages[min(len(self.calls) - 1, len(self._pages) - 1)]
        return KlinesPageResponse(status=200, api_code=None, rows=rows)


def _drive(
    client: _PagedClient,
    sink: object,
    gate: BackfillDrainGate,
    *,
    passes: int = 1,
) -> list[IngestRun]:
    """Run the real `_run_klines_collector` for `passes` passes, then stop it."""
    stop = threading.Event()
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        if len(runs) == passes:
            stop.set()

    _run_klines_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        client=client,
        sink=sink,  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=_record,
        symbols=(_SYMBOL,),
        interval_s=0.01,
        backfill_days=7,
        drain_gate=gate,
    )
    return runs


def _four_full_pages_and_a_short_one() -> list[tuple[KlineRow, ...]]:
    """`4 x 1.500 + 10` bars — `36.060` stream entries, three times a `12.000` cap."""
    full = [_bars(_T0 + k * MAX_LIMIT * _W, MAX_LIMIT) for k in range(4)]
    return [*full, _bars(_T0 + 4 * MAX_LIMIT * _W, 10)]


# ── THE DEFECT AND THE FIX, SIDE BY SIDE ────────────────────────────────────────────────────

_CAP = 12_000  # one page (9.000 entries) plus the ceiling (2.400) fits; three walks' worth do not


def test_the_boot_backfill_waits_for_the_writer_so_the_capped_stream_trims_nothing() -> None:
    """Every walked bar reaches the writer: `0` entries trimmed unread, `6.010` buckets written.

    Morde: delete the `drain_gate.wait(stop_event)` line in `_collect_klines_for_symbol` and the
    walk publishes `36.060` entries into a `12.000` cap with nothing draining — `24.060` are
    trimmed and the first pages' buckets never reach the writer, which is the `BTCUSDT` shape
    measured at the boot of `2026-10-01T20:11Z`.
    """
    stream = CappedStream(max_len=_CAP, drain_per_poll=500)
    pages = _four_full_pages_and_a_short_one()

    _drive(_PagedClient(pages), stream, stream.gate(lag_ceiling_for(_CAP)))
    stream.drain_all()

    expected_bars = sum(len(page) for page in pages)
    assert stream.trimmed_unread == 0
    assert len({row.bucket_end for row in stream.written}) == expected_bars == 6_010
    assert len(stream.written) == expected_bars * _ROWS_PER_BAR


def test_without_waiting_the_same_walk_loses_rows_to_the_trim_and_says_nothing() -> None:
    """The control: the same walk through a gate that never waits trims what was not read.

    This is the ablation kept as a test, so `CappedStream` is proven able to tell the two
    behaviours apart instead of being green for both. It also pins WHICH rows are lost: the
    OLDEST — the first symbol's, the first days' — exactly as `BTCUSDT` was.
    """
    stream = CappedStream(max_len=_CAP, drain_per_poll=500)
    pages = _four_full_pages_and_a_short_one()

    _drive(_PagedClient(pages), stream, OpenGate())
    stream.drain_all()

    published = sum(len(page) for page in pages) * _ROWS_PER_BAR
    assert stream.trimmed_unread == published - _CAP == 24_060
    oldest_written = min(row.bucket_end for row in stream.written)
    assert oldest_written > _T0 + _W, "the trim ate the head of the walk, not its tail"


# ── THE CYCLE AFTER A SLOW BOOT: IT WALKS FROM THE WATERMARK ───────────────────────────────


def test_a_cycle_behind_its_watermark_walks_from_it_instead_of_asking_for_the_tail() -> None:
    """A watermark older than the tail window makes the next cycle page from `watermark + 1`.

    Waiting for the writer makes the boot pass slow — minutes per symbol — so by the time the
    LAST symbol is walked, the FIRST one's newest bars have closed unread. A tail of two or
    three bars cannot reach back to them. Morde: make `_catch_up_cursor` return `None` and the
    second call asks for the tail (`start_time_ms=None`), leaving every minute in between as a
    permanent hole.
    """
    client = _PagedClient([_bars(_T0, 1)])

    _drive(client, CappedStream(max_len=10**6, drain_per_poll=1), OpenGate(), passes=2)

    assert client.calls[0][1] is not None, "the boot pass walks from a startTime"
    assert client.calls[1] == (MAX_LIMIT, _T0 + _W), "the cycle resumes ONE bar past the mark"


def test_the_tail_cycle_never_probes_the_writer() -> None:
    """Only WALKED pages wait; a caught-up cycle is one cheap call and no `XINFO GROUPS`.

    Cala: three bars a minute is not a burst, and a probe per cycle would be load for nothing.
    """
    now_ms = int(collectors_cli._epoch_ms())
    last_closed_open = now_ms - now_ms % _W - _W
    client = _PagedClient([_bars(last_closed_open, 1)])
    gate = OpenGate()

    _drive(client, CappedStream(max_len=10**6, drain_per_poll=1), gate, passes=2)

    assert client.calls[1][1] is None, "a caught-up cycle asks for the tail"
    assert gate.waits == 1, "the boot page waited once; the tail cycle did not wait at all"


_NOW = _T0 + 10 * _W + 20_000  # twenty seconds into the minute that opened at `_T0 + 10W`
_CURRENT_OPEN = _T0 + 10 * _W


@pytest.mark.parametrize(
    ("seen_open_ms", "expected"),
    [
        (None, None),
        (_CURRENT_OPEN - _W, None),  # steady state: the bar that just closed was published
        (_CURRENT_OPEN - 3 * _W, None),  # next bar is the OLDEST the tail returns: still covered
        (_CURRENT_OPEN - 4 * _W, _CURRENT_OPEN - 3 * _W),  # one bar beyond the tail: walk
        (_T0, _T0 + _W),  # far behind: walk from one bar past the watermark
    ],
)
def test_catch_up_cursor_walks_exactly_when_the_tail_cannot_reach_the_watermark(
    seen_open_ms: int | None, expected: int | None
) -> None:
    """With `tail_limit = 3` the tail covers the current open and the two before it.

    The boundary row is the one that matters: one bar more and a minute is skipped forever,
    one bar less and every cycle pays a 1.500-bar call for nothing.
    """
    assert _catch_up_cursor(seen_open_ms, 3, _NOW) == expected


# ── THE REAL GATE, OVER A SCRIPTED `XINFO GROUPS` ───────────────────────────────────────────


class _ScriptExhaustedError(AssertionError):
    """The gate probed past the end of the script — it would have waited forever."""


class _ScriptedConnection:
    """A `RespConnection` stand-in: answers each `XINFO GROUPS` from a script, recording it.

    It RAISES once the script runs out instead of repeating the last reply. A gate is a loop
    without a timeout by design, so a mutation that makes it wait on the wrong thing must fail
    the test, not hang the suite.
    """

    def __init__(self, replies: list[RespValue | Exception]) -> None:
        """Bind the replies in order."""
        self._replies = replies
        self.commands: list[tuple[object, ...]] = []

    def command(self, *args: object) -> RespValue:
        """Record the command and answer (or raise) the next scripted reply."""
        self.commands.append(args)
        if len(self.commands) > len(self._replies):
            raise _ScriptExhaustedError(f"probe #{len(self.commands)} has no scripted reply")
        reply = self._replies[len(self.commands) - 1]
        if isinstance(reply, Exception):
            raise reply
        return reply


def _groups(lag: int, group: str = _GROUP) -> RespValue:
    """Return the RESP2 shape `XINFO GROUPS` answers: one flat field/value array per group."""
    return [[b"name", group.encode("utf-8"), b"consumers", 1, b"pending", 0, b"lag", lag]]


def _gate(connection: _ScriptedConnection, opened: list[int], max_lag: int = 10) -> StreamDrainGate:
    """Build a real `StreamDrainGate` whose lazily opened connection is `connection`."""

    def _open() -> _ScriptedConnection:
        opened.append(1)
        return connection

    return StreamDrainGate(
        open_connection=_open,  # type: ignore[arg-type]
        stream=_STREAM,
        group=_GROUP,
        max_lag=max_lag,
        endpoint="/fapi/v1/klines",
        poll_interval_s=0.0,
    )


def test_the_gate_waits_until_the_lag_falls_to_the_ceiling_and_logs_each_wait(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """`50 -> 30 -> 5` against a ceiling of `10`: two logged waits, then it answers `5`."""
    connection = _ScriptedConnection([_groups(50), _groups(30), _groups(5)])
    opened: list[int] = []
    gate = _gate(connection, opened)
    assert opened == [], "no socket before the first wait — a boot with nothing to walk opens none"

    with caplog.at_level(logging.INFO):
        assert gate.wait(threading.Event()) == 5

    assert opened == [1]
    assert connection.commands == [("XINFO", "GROUPS", _STREAM)] * 3
    waits = [r for r in caplog.records if r.getMessage() == "backfill_waiting_for_writer"]
    assert [getattr(r, "lag", None) for r in waits] == [50, 30]


def test_a_group_or_stream_that_does_not_exist_yet_is_waited_for_not_crashed_on() -> None:
    """The writer creates the group with `MKSTREAM`; compose does not order the collector after it.

    Morde: let `RedisCommandError` (`ERR no such key`) or `StreamGroupMissingError` escape and a
    fresh stack's collector dies on its first walked page.
    """
    connection = _ScriptedConnection(
        [RedisCommandError("ERR no such key"), _groups(0, group="someone_else"), _groups(3)]
    )
    assert _gate(connection, []).wait(threading.Event()) == 3
    assert len(connection.commands) == 3


def test_a_set_stop_event_ends_the_wait_without_publishing() -> None:
    """`SIGTERM` during a stalled writer must not leave the thread waiting forever."""
    stop = threading.Event()
    stop.set()
    connection = _ScriptedConnection([_groups(10_000)])
    assert _gate(connection, []).wait(stop) is None


def test_the_ceiling_is_a_fifth_of_the_configured_cap_and_never_zero() -> None:
    """`100.000 -> 20.000`, the number `klines_backfill_cli` always used; a tiny cap still waits."""
    assert lag_ceiling_for(100_000) == 20_000
    assert lag_ceiling_for(12_000) == 2_400
    assert lag_ceiling_for(3) == 1


def test_the_production_gate_watches_the_configured_stream_and_group_on_its_own_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`run()`'s default: stream and group from the environment, ceiling derived from the cap.

    Morde: probe `single_writer` regardless of `REDIS_STREAM_GROUP` and an operator who renames
    the group gets a gate that waits forever on a group nobody consumes; reuse the sink's
    `connection` and the probe joins the seven-thread race `StreamDrainGate` documents.
    """
    connection = _ScriptedConnection([_groups(20_001, group="custom"), _groups(20_000, "custom")])
    opened: list[object] = []

    def _connect(config: object, open_socket: object = None) -> _ScriptedConnection:
        opened.append(config)
        return connection

    monkeypatch.setattr(collectors_cli, "connect_redis", _connect)
    config = resolve_boot_config({"REDIS_STREAM": "custom.stream", "REDIS_STREAM_GROUP": "custom"})

    gate = default_klines_drain_gate(config)
    assert opened == [], "built at boot, connected only when a walked page has rows"
    assert gate.wait(threading.Event()) == 20_000

    assert opened == [config], "its OWN connection, opened from the boot config"
    assert connection.commands == [("XINFO", "GROUPS", "custom.stream")] * 2


def test_the_boot_config_defaults_the_group_to_the_single_writers() -> None:
    """Unset `REDIS_STREAM_GROUP` means the group `single_writer_cli` joins by default."""
    assert resolve_boot_config({}).redis_stream_group == "single_writer"
