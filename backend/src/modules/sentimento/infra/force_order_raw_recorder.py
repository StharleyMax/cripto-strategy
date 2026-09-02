"""Raw recording of `!forceOrder@arr`, enveloped with the four columns `SPEC-001` requires."""
#
# Reuses `ByteChannel`, `WebSocketMessageSource` and `connect_tls` from `binance_stream_probe.py`
# (`T-03.1`) — same class of stream, same host, same injectable-channel discipline that keeps
# the suite offline. Nothing about the WebSocket transport is duplicated here; this module ADDS
# only the envelope this task's DoD requires, as a decorator around the same `MessageSource`.

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Iterator
from pathlib import Path

from src.modules.sentimento.domain.force_order_envelope import STREAM_NAME, ForceOrderEnvelope
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import MessageSource

logger = logging.getLogger(__name__)


def force_order_stream_path(stream: str = STREAM_NAME) -> str:
    """Build the single-stream path for the whole-market liquidation stream.

    `!forceOrder@arr` has no symbol list — it is market-wide BY DESIGN (`SPEC-001` §5.10), so,
    unlike `combined_stream_path` (`T-03.1`), there is nothing to enumerate here.
    """
    return f"/ws/{stream}"


class ForceOrderRawRecorder:
    """Wrap a `MessageSource` and append every raw message, enveloped and UNPARSED.

    Every line written is `ForceOrderEnvelope.as_dict()` — `received_at`, `stream`,
    `doc_snapshot_date` and `subsampling_semantics_label` next to the untouched `raw` text. The
    evidence is written as the bytes arrived, before any parsing of ours, so the finding can be
    re-read and re-judged without trusting a classifier this module does not have.
    """

    def __init__(self, inner: MessageSource, evidence_path: Path, now: Callable[[], str]) -> None:
        """Bind the recorder to an inner source and the file that will hold the raw sample."""
        self._inner = inner
        self._path = evidence_path
        self._now = now

    def open(self) -> None:
        """Open the inner source."""
        self._inner.open()

    def close(self) -> None:
        """Close the inner source."""
        self._inner.close()

    def messages(self) -> Iterator[str]:
        """Yield the inner messages, appending each one enveloped and stamped.

        The evidence file is opened LAZILY, on the FIRST raw message. `!forceOrder@arr` is
        whole-market and sparse (`SPEC-001` §5.10): a short window can legitimately see zero
        events, and manufacturing an empty file for that case would read as "zero was recorded"
        instead of the true "nothing arrived to record" — a distinction `T-03.3`'s reconnect
        accounting needs intact.
        """
        handle = None
        try:
            for raw in self._inner.messages():
                if handle is None:
                    self._path.parent.mkdir(parents=True, exist_ok=True)
                    handle = self._path.open("a", encoding="utf-8")
                envelope = ForceOrderEnvelope(raw=raw, received_at=self._now())
                handle.write(json.dumps(envelope.as_dict(), ensure_ascii=True) + "\n")
                handle.flush()
                yield raw
        finally:
            if handle is not None:
                handle.close()
