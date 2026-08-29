"""Drive a message source and build a probe outcome, mapping every failure to its STAGE.

This is the only place that turns "something went wrong" into a result. It maps a transport
error to `ProbeNotMeasured` carrying the stage that failed, and it refuses to call an empty
window an answer: zero messages within the window is `NOT_MEASURED` at `FRAME`, never
"`nq` absent". The distinction is the entire point of `D3.9`.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Protocol

from src.modules.sentimento.domain.binance_aggtrade_payload import read_quantity_fields
from src.modules.sentimento.domain.stream_probe_outcome import (
    DeclaredUniverse,
    ProbeMeasured,
    ProbeNotMeasured,
    ProbeOutcome,
    ProbeStage,
)


class StreamTransportError(Exception):
    """A failure that happened BEFORE any payload could be judged, tagged with its stage."""

    def __init__(self, stage: ProbeStage, detail: str) -> None:
        """Bind the failure to the stage that produced it."""
        super().__init__(f"{stage.value}: {detail}")
        self.stage = stage
        self.detail = detail


class MessageSource(Protocol):
    """A source of raw text messages. Implemented live by infra, and by fakes in the suite."""

    def open(self) -> None:
        """Establish the stream, raising `StreamTransportError` with the failing stage."""

    def close(self) -> None:
        """Release the stream. Must be safe to call after a failed `open`."""

    def messages(self) -> Iterator[str]:
        """Yield raw text messages as they arrive."""


def probe_stream_quantity_fields(
    source: MessageSource,
    universe: DeclaredUniverse,
    now: Callable[[], float],
) -> ProbeOutcome:
    """Collect up to the declared limits and classify `q`/`nq` on every message.

    `now` is injected so the window is testable without waiting: the suite is offline BY
    CONSTRUCTION (`backend/scripts/test.sh`, "ZERO REDE") and a real clock would make the
    window a race instead of an assertion.
    """
    try:
        source.open()
    except StreamTransportError as failure:
        # O `finally` abaixo cobre so o SEGUNDO bloco. Sem este `close` explicito, um handshake
        # que falha vazava o canal — medido pela bancada, nao por leitura.
        source.close()
        return ProbeNotMeasured(failed_stage=failure.stage, detail=failure.detail)
    try:
        return _collect(source, universe, now)
    except StreamTransportError as failure:
        return ProbeNotMeasured(failed_stage=failure.stage, detail=failure.detail)
    finally:
        source.close()


def _collect(
    source: MessageSource,
    universe: DeclaredUniverse,
    now: Callable[[], float],
) -> ProbeOutcome:
    """Read within the declared window, stopping at the message cap."""
    started = now()
    readings = []
    # A failure that lands AFTER messages were decoded must not erase them. The window of this
    # probe normally ENDS in a socket timeout, and treating that as a transport failure would
    # throw away the very evidence the probe was opened to collect — the measurement would fail
    # precisely when it succeeded. The stage is only decisive while `readings` is still empty.
    try:
        for raw in source.messages():
            payload = _decode(raw, universe.event_type)
            if payload is not None:
                readings.append(read_quantity_fields(payload))
            if len(readings) >= universe.max_messages:
                break
            if now() - started >= universe.window_seconds:
                break
    except StreamTransportError:
        if not readings:
            raise
    if not readings:
        return ProbeNotMeasured(
            failed_stage=ProbeStage.FRAME,
            detail=(
                f"nenhuma mensagem utilizavel em {universe.window_seconds}s "
                f"para {list(universe.symbols)} — universo vazio NAO e ausencia de campo"
            ),
        )
    return ProbeMeasured(readings=tuple(readings))


def _decode(raw: str, event_type: str) -> dict[str, object] | None:
    """Decode one frame, returning `None` for anything that is not a JSON object.

    Binance also pushes subscription acknowledgements (`{"result": null, "id": 1}`) on the
    combined endpoint. Those decode fine but carry no trade; they are skipped rather than
    counted as a message with `q`/`nq` ABSENT, which would poison the verdict with frames that
    were never `aggTrade` events in the first place.
    """
    try:
        decoded: object = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(decoded, dict):
        return None
    event = decoded.get("data", decoded)
    if not isinstance(event, dict) or event.get("e") != event_type:
        return None
    return decoded
