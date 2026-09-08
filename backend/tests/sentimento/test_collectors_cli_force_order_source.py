"""`_default_force_order_source`: combined per-symbol stream, never `!forceOrder@arr`.

`docs/context/captura-em-producao/handoff/forceorder-arr-crash-loop.md` measured `!forceOrder@arr`
delivering ZERO events to the production host across >300s combined (including a guaranteed
1msg/s control stream that also silenced), while a per-symbol combined stream on the SAME host
connected and delivered immediately. `docs/context/captura-em-producao/gates/
forceorder-fix-quant-architect.md` is the decision this test pins: the LIVE collector's default
source must build the `/stream?streams=<symbol>@forceOrder/...` path for the declared
`INITIAL_SYMBOLS` universe.

`ADR-004` Emenda D5 (2026-09-08) split what used to be ONE socket timeout
(`_FORCE_ORDER_READ_TIMEOUT_S`, 900s) doing two jobs into TWO numbers: the socket's own
`settimeout()` — `_FORCE_ORDER_RECV_GRANULARITY_S`, small, a read granularity, never a verdict —
and `idle_timeout_s=_FORCE_ORDER_IDLE_TIMEOUT_S`, the accumulated-silence threshold that actually
declares the connection dead, passed to `WebSocketMessageSource` directly (not through
`connect_tls`).
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.binance_stream_probe import (
    BINANCE_FUTURES_STREAM_HOST,
    ByteChannel,
)


class _RecordingWebSocketMessageSource:
    """Stand-in for `WebSocketMessageSource` that only remembers the constructor arguments."""

    last_host: str | None = None
    last_path: str | None = None
    last_connect: Callable[[], ByteChannel] | None = None
    last_idle_timeout_s: float | None = None

    def __init__(
        self,
        host: str,
        path: str,
        connect: Callable[[], ByteChannel],
        *,
        idle_timeout_s: float | None = None,
    ) -> None:
        """Record what this source was built with; never opens a real socket."""
        type(self).last_host = host
        type(self).last_path = path
        type(self).last_connect = connect
        type(self).last_idle_timeout_s = idle_timeout_s


def _fake_connect_tls(host: str, timeout: float = 10.0) -> ByteChannel:
    """Stand-in for `connect_tls`: records the call, raises so no real socket is ever touched."""
    raise AssertionError(f"connect_tls called with host={host!r} timeout={timeout!r}")


def test_default_source_targets_the_combined_per_symbol_stream_not_forceorder_arr(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The path built is `/stream?streams=...@forceOrder/...` over `INITIAL_SYMBOLS`, sorted."""
    monkeypatch.setattr(collectors_cli, "WebSocketMessageSource", _RecordingWebSocketMessageSource)

    collectors_cli._default_force_order_source()

    assert _RecordingWebSocketMessageSource.last_host == BINANCE_FUTURES_STREAM_HOST
    assert _RecordingWebSocketMessageSource.last_path == (
        "/stream?streams=btcusdt@forceOrder/ethusdt@forceOrder/linkusdt@forceOrder/"
        "solusdt@forceOrder"
    )
    assert "!forceOrder@arr" not in (_RecordingWebSocketMessageSource.last_path or "")


def test_default_source_opens_with_the_small_granularity_not_the_probes_10s_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The injected `connect` callable calls `connect_tls` with `_FORCE_ORDER_RECV_GRANULARITY_S`.

    `ADR-004` Emenda D5: the socket's OWN `settimeout()` is a small read granularity now, never
    the 900s that used to double as the life-or-death verdict. `connect_tls` itself is
    monkeypatched to RAISE instead of opening a real socket — the assertion is on the call
    arguments captured in the raised message, never on live network I/O
    (`backend/scripts/test.sh`'s "ZERO REDE" contract).
    """
    monkeypatch.setattr(collectors_cli, "WebSocketMessageSource", _RecordingWebSocketMessageSource)
    monkeypatch.setattr(collectors_cli, "connect_tls", _fake_connect_tls)

    collectors_cli._default_force_order_source()
    connect = _RecordingWebSocketMessageSource.last_connect
    assert connect is not None

    with pytest.raises(
        AssertionError,
        match=rf"timeout={collectors_cli._FORCE_ORDER_RECV_GRANULARITY_S}",
    ):
        connect()


def test_default_source_carries_the_d5_idle_timeout_not_the_old_single_number(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`idle_timeout_s` reaching `WebSocketMessageSource` is `_FORCE_ORDER_IDLE_TIMEOUT_S`.

    That's the accumulated-silence threshold, DISTINCT from the read granularity above
    (`ADR-004` D5: two numbers, two jobs, never the one 900s constant doing both).
    """
    monkeypatch.setattr(collectors_cli, "WebSocketMessageSource", _RecordingWebSocketMessageSource)

    collectors_cli._default_force_order_source()

    assert (
        _RecordingWebSocketMessageSource.last_idle_timeout_s
        == collectors_cli._FORCE_ORDER_IDLE_TIMEOUT_S
    )
