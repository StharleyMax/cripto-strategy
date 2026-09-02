"""The one client that fetches Coinalyze `daily` history — the only place this task opens a body."""

# `infra/https_quota_probe.py` already solved connection management and authentication for this
# same bucket (`domain/quota_bucket.py`'s `COINALYZE`), but it exists to MEASURE headers and
# deliberately discards the body (`response.read()` with the result thrown away) — it was built
# for `T-03.7`, which never needed the payload. This module is the sibling that DOES want the
# body: same connection strategy, same auth, reused rather than re-derived, and the one new
# thing is that the response bytes come back instead of being drained into nothing.
#
# `domain/coinalyze_daily_series.py` owns what the bytes MEAN (`parse_daily_points`); this
# module only owns getting them, which is the same `infra` > `use_cases` > `domain` split every
# other adapter in this package follows.

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from src.modules.sentimento.domain.quota_bucket import COINALYZE
from src.modules.sentimento.infra.https_quota_probe import (
    ConnectionFactory,
    HttpConnection,
    authentication_headers,
    open_https_connection,
)

DEFAULT_USER_AGENT = "cripto-strategy/T-02.2-coinalyze-one-shot (one-shot; contato via repo)"


@dataclass(frozen=True)
class CoinalizeHistoryResponse:
    """What ONE call to a Coinalyze history endpoint produced — status XOR transport failure.

    Mirrors `domain/ramp_ledger.py`'s `ProbeObservation` on purpose: the same control ("a
    request that never reached the provider must never look like an empty answer") applies
    here, and a second ad hoc encoding of it would be a second place that control could rot.
    """

    status: int | None = None
    body: bytes = b""
    transport_error: str | None = None

    def __post_init__(self) -> None:
        """Reject a response that is neither a dispatch nor a failure to dispatch."""
        if (self.status is None) == (self.transport_error is None):
            raise ValueError(
                "response must carry an HTTP status OR a transport error, never both nor neither"
            )

    @property
    def is_success(self) -> bool:
        """Return whether the provider answered `2xx` — the only status this task acts on."""
        return self.status is not None and 200 <= self.status < 300


class CoinalizeHistoryClient:
    """One keep-alive connection to `api.coinalyze.net`, reused across every call of the sweep."""

    def __init__(
        self,
        environment: Mapping[str, str],
        connection_factory: ConnectionFactory = open_https_connection,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        """Wire the client to an environment (for the API key) and a way of opening connections."""
        self._environment = environment
        self._connection_factory = connection_factory
        self._user_agent = user_agent
        self._connection: HttpConnection | None = None

    def _live_connection(self) -> HttpConnection:
        """Return the live connection, opening one the first time it is needed."""
        if self._connection is None:
            self._connection = self._connection_factory(COINALYZE.host)
        return self._connection

    def _drop(self) -> None:
        """Forget the current connection so the next call opens a fresh one."""
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def fetch(self, path: str) -> CoinalizeHistoryResponse:
        """Issue one GET against `path` and return the body — never raising on a bad status.

        `OSError` is converted here, same control as `HttpsQuotaProbe.probe`: a request that
        never left the machine becomes `transport_error`, and a caller that treated a dead
        connection as "zero history" would silently under-report coverage instead of retrying.
        """
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        headers.update(authentication_headers(COINALYZE, self._environment))
        try:
            connection = self._live_connection()
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            status = response.status
            body = response.read()
        except OSError as failure:
            self._drop()
            return CoinalizeHistoryResponse(transport_error=f"{type(failure).__name__}: {failure}")
        return CoinalizeHistoryResponse(status=status, body=body)

    def close(self) -> None:
        """Close the connection, if one was ever opened."""
        self._drop()
