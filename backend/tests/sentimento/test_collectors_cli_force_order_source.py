"""`_default_force_order_source`: combined per-symbol stream, never `!forceOrder@arr`.

`docs/context/captura-em-producao/handoff/forceorder-arr-crash-loop.md` measured `!forceOrder@arr`
delivering ZERO events to the production host across >300s combined (including a guaranteed
1msg/s control stream that also silenced), while a per-symbol combined stream on the SAME host
connected and delivered immediately. `docs/context/captura-em-producao/gates/
forceorder-fix-quant-architect.md` is the decision this test pins: the LIVE collector's default
source must build the `/stream?streams=<symbol>@forceOrder/...` path for the declared
`INITIAL_SYMBOLS` universe, over a socket whose read timeout is `_FORCE_ORDER_READ_TIMEOUT_S`
(900s, grounded in Binance's own documented ping/pong SLA — see that constant's comment), not the
probe's 10s default that was fatal here.
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

    def __init__(self, host: str, path: str, connect: Callable[[], ByteChannel]) -> None:
        """Record what this source was built with; never opens a real socket."""
        type(self).last_host = host
        type(self).last_path = path
        type(self).last_connect = connect


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


def test_default_source_opens_with_the_900s_timeout_not_the_probes_10s_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The injected `connect` callable calls `connect_tls` with `_FORCE_ORDER_READ_TIMEOUT_S`.

    `connect_tls` itself is monkeypatched to RAISE instead of opening a real socket — the
    assertion is on the call arguments captured in the raised message, never on live network I/O
    (`backend/scripts/test.sh`'s "ZERO REDE" contract).
    """
    monkeypatch.setattr(collectors_cli, "WebSocketMessageSource", _RecordingWebSocketMessageSource)
    monkeypatch.setattr(collectors_cli, "connect_tls", _fake_connect_tls)

    collectors_cli._default_force_order_source()
    connect = _RecordingWebSocketMessageSource.last_connect
    assert connect is not None

    with pytest.raises(AssertionError, match=r"timeout=900\.0"):
        connect()
