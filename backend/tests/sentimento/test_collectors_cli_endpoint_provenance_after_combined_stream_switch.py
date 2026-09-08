"""QA falsifier for `8ad9f89`: `IngestRun.endpoint` still names `!forceOrder@arr`.

The LIVE collector stopped connecting there.
`docs/context/captura-em-producao/gates/forceorder-fix-quant-architect.md` §1 states, and
`_default_force_order_source` (`collectors_cli.py`) implements, that the LIVE collector's default
source is now `/stream?streams=<symbol>@forceOrder/...` — NEVER `/ws/!forceOrder@arr`. But
`_run_force_order_collector` stamps every recorded `IngestRun` (`collector_run_mapping.py:80`)
and every `collector_session_closed` log line (`collectors_cli.py:552,554,568`) with the SAME
module-level `FORCE_ORDER_ENDPOINT = "!forceOrder@arr"` constant regardless of which source
`open_source` actually opened — the constant is not derived from, or even aware of, the source
the fix just switched. `test_collectors_cli_publish_failure.py:184` already pins the OLD
(now-false) expectation directly: `assert recorded[0].endpoint == FORCE_ORDER_ENDPOINT`.

Why this is not cosmetic: `collector_status.py` groups `IngestRun`s by `(source, endpoint)` into
the series label an operator reads to confirm the fix (`ADR-030`) — after this fix ships, every
run recorded by the LIVE collector keeps that dashboard claiming `!forceOrder@arr`, the exact
endpoint this fix moved away from because it silently delivered zero events. An operator (or a
future on-call engineer reading `collector_session_closed !forceOrder@arr: ...` on a NEW failure)
has no way to tell, from this provenance, that the collector is no longer the one this incident
was about.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterable, Iterator
from typing import Any, cast

import pytest

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.redis_stream_series_sink import RedisStreamSeriesSink
from src.modules.sentimento.use_cases.collector_run_mapping import FORCE_ORDER_ENDPOINT
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import MessageSource

# One raw `forceOrder` frame in the COMBINED-STREAM envelope shape — what
# `_default_force_order_source`'s real connection actually receives per
# `test_force_order_natural_key_envelope.py`.
_COMBINED_ENVELOPE_FRAME = (
    '{"stream":"btcusdt@forceOrder","data":{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT",'
    '"S":"SELL","o":"LIMIT","f":"IOC","q":"0.010","p":"78000.00","ap":"78006.30","X":"FILLED",'
    '"l":"0.010","z":"0.010","T":0}}}'
)


def _row(**overrides: Any) -> SeriesRow:
    """Build one valid market-series row — mirrors the other `collectors_cli` test files."""
    columns: dict[str, Any] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_force_order",
        "bucket_end": 1_787_443_499_999,
        "event_time": 1_787_443_500_000,
        "available_at": 1_787_443_530_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": 1_787_443_545_000,
        "observed_at": 1_787_443_546_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "forceOrder",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
    }
    columns.update(overrides)
    return SeriesRow(**columns)


class _FakeCombinedStreamSource:
    """Stands in for the REAL `WebSocketMessageSource` `_default_force_order_source` builds.

    Never opens a socket — `.open()`/`_connect` is never invoked — but is otherwise a working
    `MessageSource`: yields one combined-envelope frame, then blocks until `.close()`, exactly
    like `test_collectors_cli_publish_failure.py`'s `_OneFrameThenIdleSource`.
    """

    def __init__(
        self,
        host: str,
        path: str,
        connect: Callable[[], object],
        *,
        idle_timeout_s: float | None = None,
    ) -> None:
        """Record the combined-stream path this source was actually built with.

        `idle_timeout_s` (`ADR-004` Emenda D5) is accepted and ignored — this fake has no idle
        clock of its own, it only stands in for the constructor shape `_default_force_order_
        source` calls.
        """
        self.path = path
        self._closed = threading.Event()

    def open(self) -> None:
        """No transport to open — this fake has none, and never calls the injected `connect`."""

    def close(self) -> None:
        """Unblock the idling reader below."""
        self._closed.set()

    def messages(self) -> Iterator[str]:
        """Yield the one scripted combined-envelope frame, then idle until closed."""
        yield _COMBINED_ENVELOPE_FRAME
        while not self._closed.wait(0.05):
            pass
        raise StopIteration


class _RecordingSink:
    """Duck-typed stand-in for `RedisStreamSeriesSink`.

    `_run_force_order_collector` only calls `.accept(row)`, so a real Redis connection is not
    needed to observe the recorded `IngestRun`.
    """

    def __init__(self) -> None:
        """Start with no rows accepted."""
        self.accepted: list[SeriesRow] = []

    def accept(self, row: SeriesRow) -> None:
        """Record the row; never raises, so the session closes ACCEPTED."""
        self.accepted.append(row)


def test_recorded_endpoint_still_claims_forceorder_arr_after_the_live_source_moved_off_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Falsifier: `IngestRun.endpoint` must describe what was ACTUALLY connected.

    Uses the REAL `_default_force_order_source` (with `WebSocketMessageSource` swapped for the
    fake above, so no socket ever opens) as `open_source` — the exact composition `run()` wires
    for the LIVE collector since `8ad9f89`. The fake source's `.path` proves the connection is the
    combined per-symbol stream, never `!forceOrder@arr`. `stop_event` is pre-set so the read loop
    closes cleanly after the one frame `messages()` yields, instead of blocking on the fake's
    idle-until-closed tail (mirrors the SIGTERM path, never touched by this test).

    This SHOULD fail today: `_run_force_order_collector` stamps `FORCE_ORDER_ENDPOINT` regardless
    of `open_source`, so `recorded[0].endpoint` names an endpoint this run never connected to.
    """
    monkeypatch.setattr(collectors_cli, "WebSocketMessageSource", _FakeCombinedStreamSource)

    # `_default_force_order_source` is the REAL production composition — same function
    # `run()` wires as `force_order_source_factory`'s default since this fix.
    opened_source = collectors_cli._default_force_order_source()
    assert isinstance(opened_source, _FakeCombinedStreamSource)
    assert "forceOrder" in opened_source.path and "!forceOrder@arr" not in opened_source.path

    stop_event = threading.Event()
    stop_event.set()  # closes the read loop right after the first frame, never idles
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []
    source_holder: list[MessageSource | None] = [None]
    sink = _RecordingSink()

    def _to_rows(_received_at: int, _observation: ForceOrderKeyObservation) -> Iterable[SeriesRow]:
        return (_row(),)

    collectors_cli._run_force_order_collector(
        stop_event=stop_event,
        failure_event=failure_event,
        exit_code=exit_code,
        open_source=lambda: opened_source,
        sink=cast(RedisStreamSeriesSink, sink),
        to_rows=_to_rows,
        record_run=recorded.append,
        source_holder=source_holder,
    )

    assert len(recorded) == 1, f"expected exactly one IngestRun recorded, got {len(recorded)}"
    assert recorded[0].endpoint != FORCE_ORDER_ENDPOINT, (
        "IngestRun.endpoint == "
        f"{recorded[0].endpoint!r} (FORCE_ORDER_ENDPOINT) even though the source actually opened "
        f"was the combined per-symbol stream at {opened_source.path!r} — the recorded provenance "
        "and the collector_status.py dashboard it feeds (ADR-030) still claim !forceOrder@arr for "
        "a collector that no longer connects there since 8ad9f89."
    )
