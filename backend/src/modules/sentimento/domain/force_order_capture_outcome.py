"""Outcome of a short `!forceOrder@arr` connectivity probe — CONNECTED never implies a message."""
#
# THE DEFECT THIS MODULE EXISTS TO PREVENT. `!forceOrder@arr` is a whole-market liquidation
# stream: it is sparse by nature, and a short window can legitimately end with zero events. A
# probe that collapsed "the handshake failed" and "the handshake worked but nothing happened to
# liquidate" into the same outcome would make T-03.3 (reconnect policy) unable to tell a dead
# socket from a quiet market. `ForceOrderConnected` is returned whenever the stream OPENED,
# `messages_captured` included — it answers "is the pipe there?", not "did anything travel
# through it?". Only `ForceOrderNotConnected` says the pipe itself failed, and it names the
# stage.
#
# `ProbeStage` and `WindowEnd` are reused from `stream_probe_outcome.py` on purpose: they are
# already generic over "which stage of the WS protocol failed" / "how the window ended" and
# `T-03.1` already exercises both against a live Binance futures host. Duplicating them here
# would diverge two enumerations that describe the same protocol.

from __future__ import annotations

from dataclasses import dataclass

from src.modules.sentimento.domain.stream_probe_outcome import ProbeStage, WindowEnd


@dataclass(frozen=True)
class ForceOrderNotConnected:
    """The handshake never completed. No message was ever read from this attempt."""

    failed_stage: ProbeStage
    detail: str


@dataclass(frozen=True)
class ForceOrderConnected:
    """The stream opened and stayed open for the declared window (or until interrupted).

    `messages_captured` MAY be zero — see the module docstring. What this type proves is
    CONNECTIVITY, never throughput.
    """

    messages_captured: int
    window_end: WindowEnd
    observed_seconds: float
    interrupted_at_stage: ProbeStage | None = None

    @property
    def window_complete(self) -> bool:
        """True when the window closed by a DECLARED criterion (time or message cap)."""
        return self.window_end in (WindowEnd.WINDOW_ELAPSED, WindowEnd.MESSAGE_CAP)


ForceOrderCaptureOutcome = ForceOrderNotConnected | ForceOrderConnected
