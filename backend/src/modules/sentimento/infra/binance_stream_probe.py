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
from collections.abc import Callable, Iterator, Sequence
from pathlib import Path
from typing import Protocol

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

    def __init__(self, host: str, path: str, connect: Callable[[], ByteChannel]) -> None:
        """Bind the source to a host, a stream path and a way to obtain a channel."""
        self._host = host
        self._path = path
        self._connect = connect
        self._channel: ByteChannel | None = None
        # Sobra do handshake. `recv(4096)` NAO respeita fronteira de mensagem: o mesmo pacote
        # pode trazer o fim do cabecalho HTTP e o inicio do primeiro frame. Descartar essa
        # sobra perde a PRIMEIRA mensagem — e perder a primeira mensagem de uma sonda cuja
        # pergunta e "o campo veio?" e perder exatamente a evidencia que ela existe para colher.
        self._pending = bytearray()

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

    @staticmethod
    def _read_header(channel: ByteChannel) -> tuple[bytes, bytes]:
        """Read up to the end of the HTTP head, returning it AND the bytes read past it."""
        buffer = bytearray()
        while _HEADER_TERMINATOR not in buffer:
            chunk = channel.recv(4096)
            if not chunk:
                raise StreamTransportError(
                    ProbeStage.HTTP_UPGRADE, "conexao fechada antes de completar o handshake"
                )
            buffer.extend(chunk)
        head, _, rest = bytes(buffer).partition(_HEADER_TERMINATOR)
        return head, rest

    def _read_exact(self, size: int) -> bytes:
        """Read exactly `size` bytes, failing at `FRAME` on close or timeout."""
        channel = self._channel
        if channel is None:
            raise StreamTransportError(ProbeStage.FRAME, "canal nao aberto")
        buffer = bytearray()
        if self._pending:
            take = min(size, len(self._pending))
            buffer.extend(self._pending[:take])
            del self._pending[:take]
        while len(buffer) < size:
            try:
                chunk = channel.recv(size - len(buffer))
            except TimeoutError as error:
                raise StreamTransportError(ProbeStage.FRAME, f"timeout: {error}") from error
            if not chunk:
                raise StreamTransportError(ProbeStage.FRAME, "conexao fechada no meio do frame")
            buffer.extend(chunk)
        return bytes(buffer)

    def messages(self) -> Iterator[str]:
        """Yield complete text messages from the stream."""
        return iter_text_messages(self._read_exact)

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
