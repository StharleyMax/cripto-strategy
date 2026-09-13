"""ZERO REDE, enforced — the file `backend/scripts/test.sh` promised and did not have.

Until 2026-09-12 that script's header said the suite runs "com `socket` amputado por um
`sitecustomize.py`", and `find . -name 'sitecustomize*'` returned nothing outside `.venv`
`[MEDIDO 2026-09-12, QA da fase 05 §5]`. The guarantee was PROSE. A gate that exists only in a
comment is the `rc=0` failure `ADR-012` names: the reader sees the promise, believes the
property is enforced, and stops checking — which is strictly worse than no promise at all,
because it buys a false sense of coverage.

⛔ WHY THIS LIVES IN ITS OWN DIRECTORY AND NOT IN `backend/`

`sitecustomize` is imported automatically by EVERY interpreter that finds it on `sys.path`.
Dropped next to the code, it would amputate the socket of the production collector — the one
process in this repository whose entire job is to talk to Binance and Coinalyze. So it sits in
a directory that holds nothing else, and reaches the interpreter only when `test.sh` puts that
one directory on `PYTHONPATH`. Nothing else in the repository points at it.

── WHAT IS BLOCKED, AND WHAT IS DELIBERATELY NOT ─────────────────────────────────────────────

BLOCKED    any connection to an address outside the loopback range, and any DNS lookup of a
           name that is not localhost. That is the promise: no test reaches Binance, Bybit or
           Coinalyze, and `Q1`/`Q15` stay closed by construction rather than by discipline.

ALLOWED    loopback. The suite's Postgres and Redis drivers talk to `127.0.0.1`, and blocking
           them would not make the gate stricter — it would make it impossible to run, which
           is how a gate gets switched off "temporarily" and never switched back on. The
           requirement was never "no sockets"; it was "no THIRD PARTY", and that is the line
           drawn here.

The refusal is an exception with the destination in the message, not a silent empty result: a
test that trips this must say WHAT it tried to reach, or the next reader is left guessing.
"""

from __future__ import annotations

import socket
from collections.abc import Sequence
from typing import Any

_LOOPBACK_NAMES = frozenset({"localhost", "localhost.localdomain", "ip6-localhost", ""})


class BlockedNetworkAccessError(RuntimeError):
    """A test tried to reach the network. `backend/scripts/test.sh` forbids it."""


def _is_loopback(host: object) -> bool:
    """Return whether this destination is the local machine and nothing else."""
    if isinstance(host, bytes):
        host = host.decode("utf-8", "replace")
    if not isinstance(host, str):
        return False
    if host in _LOOPBACK_NAMES:
        return True
    return host.startswith("127.") or host in {"::1", "0.0.0.0", "::"}  # noqa: S104


def _host_of(address: object) -> object:
    """Pull the host out of whatever address shape the caller used."""
    if isinstance(address, (tuple, list)) and address:
        return address[0]
    return address


def _refuse(destination: object) -> None:
    """Raise with the destination named, never a bare failure."""
    raise BlockedNetworkAccessError(
        f"network access to {destination!r} is blocked: this suite runs with ZERO REDE "
        f"(backend/scripts/test.sh). Inject a fake source or clock instead of reaching out."
    )


_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex
_real_create_connection = socket.create_connection
_real_getaddrinfo = socket.getaddrinfo


def _guarded_connect(self: socket.socket, address: Any) -> Any:
    """Connect only to the local machine."""
    host = _host_of(address)
    if not _is_loopback(host):
        _refuse(host)
    return _real_connect(self, address)


def _guarded_connect_ex(self: socket.socket, address: Any) -> Any:
    """Connect only to the local machine, `connect_ex` spelling."""
    host = _host_of(address)
    if not _is_loopback(host):
        _refuse(host)
    return _real_connect_ex(self, address)


def _guarded_create_connection(address: Any, *args: Any, **kwargs: Any) -> Any:
    """Open a connection only to the local machine."""
    host = _host_of(address)
    if not _is_loopback(host):
        _refuse(host)
    return _real_create_connection(address, *args, **kwargs)


def _guarded_getaddrinfo(host: Any, port: Any, *args: Any, **kwargs: Any) -> Sequence[Any]:
    """Resolve only the local machine — the lookup itself is already a network call."""
    if not _is_loopback(host):
        _refuse(host)
    return _real_getaddrinfo(host, port, *args, **kwargs)


socket.socket.connect = _guarded_connect  # type: ignore[method-assign]
socket.socket.connect_ex = _guarded_connect_ex  # type: ignore[method-assign]
socket.create_connection = _guarded_create_connection  # type: ignore[assignment]
socket.getaddrinfo = _guarded_getaddrinfo  # type: ignore[assignment]
