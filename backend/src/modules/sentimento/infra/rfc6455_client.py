"""The bytes of RFC 6455: handshake and frame reading, with NO socket in sight."""
#
# Kept free of I/O on purpose. Every function here takes bytes or a `read_exact` callable, so the
# whole protocol layer is exercised by the offline suite — the suite is "ZERO REDE" by
# construction (`backend/scripts/test.sh`) and a protocol parser that only runs against the live
# internet is a parser nobody ever tested against a malformed frame.
#
# WHY THIS IS HAND-ROLLED AND NOT A LIBRARY. `backend/pyproject.toml` declares
# `dependencies = []`, and the comment there calls the empty list "declaracao, nao esquecimento".
# Adding a runtime dependency to answer a MEASUREMENT question would change a declared property of
# the repository as a side effect of a probe. The read path needed here is small: a client never
# has to UNMASK (only servers do), and a probe whose window is under one minute never has to
# answer the 3-minute ping.

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
        raise StreamTransportError(ProbeStage.HTTP_UPGRADE, f"non-101 status: {status!r}")
    headers = {}
    for line in lines[1:]:
        name, _, value = line.partition(":")
        headers[name.strip().lower()] = value.strip()
    accept = headers.get("sec-websocket-accept")
    if accept is None:
        raise StreamTransportError(
            ProbeStage.HTTP_UPGRADE, "101 response missing Sec-WebSocket-Accept"
        )
    if accept != expected_accept(client_key):
        raise StreamTransportError(
            ProbeStage.HTTP_UPGRADE,
            f"Sec-WebSocket-Accept does not match: {accept!r}",
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
            ProbeStage.FRAME, f"connection closed reading {what}: {len(data)} of {size} byte(s)"
        )
    return data


def _payload_length(read_exact: Callable[[int], bytes], first_length: int) -> int:
    """Resolve the 7-bit, 16-bit or 64-bit payload length."""
    if first_length == _LEN_16BIT:
        return int.from_bytes(_exactly(read_exact, 2, "16-bit length"), "big")
    if first_length == _LEN_64BIT:
        return int.from_bytes(_exactly(read_exact, 8, "64-bit length"), "big")
    return first_length


def read_frame(read_exact: Callable[[int], bytes]) -> tuple[bool, int, bytes]:
    """Read one frame, returning `(fin, opcode, payload)`.

    A server-to-client frame is never masked (RFC 6455 §5.1); a masked one means we are not
    talking to a conforming server, and that is reported rather than silently unmasked.
    """
    header = _exactly(read_exact, 2, "frame header")
    fin = bool(header[0] & 0x80)
    opcode = header[0] & 0x0F
    masked = bool(header[1] & 0x80)
    length = _payload_length(read_exact, header[1] & 0x7F)
    if masked:
        raise StreamTransportError(
            ProbeStage.FRAME, "server frame came MASKED, against RFC 6455 5.1"
        )
    return fin, opcode, _exactly(read_exact, length, "frame body") if length else b""


def _mask(payload: bytes, key: bytes) -> bytes:
    """XOR `payload` against the 4-byte `key`, repeating it (RFC 6455 §5.3)."""
    return bytes(byte ^ key[index % 4] for index, byte in enumerate(payload))


def build_pong_frame(payload: bytes) -> bytes:
    """Build a MASKED client PONG frame echoing `payload` verbatim (RFC 6455 §5.5.3, ADR-004 D5).

    Binance's own contract is explicit: *"When you receive a ping, you must send a pong with a
    copy of ping's payload as soon as possible."* A pong that does not carry the SAME payload
    answers a question the server never asked. Every client-to-server frame MUST be masked (RFC
    6455 §5.1) — the mask key is fresh per frame (`secrets.token_bytes`), matching
    `new_client_key`'s use of a CSPRNG for the same reason the handshake key is: this is a
    protocol-shape requirement, not a security boundary, so `usedforsecurity` does not apply here.
    """
    header = bytearray([0x80 | OPCODE_PONG])
    length = len(payload)
    if length <= 125:
        header.append(0x80 | length)
    elif length <= 0xFFFF:
        header.append(0x80 | _LEN_16BIT)
        header.extend(length.to_bytes(2, "big"))
    else:
        header.append(0x80 | _LEN_64BIT)
        header.extend(length.to_bytes(8, "big"))
    key = secrets.token_bytes(4)
    header.extend(key)
    return bytes(header) + _mask(payload, key)


def iter_text_messages(
    read_exact: Callable[[int], bytes], send: Callable[[bytes], None]
) -> Iterator[str]:
    """Yield complete text messages, answering every PING with a real PONG (`ADR-004` D5).

    `send` is how this generator talks back to the peer. Before D5, a PING was only `continue`d
    — never answered — which is not neutral: Binance's own SLA says the connection gets closed,
    by the SERVER, if a PONG never arrives, even on a perfectly healthy link. Answering turns a
    self-inflicted disconnect into a no-op; a received PONG (this client never sends an
    unsolicited PING) still carries no reply.
    """
    buffer = bytearray()
    pending_text = False
    while True:
        fin, opcode, payload = read_frame(read_exact)
        if opcode == OPCODE_CLOSE:
            return
        if opcode == OPCODE_PING:
            send(build_pong_frame(payload))
            continue
        if opcode == OPCODE_PONG:
            continue
        if opcode in (OPCODE_TEXT, OPCODE_BINARY):
            buffer = bytearray(payload)
            pending_text = opcode == OPCODE_TEXT
        elif opcode == OPCODE_CONTINUATION:
            buffer.extend(payload)
        else:
            # RFC 6455 5.2: opcode reservado (0x3-0x7, 0xB-0xF) manda FALHAR a conexao. Sem este
            # ramo o fluxo caia no `if fin and pending_text` abaixo e ENTREGAVA o buffer parcial:
            # meia mensagem publicada como mensagem inteira. Um fragmento cortado dificilmente e
            # JSON valido, entao o efeito provavel era perda silenciosa — mas "provavel" nao e
            # garantia, e um parser escrito a mao nao deve adivinhar o que fazer com o que a
            # norma manda recusar.
            raise StreamTransportError(
                ProbeStage.FRAME, f"reserved opcode {opcode:#x}: RFC 6455 5.2 mandates failing"
            )
        if fin and pending_text:
            yield buffer.decode("utf-8", errors="replace")
            buffer = bytearray()
            pending_text = False
