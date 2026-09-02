"""RESP2 over a raw TCP socket — this component's only line that touches the network.

`backend/scripts/test.sh` states "ZERO REDE": nothing here contradicts it, because the socket is
built by an INJECTED factory (`SocketFactory`), and every test injects a fake transport — either
an in-memory pair or `fakeredis.TcpFakeServer` (a real loopback listener, no external host, no
`.env` key). `open_tcp_socket` is the one function that opens a real connection, and it is reached
only from a caller a human runs by hand, the same shape `infra/https_quota_probe.py` already uses
for HTTPS.

Why hand-rolled RESP instead of the `redis` package: every other network client in this tree
(`infra/https_quota_probe.py`, `infra/binance_stream_probe.py`, `infra/rfc6455_client.py`) is
built on the standard library, never a third-party runtime dependency — `[project].dependencies`
is `[]` by declaration, not omission. RESP2 is a small, fully-specified text protocol (arrays of
bulk strings out, five reply markers in); reproducing it here keeps that invariant intact instead
of quietly ending it for one component.
"""

from __future__ import annotations

import socket as socket_module
from collections.abc import Callable, Sequence
from typing import Final, Protocol

RespValue = None | int | bytes | list["RespValue"]

_CRLF: Final[bytes] = b"\r\n"
_RECV_CHUNK: Final[int] = 4096


class RedisProtocolError(Exception):
    """The peer sent bytes this RESP2 parser does not accept — never silently reinterpreted."""


class RedisCommandError(Exception):
    """The peer understood the command and answered the RESP `-ERR ...` reply, verbatim."""


class SocketLike(Protocol):
    """The four socket operations this client needs — small enough to fake without a real port."""

    def sendall(self, data: bytes) -> None:
        """Write every byte of `data`, blocking until the OS has accepted all of it."""
        ...

    def recv(self, bufsize: int) -> bytes:
        r"""Read up to `bufsize` bytes, returning `b\"\"` only when the peer closed the socket."""
        ...

    def settimeout(self, value: float | None) -> None:
        """Bound how long the next blocking call may wait."""
        ...

    def close(self) -> None:
        """Release the underlying descriptor."""
        ...


SocketFactory = Callable[[str, int], SocketLike]


def open_tcp_socket(host: str, port: int) -> SocketLike:  # pragma: no cover - real network
    """Open a real, blocking TCP connection — the only line in this module that touches a wire."""
    return socket_module.create_connection((host, port), timeout=10.0)


def connect_resp2(sock: SocketLike) -> RespConnection:
    """Wrap `sock` in a `RespConnection` and pin the reply protocol to RESP2 via `HELLO 2`.

    Redis 6+ defaults new connections to RESP2 already, so `HELLO 2` is a no-op against a real
    server; it matters against a server that defaults elsewhere. `XREADGROUP`'s reply shape
    otherwise differs by negotiated protocol version — RESP3 answers with a map (`%`) instead of
    the array of `[stream, entries]` pairs this client's parser understands (`RespValue` has no
    map case) — so pinning the protocol here, once, is what keeps `redis_stream_bus.py` able to
    assume one fixed reply shape instead of branching on which protocol answered.
    """
    connection = RespConnection(sock)
    connection.command("HELLO", "2")
    return connection


class RespConnection:
    """One RESP2 connection: encode a command, send it, decode exactly one reply.

    `read_push()` reads one MORE reply without sending anything — the shape a `SUBSCRIBE`d
    connection needs, since after the subscribe acknowledgement every further reply is a
    server-initiated push rather than an answer to a request this client sent.
    """

    def __init__(self, sock: SocketLike) -> None:
        """Wrap an already-connected `sock`; this class never opens or retries a connection."""
        self._sock = sock
        self._buffer = b""

    def command(self, *args: str | bytes | int) -> RespValue:
        """Send one command as a RESP array of bulk strings and return its single reply."""
        self._sock.sendall(_encode_command(args))
        return self.read_push()

    def read_push(self) -> RespValue:
        """Decode exactly one RESP2 value from the wire, without sending anything first."""
        return self._read_reply()

    def close(self) -> None:
        """Close the underlying socket."""
        self._sock.close()

    def _read_line(self) -> bytes:
        while _CRLF not in self._buffer:
            chunk = self._sock.recv(_RECV_CHUNK)
            if not chunk:
                raise RedisProtocolError("connection closed while a reply line was expected")
            self._buffer += chunk
        line, _, rest = self._buffer.partition(_CRLF)
        self._buffer = rest
        return line

    def _read_exact(self, size: int) -> bytes:
        needed = size + len(_CRLF)
        while len(self._buffer) < needed:
            chunk = self._sock.recv(_RECV_CHUNK)
            if not chunk:
                raise RedisProtocolError("connection closed mid-bulk-string")
            self._buffer += chunk
        data = self._buffer[:size]
        self._buffer = self._buffer[needed:]
        return data

    def _read_reply(self) -> RespValue:
        line = self._read_line()
        marker, payload = line[:1], line[1:]
        if marker == b"+":
            return payload
        if marker == b"-":
            raise RedisCommandError(payload.decode("utf-8", errors="replace"))
        if marker == b":":
            return int(payload)
        if marker == b"$":
            length = int(payload)
            return None if length == -1 else self._read_exact(length)
        if marker == b"*":
            count = int(payload)
            return None if count == -1 else [self._read_reply() for _ in range(count)]
        if marker == b"_":
            # RESP3's dedicated null type. `connect_resp2` pins the protocol to RESP2 (where a
            # null is `$-1`/`*-1`), but this marker is accepted defensively too: it costs one
            # branch and means a server that answers it anyway — by quirk or future upgrade —
            # degrades to "no reply" instead of an opaque `RedisProtocolError`.
            return None
        raise RedisProtocolError(f"unrecognized RESP2 reply marker: {marker!r}")


def _encode_command(args: Sequence[str | bytes | int]) -> bytes:
    """Encode `args` as the RESP2 array-of-bulk-strings request format every command uses."""
    parts: list[bytes] = [f"*{len(args)}\r\n".encode("ascii")]
    for arg in args:
        raw = _as_bytes(arg)
        parts.append(f"${len(raw)}\r\n".encode("ascii"))
        parts.append(raw)
        parts.append(_CRLF)
    return b"".join(parts)


def _as_bytes(arg: str | bytes | int) -> bytes:
    """Render one command argument as bytes, without ever going through `float`/`repr`."""
    if isinstance(arg, bytes):
        return arg
    if isinstance(arg, str):
        return arg.encode("utf-8")
    return str(arg).encode("ascii")
