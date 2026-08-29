"""The bytes of RFC 6455: handshake and frame reading, with NO socket in sight.

Kept free of I/O on purpose. Every function here takes bytes or a `read_exact` callable, so the
whole protocol layer is exercised by the offline suite — the suite is "ZERO REDE" by
construction (`backend/scripts/test.sh`) and a protocol parser that only runs against the live
internet is a parser nobody ever tested against a malformed frame.

WHY THIS IS HAND-ROLLED AND NOT A LIBRARY. `backend/pyproject.toml` declares
`dependencies = []`, and the comment there calls the empty list "declaracao, nao esquecimento".
Adding a runtime dependency to answer a MEASUREMENT question would change a declared property of
the repository as a side effect of a probe. The read path needed here is small: a client never
has to UNMASK (only servers do), and a probe whose window is under one minute never has to
answer the 3-minute ping.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from collections.abc import Callable, Iterator

from src.modules.sentimento.domain.stream_probe_outcome import ProbeStage
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import StreamTransportError

# The constant RFC 6455 §1.3 appends to the client key before hashing.
_WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

OPCODE_CONTINUATION = 0x0
OPCODE_TEXT = 0x1
OPCODE_BINARY = 0x2
OPCODE_CLOSE = 0x8
OPCODE_PING = 0x9
OPCODE_PONG = 0xA

_LEN_16BIT = 126
_LEN_64BIT = 127


def new_client_key() -> str:
    """Generate the 16-byte client nonce, base64-encoded, per RFC 6455 §4.1."""
    return base64.b64encode(secrets.token_bytes(16)).decode("ascii")


def expected_accept(client_key: str) -> str:
    """Compute the `Sec-WebSocket-Accept` the server MUST return for `client_key`.

    SHA-1 here is a PROTOCOL CONSTANT, not a security primitive: RFC 6455 fixes it, and the
    value proves the peer parsed our handshake rather than echoing bytes. `usedforsecurity=False`
    states that in the code instead of silencing the linter with a bare ignore.
    """
    digest = hashlib.sha1((client_key + _WS_GUID).encode("ascii"), usedforsecurity=False).digest()
    return base64.b64encode(digest).decode("ascii")


def build_handshake_request(host: str, path: str, client_key: str) -> bytes:
    """Build the HTTP/1.1 upgrade request for `path` on `host`."""
    lines = (
        f"GET {path} HTTP/1.1",
        f"Host: {host}",
        "Upgrade: websocket",
        "Connection: Upgrade",
        f"Sec-WebSocket-Key: {client_key}",
        "Sec-WebSocket-Version: 13",
        "",
        "",
    )
    return "\r\n".join(lines).encode("ascii")


def verify_handshake_response(raw: bytes, client_key: str) -> None:
    """Accept ONLY a well-formed 101 whose accept token matches; raise otherwise.

    Three distinct refusals, because "the handshake failed" is three different findings: a
    non-101 status (the server refused the stream we asked for), a missing accept header, and a
    mismatched token (something answered that is not this WebSocket server).
    """
    head = raw.split(b"\r\n\r\n", 1)[0].decode("latin-1")
    lines = head.split("\r\n")
    status = lines[0] if lines else ""
    if " 101" not in status:
        raise StreamTransportError(ProbeStage.HTTP_UPGRADE, f"status nao-101: {status!r}")
    headers = {}
    for line in lines[1:]:
        name, _, value = line.partition(":")
        headers[name.strip().lower()] = value.strip()
    accept = headers.get("sec-websocket-accept")
    if accept is None:
        raise StreamTransportError(ProbeStage.HTTP_UPGRADE, "resposta 101 sem Sec-WebSocket-Accept")
    if accept != expected_accept(client_key):
        raise StreamTransportError(
            ProbeStage.HTTP_UPGRADE,
            f"Sec-WebSocket-Accept nao confere: {accept!r}",
        )


def _exactly(read_exact: Callable[[int], bytes], size: int, what: str) -> bytes:
    """Read `size` bytes or refuse at `FRAME`, naming what was being read.

    A short read means the peer stopped mid-frame. Without this guard the caller indexed into a
    truncated buffer and raised `IndexError` — an unhandled crash instead of a staged refusal,
    which is precisely the failure this probe must never produce: it would leave the run with no
    verdict at all rather than with `NOT_MEASURED`.
    """
    data = read_exact(size)
    if len(data) < size:
        raise StreamTransportError(
            ProbeStage.FRAME, f"conexao fechada lendo {what}: {len(data)} de {size} byte(s)"
        )
    return data


def _payload_length(read_exact: Callable[[int], bytes], first_length: int) -> int:
    """Resolve the 7-bit, 16-bit or 64-bit payload length."""
    if first_length == _LEN_16BIT:
        return int.from_bytes(_exactly(read_exact, 2, "tamanho de 16 bits"), "big")
    if first_length == _LEN_64BIT:
        return int.from_bytes(_exactly(read_exact, 8, "tamanho de 64 bits"), "big")
    return first_length


def read_frame(read_exact: Callable[[int], bytes]) -> tuple[bool, int, bytes]:
    """Read one frame, returning `(fin, opcode, payload)`.

    A server-to-client frame is never masked (RFC 6455 §5.1); a masked one means we are not
    talking to a conforming server, and that is reported rather than silently unmasked.
    """
    header = _exactly(read_exact, 2, "cabecalho do frame")
    fin = bool(header[0] & 0x80)
    opcode = header[0] & 0x0F
    masked = bool(header[1] & 0x80)
    length = _payload_length(read_exact, header[1] & 0x7F)
    if masked:
        raise StreamTransportError(
            ProbeStage.FRAME, "frame do servidor veio MASCARADO, contra RFC 6455 5.1"
        )
    return fin, opcode, _exactly(read_exact, length, "corpo do frame") if length else b""


def iter_text_messages(read_exact: Callable[[int], bytes]) -> Iterator[str]:
    """Yield complete text messages, reassembling continuations and skipping control frames."""
    buffer = bytearray()
    pending_text = False
    while True:
        fin, opcode, payload = read_frame(read_exact)
        if opcode == OPCODE_CLOSE:
            return
        if opcode in (OPCODE_PING, OPCODE_PONG):
            continue
        if opcode in (OPCODE_TEXT, OPCODE_BINARY):
            buffer = bytearray(payload)
            pending_text = opcode == OPCODE_TEXT
        elif opcode == OPCODE_CONTINUATION:
            buffer.extend(payload)
        if fin and pending_text:
            yield buffer.decode("utf-8", errors="replace")
            buffer = bytearray()
            pending_text = False
