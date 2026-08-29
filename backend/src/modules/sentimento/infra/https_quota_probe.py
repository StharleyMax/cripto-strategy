"""The only module of this repository that opens a socket — and it opens it on demand."""

# ── READ THIS BEFORE ASSUMING THE SUITE GOT NETWORK ────────────────────────────────────────
#
# `backend/scripts/test.sh` states "ZERO REDE" and enforces it by amputating `socket`. Nothing
# here contradicts that: the connection is built by an INJECTED factory, and the suite injects a
# fake. The real factory — `http.client.HTTPSConnection` — is reached only from
# `infra/quota_ramp_cli.py`, which a human runs by hand and which no gate calls.
#
# ── WHY `http.client` AND NOT `urllib.request` ─────────────────────────────────────────────
#
# Three reasons, and the first is the one that decides. (1) `urlopen` HIDES the `429`: it raises
# `HTTPError` for any non-2xx, so the status this whole task exists to observe arrives as an
# exception, and the header block arrives attached to it. (2) `urlopen` FOLLOWS redirects, which
# would spend the bucket a second time under an ordinal that no longer matches the ramp's count.
# (3) `ruff` `S310` exists precisely because `urlopen` accepts `file://` and `ftp://`; the
# connection here is HTTPS by construction, so the class of bug the rule guards against cannot
# be written.
#
# ── NO KEY EVER TOUCHES THIS FILE ──────────────────────────────────────────────────────────
#
# The Coinalyze key is read from the environment under `$COINALYZE_API_KEY` (`.env`, mode 600,
# gitignored) and is passed in as a mapping, so a test can exercise the header-building without
# a key existing and this module never names a secret value.

from __future__ import annotations

import http.client
from collections.abc import Callable, Iterable, Mapping
from typing import Final, Protocol

from src.modules.sentimento.domain.quota_bucket import COINALYZE, QuotaBucket
from src.modules.sentimento.domain.ramp_ledger import ProbeObservation

COINALYZE_KEY_VARIABLE: Final[str] = "COINALYZE_API_KEY"

# Identifying the caller is not politeness — it is what lets the provider tell a measurement
# apart from an attack, and what lets them reach the owner instead of blocking the address.
DEFAULT_USER_AGENT: Final[str] = (
    "cripto-strategy/T-03.7-quota-ramp (medicao unica; contato via repo)"
)


class HttpResponse(Protocol):
    """The three things this probe needs from a response, and nothing more."""

    @property
    def status(self) -> int:
        """Return the HTTP status line's code."""
        ...

    def getheaders(self) -> list[tuple[str, str]]:
        """Return every header as a pair, preserving repeats."""
        ...

    def read(self) -> bytes:
        """Drain the body, which MUST happen before the connection can be reused."""
        ...


class HttpConnection(Protocol):
    """A keep-alive connection to one host."""

    def request(
        self,
        method: str,
        url: str,
        body: None = ...,
        headers: Mapping[str, str] = ...,
    ) -> None:
        """Send one request."""
        ...

    def getresponse(self) -> HttpResponse:
        """Read the response for the request just sent."""
        ...

    def close(self) -> None:
        """Drop the connection."""
        ...


ConnectionFactory = Callable[[str], HttpConnection]


def open_https_connection(host: str) -> HttpConnection:  # pragma: no cover - the socket itself
    """Open a real TLS connection to `host` — the only line here that touches the network."""
    return http.client.HTTPSConnection(host, timeout=20.0)


def flatten_headers(pairs: Iterable[tuple[str, str]]) -> dict[str, str]:
    """Collapse the header list into a mapping, joining repeats instead of dropping them.

    `Set-Cookie` and friends legally repeat. Keeping only the last occurrence would silently
    discard evidence from a response this task exists to read, so repeats are joined with the
    separator `RFC 9110` §5.3 defines for combining field lines.
    """
    flat: dict[str, str] = {}
    for name, value in pairs:
        key = name.lower()
        flat[key] = f"{flat[key]}, {value}" if key in flat else value
    return flat


def authentication_headers(bucket: QuotaBucket, environment: Mapping[str, str]) -> dict[str, str]:
    """Build the auth headers for `bucket`, returning an empty mapping when none are needed.

    A MISSING Coinalyze key yields no header rather than an error, and the consequence is
    visible in the ledger instead of hidden: the provider answers `401`, which classifies as
    `REJECTED` — dispatched, spent, and explicitly not a ceiling.
    """
    if bucket is not COINALYZE:
        return {}
    key = environment.get(COINALYZE_KEY_VARIABLE, "").strip()
    return {"api_key": key} if key else {}


class HttpsQuotaProbe:
    """One connection per host, reused across the ramp, rebuilt whenever it breaks."""

    def __init__(
        self,
        environment: Mapping[str, str],
        connection_factory: ConnectionFactory = open_https_connection,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        """Wire the probe to an environment and a way of opening connections."""
        self._environment = environment
        self._connection_factory = connection_factory
        self._user_agent = user_agent
        self._connections: dict[str, HttpConnection] = {}

    def _connection(self, host: str) -> HttpConnection:
        """Return the live connection for `host`, opening one the first time."""
        if host not in self._connections:
            self._connections[host] = self._connection_factory(host)
        return self._connections[host]

    def _drop(self, host: str) -> None:
        """Forget the connection for `host` so the next request opens a fresh one."""
        connection = self._connections.pop(host, None)
        if connection is not None:
            connection.close()

    def probe(self, bucket: QuotaBucket, path: str) -> ProbeObservation:
        """Issue one GET and describe what came back — including that nothing did.

        `OSError` is converted here rather than propagated, and that conversion is the whole
        control: a request that never reached the provider becomes an observation carrying
        `transport_error`, which the ledger refuses to count as headroom.
        """
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        headers.update(authentication_headers(bucket, self._environment))
        try:
            connection = self._connection(bucket.host)
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            status = response.status
            flat = flatten_headers(response.getheaders())
            response.read()
        except OSError as failure:
            self._drop(bucket.host)
            return ProbeObservation(transport_error=f"{type(failure).__name__}: {failure}")
        return ProbeObservation(status=status, headers=flat)

    def close(self) -> None:
        """Close every connection this probe opened."""
        for host in list(self._connections):
            self._drop(host)
