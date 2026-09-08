"""Live WebSocket transport for the probe, with EVERY failure tagged by the stage it hit."""
#
# The socket is INJECTED (`connect`), for two reasons that are not style. First, the suite is
# offline by construction, and an injected channel is the only way the handshake and the read loop
# are exercised at all. Second, the negative control of `D3.9` needs failures it can PRODUCE: a
# fake channel that refuses at TLS, or returns a 404 to the upgrade, proves this module reports
# `NOT_MEASURED` and not "field absent". A transport that could only fail by real outage would be
# a control nobody can run.

from __future__ import annotations

import json
import logging
import socket
import ssl
import time
from collections.abc import Callable, Iterator, Sequence
from pathlib import Path
from typing import Final, Protocol

from src.modules.sentimento.domain.stream_probe_outcome import ProbeStage
from src.modules.sentimento.infra.rfc6455_client import (
    build_handshake_request,
    iter_text_messages,
    new_client_key,
    verify_handshake_response,
)
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import (
    MessageSource,
    StreamTransportError,
)

logger = logging.getLogger(__name__)

BINANCE_FUTURES_STREAM_HOST = "fstream.binance.com"
_HEADER_TERMINATOR = b"\r\n\r\n"

# `ADR-004` Emenda D5: the library-wide default for "how long can EVERY frame type stay silent
# before the connection is presumed dead". ~2x Binance's documented 3-minute ping cadence, with
# margin, comfortably below the 10-minute window in which BINANCE itself would close the socket —
# so this class never trails Binance's own liveness verdict. A caller with a sparser producer
# (`collectors_cli.py`'s live `forceOrder` collector) names its OWN constant instead of leaning on
# this default, so the value stays traceable to the incident that picked it.
_DEFAULT_IDLE_TIMEOUT_S: Final[float] = 300.0


class StreamIdleTimeoutError(StreamTransportError):
    """No frame of ANY kind arrived within the idle window — the connection is presumed dead.

    A DISTINCT type from the base `StreamTransportError`, so a caller can route it to
    reconnection (`ADR-004` Emenda D5/D6: idle silence reconnects the SAME way a clean
    `StopIteration` does) instead of treating it as the generic `FRAME` failure a truncated read
    or a masked server frame would be. Failing to OPEN the substitute connection still raises the
    base `StreamTransportError` and stays fatal — this type only ever comes from a connection that
    was already open and had gone quiet.
    """


class ByteChannel(Protocol):
    """The three socket operations this probe uses. Narrow on purpose, so a fake is trivial."""

    def sendall(self, data: bytes, /) -> None:
        """Write all of `data`."""

    def recv(self, size: int, /) -> bytes:
        """Read at most `size` bytes; empty means the peer closed."""

    def close(self) -> None:
        """Release the channel."""


def combined_stream_path(symbols: Sequence[str], stream: str = "aggTrade") -> str:
    """Build the combined-stream path for `symbols` on the named `stream`.

    ONE connection for every symbol, not one per symbol: the task is a measurement against a
    third party and the instruction is to stay conservative. The combined endpoint costs a
    single handshake regardless of how many symbols the universe declares.

    `stream` is a parameter so the NEGATIVE CONTROL can point this same code at a stream that
    has no `nq` at all (`bookTicker`) — same host, same handshake, same reader, different
    answer. A control that shared no code with the measurement would prove nothing about it.
    """
    streams = "/".join(f"{symbol.lower()}@{stream}" for symbol in symbols)
    return f"/stream?streams={streams}"


def connect_tls(host: str, port: int = 443, timeout: float = 10.0) -> ByteChannel:
    """Open a real TLS channel, translating each failure into the stage that produced it."""
    context = ssl.create_default_context()
    try:
        raw = socket.create_connection((host, port), timeout=timeout)
    except socket.gaierror as error:
        raise StreamTransportError(ProbeStage.DNS, f"{host}: {error}") from error
    except OSError as error:
        raise StreamTransportError(ProbeStage.TCP, f"{host}:{port}: {error}") from error
    try:
        secure = context.wrap_socket(raw, server_hostname=host)
    except (ssl.SSLError, OSError) as error:
        raw.close()
        raise StreamTransportError(ProbeStage.TLS, f"{host}: {error}") from error
    secure.settimeout(timeout)
    return secure


class WebSocketMessageSource:
    """A `MessageSource` speaking RFC 6455 over an injected byte channel."""

    def __init__(
        self,
        host: str,
        path: str,
        connect: Callable[[], ByteChannel],
        *,
        now: Callable[[], float] = time.monotonic,
        idle_timeout_s: float = _DEFAULT_IDLE_TIMEOUT_S,
    ) -> None:
        """Bind the source to a host, a stream path and a way to obtain a channel.

        `path` is ALSO exposed publicly (unprefixed), not just kept as `self._host`'s private
        counterpart: it is the one thing this object knows about WHICH stream it actually
        connects to, and a caller building provenance (`collectors_cli.py`'s
        `_run_force_order_collector`, after `docs/context/captura-em-producao/gates/
        forceorder-fix-qa.md`) reads it to record the REAL endpoint instead of a hardcoded
        literal that can drift from whatever `open_source` was actually wired to.

        `now`/`idle_timeout_s` implement `ADR-004` Emenda D5: death is judged by silence of ANY
        frame, accumulated across repeated short `recv()` timeouts — never by a single one. The
        per-`recv()` granularity is the channel's OWN `settimeout`, set by whatever `connect`
        closure the caller injected; this class never reads that value, it only measures how much
        wall-clock time passed since the last byte of ANY kind arrived. `now` is injectable so the
        offline suite proves the threshold with a fake clock, never a real `sleep`.
        """
        self._host = host
        self._path = path
        self.path = path
        self._connect = connect
        self._now = now
        self._idle_timeout_s = idle_timeout_s
        self._channel: ByteChannel | None = None
        # Sobra do handshake. `recv(4096)` NAO respeita fronteira de mensagem: o mesmo pacote
        # pode trazer o fim do cabecalho HTTP e o inicio do primeiro frame. Descartar essa
        # sobra perde a PRIMEIRA mensagem — e perder a primeira mensagem de uma sonda cuja
        # pergunta e "o campo veio?" e perder exatamente a evidencia que ela existe para colher.
        self._pending = bytearray()
        self._last_activity_at = now()

    def open(self) -> None:
        """Connect and complete the upgrade, or raise with the failing stage."""
        channel = self._connect()
        self._channel = channel
        key = new_client_key()
        try:
            channel.sendall(build_handshake_request(self._host, self._path, key))
            head, leftover = self._read_header(channel)
            verify_handshake_response(head, key)
            self._pending = bytearray(leftover)
        except OSError as error:
            raise StreamTransportError(ProbeStage.HTTP_UPGRADE, str(error)) from error
        # The handshake completing IS activity — resets the idle clock so a slow-to-arrive first
        # frame is not measured against a baseline set before the socket even connected.
        self._last_activity_at = self._now()

    @staticmethod
    def _read_header(channel: ByteChannel) -> tuple[bytes, bytes]:
        """Read up to the end of the HTTP head, returning it AND the bytes read past it."""
        buffer = bytearray()
        while _HEADER_TERMINATOR not in buffer:
            chunk = channel.recv(4096)
            if not chunk:
                raise StreamTransportError(
                    ProbeStage.HTTP_UPGRADE, "connection closed before completing the handshake"
                )
            buffer.extend(chunk)
        head, _, rest = bytes(buffer).partition(_HEADER_TERMINATOR)
        return head, rest

    def _read_exact(self, size: int) -> bytes:
        """Read exactly `size` bytes, failing at `FRAME` on close, or at idle death on silence.

        A single `recv()` timeout is NOT a verdict — it is the granularity tick `ADR-004` D5
        names (small on purpose, so control returns often). Only once the accumulated silence
        SINCE THE LAST BYTE OF ANY KIND crosses `idle_timeout_s` does this raise
        `StreamIdleTimeoutError`; until then it keeps retrying the same read.
        """
        channel = self._channel
        if channel is None:
            raise StreamTransportError(ProbeStage.FRAME, "channel not open")
        buffer = bytearray()
        if self._pending:
            take = min(size, len(self._pending))
            buffer.extend(self._pending[:take])
            del self._pending[:take]
        while len(buffer) < size:
            try:
                chunk = channel.recv(size - len(buffer))
            except TimeoutError as error:
                silence_s = self._now() - self._last_activity_at
                if silence_s >= self._idle_timeout_s:
                    raise StreamIdleTimeoutError(
                        ProbeStage.FRAME,
                        f"no frame of any kind for {silence_s:.1f}s "
                        f"(>= idle timeout {self._idle_timeout_s:.1f}s): {error}",
                    ) from error
                continue
            if not chunk:
                raise StreamTransportError(ProbeStage.FRAME, "connection closed mid-frame")
            buffer.extend(chunk)
            self._last_activity_at = self._now()
        return bytes(buffer)

    def _send_frame(self, data: bytes) -> None:
        """Write a client frame (a PONG, today) straight to the channel."""
        channel = self._channel
        if channel is None:
            raise StreamTransportError(ProbeStage.FRAME, "channel not open")
        channel.sendall(data)

    def messages(self) -> Iterator[str]:
        """Yield complete text messages from the stream, answering every PING with a PONG."""
        return iter_text_messages(self._read_exact, self._send_frame)

    def close(self) -> None:
        """Close the channel if one was ever opened. Safe after a failed `open`."""
        if self._channel is not None:
            self._channel.close()
            self._channel = None


class RecordingMessageSource:
    """Wrap a source and append every raw message to a file, VERBATIM and stamped.

    The evidence is written as the bytes arrived, before any parsing of ours, so the finding can
    be re-read and re-judged without trusting the classifier that produced it.
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
        """Yield the inner messages, appending each one with its capture timestamp."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as handle:
            for raw in self._inner.messages():
                handle.write(json.dumps({"captured_at": self._now(), "raw": raw}) + "\n")
                handle.flush()
                yield raw
