"""Drive a `!forceOrder@arr` message source for one short window — connectivity, not parsing."""
#
# This use case NEVER decodes a single message: it only counts raw frames as they arrive within
# the declared window. That is the "grava cru, zero normalização" line of the DoD made
# structural — there is no branch here that could read a liquidation field even by accident,
# because no JSON is ever loaded. Recording the raw bytes with their envelope is `infra`'s job
# (`force_order_raw_recorder.py`); this module only decides WHEN to stop reading.
#
# Reuses `MessageSource` and `StreamTransportError` from `probe_stream_quantity_fields.py`
# (`T-03.1`, same layer) rather than declaring a second copy of the same protocol — the
# transport is the identical class of stream (`wss://fstream.binance.com`), so the contract
# between `use_cases` and `infra` is the same one already proven live.

from __future__ import annotations

from collections.abc import Callable

from src.modules.sentimento.domain.force_order_capture_outcome import (
    ForceOrderCaptureOutcome,
    ForceOrderConnected,
    ForceOrderNotConnected,
)
from src.modules.sentimento.domain.stream_probe_outcome import ProbeStage, WindowEnd
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import (
    MessageSource,
    StreamTransportError,
)


def capture_force_order_connectivity(
    source: MessageSource,
    window_seconds: float,
    max_messages: int,
    now: Callable[[], float],
) -> ForceOrderCaptureOutcome:
    """Open `source`, count raw messages within the window, and always close it.

    `now` is injected so the window is testable without waiting — the suite is offline BY
    CONSTRUCTION (`backend/scripts/test.sh`, "ZERO REDE") and a real clock would make the window
    a race instead of an assertion.
    """
    try:
        source.open()
    except StreamTransportError as failure:
        # Mirrors `probe_stream_quantity_fields`: a handshake that fails still leaves a channel
        # that may have been opened partway, and an explicit `close` here is what the bench of
        # `T-03.1` measured was missing before it was added — not a hypothetical.
        source.close()
        return ForceOrderNotConnected(failed_stage=failure.stage, detail=failure.detail)
    try:
        return _collect(source, window_seconds, max_messages, now)
    finally:
        source.close()


def _collect(
    source: MessageSource,
    window_seconds: float,
    max_messages: int,
    now: Callable[[], float],
) -> ForceOrderCaptureOutcome:
    """Count raw frames until the window elapses, the cap is hit, or the stream ends."""
    started = now()
    count = 0
    window_end = WindowEnd.STREAM_ENDED
    interrupted_at: ProbeStage | None = None
    try:
        for _raw in source.messages():
            count += 1
            if count >= max_messages:
                window_end = WindowEnd.MESSAGE_CAP
                break
            if now() - started >= window_seconds:
                window_end = WindowEnd.WINDOW_ELAPSED
                break
    except StreamTransportError as failure:
        # A failure that lands AFTER the handshake succeeded is an INTERRUPTED window, never a
        # `ForceOrderNotConnected` — connectivity was already proven; what changed is that the
        # window closed earlier than declared. Swallowing this in silence would hide that from
        # the report, which is the same defect `probe_stream_quantity_fields.py` already names.
        window_end = WindowEnd.INTERRUPTED
        interrupted_at = failure.stage
    return ForceOrderConnected(
        messages_captured=count,
        window_end=window_end,
        observed_seconds=round(now() - started, 3),
        interrupted_at_stage=interrupted_at,
    )
