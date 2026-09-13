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
from dataclasses import dataclass, field

from src.modules.sentimento.domain.quota_bucket import COINALYZE
from src.modules.sentimento.infra.https_quota_probe import (
    ConnectionFactory,
    HttpConnection,
    authentication_headers,
    flatten_headers,
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

    # ── `T-05.5` / `RS-3.2`: THE RESPONSE HEADERS, BECAUSE THE RECOIL IS NOT OURS TO INVENT ──
    #
    # Empty by default, so every caller written before `T-05.5` reads exactly as it did. What
    # needs them is the regime collector: `RS-3.2` obeys `Retry-After` FROM THE RESPONSE and
    # forbids a fixed blind back-off, and the waste of guessing is measured — observed values
    # were 49,1 s / 56,8 s / 59,0 s `[DOC: MEDICAO §3]`, so a flat 60 s throws away ~18% of the
    # window against the first of them.
    #
    # ⚠️ A `200` FROM THIS PROVIDER STILL CARRIES NO QUOTA (`quota_bucket.COINALYZE` is BLIND):
    # this field does NOT turn the bucket sighted, and `SlidingQuotaWindow`'s local count stays
    # the only accounting there is. The only header this collector ever reads is the one that
    # rides a `429`.
    headers: Mapping[str, str] = field(default_factory=dict)

    def header(self, name: str) -> str | None:
        """Read a header case-insensitively, returning `None` when it is absent.

        `RFC 9110` field names are case-insensitive and providers do vary; a caller matching
        `"Retry-After"` exactly against a `retry-after` key would fall through to
        `POLICY_NO_RETRY_AFTER` and guess a pause the provider had actually specified — a
        defect that looks exactly like a provider that sent no header.
        """
        wanted = name.lower()
        for key, value in self.headers.items():
            if key.lower() == wanted:
                return value
        return None

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
            # `flatten_headers` and not a dict comprehension: it lower-cases the keys and
            # JOINS legal repeats instead of dropping all but the last, which is the same
            # reading `HttpsQuotaProbe` already does over this very connection.
            headers = flatten_headers(response.getheaders())
            body = response.read()
        except OSError as failure:
            self._drop()
            return CoinalizeHistoryResponse(transport_error=f"{type(failure).__name__}: {failure}")
        return CoinalizeHistoryResponse(status=status, body=body, headers=headers)

    def close(self) -> None:
        """Close the connection, if one was ever opened."""
        self._drop()
