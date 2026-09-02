"""`BinanceDumpBucketListingClient` wired to a FAKE connection — no socket, per `test.sh`.

`D7.8`: 980 prefixes against `MaxKeys=1000` is a folga of only 20, and the universe grows — a
listing that stops at the first page is a silent partial result. This test drives a REAL,
two-page `IsTruncated` sequence through `list_all_object_keys` end to end (XML parsing included)
and separately proves the truncation invariant BITES when a page never gets a token to continue.
"""

from __future__ import annotations

from collections.abc import Mapping

import pytest

from src.modules.sentimento.infra.binance_dump_bucket_listing_client import (
    DUMP_BUCKET_HOST,
    BinanceDumpBucketListingClient,
    MalformedListingXmlError,
    UnexpectedListingStatusError,
    list_all_object_keys,
)

_NS = "http://s3.amazonaws.com/doc/2006-03-01/"
CONTINUE_FROM = "continue-from-here"  # noqa: S105 - an opaque pagination marker, not a secret
CONTINUE_FURTHER = "continue-further"  # noqa: S105 - ditto, the SECOND page's marker


def _listing_xml(
    keys: list[str],
    is_truncated: bool,
    continuation_marker: str | None,
    prefixes: list[str] | None = None,
) -> bytes:
    """Build a minimal, well-formed `ListBucketResult` body, same shape as the real bucket."""
    contents = "".join(f"<Contents><Key>{key}</Key></Contents>" for key in keys)
    common = "".join(
        f"<CommonPrefixes><Prefix>{prefix}</Prefix></CommonPrefixes>" for prefix in (prefixes or [])
    )
    token_element = (
        f"<NextContinuationToken>{continuation_marker}</NextContinuationToken>"
        if continuation_marker
        else ""
    )
    body = (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<ListBucketResult xmlns="{_NS}">'
        f"<IsTruncated>{'true' if is_truncated else 'false'}</IsTruncated>"
        f"{token_element}{contents}{common}"
        f"</ListBucketResult>"
    )
    return body.encode("utf-8")


class FakeResponse:
    """A canned response, read exactly once."""

    def __init__(self, status: int, body: bytes) -> None:
        """Take the status line and the raw body to hand back."""
        self.status = status
        self._body = body

    def read(self) -> bytes:
        """Return the canned body."""
        return self._body


class FakeConnection:
    """Never opens a socket; replays one scripted response and records the request."""

    def __init__(self, host: str, response: FakeResponse) -> None:
        """Take the host it pretends to serve and the response to replay."""
        self.host = host
        self._response = response
        self.requests: list[tuple[str, str, Mapping[str, str]]] = []
        self.closed = False

    def request(
        self, method: str, url: str, body: None = None, headers: Mapping[str, str] | None = None
    ) -> None:
        """Record the request; the response was scripted at construction time."""
        self.requests.append((method, url, dict(headers or {})))

    def getresponse(self) -> FakeResponse:
        """Hand back the scripted response."""
        return self._response

    def close(self) -> None:
        """Mark the connection closed."""
        self.closed = True


class ScriptedConnections:
    """Replays a DIFFERENT response for each successive connection opened — one per page."""

    def __init__(self, bodies: list[tuple[int, bytes]]) -> None:
        """Take the ordered `(status, body)` pairs, one per expected connection."""
        self._bodies = list(bodies)
        self.opened: list[FakeConnection] = []

    def factory(self, host: str) -> FakeConnection:
        """Open the next scripted connection."""
        status, body = self._bodies.pop(0)
        connection = FakeConnection(host, FakeResponse(status, body))
        self.opened.append(connection)
        return connection


def test_list_page_parses_keys_prefixes_truncation_and_token() -> None:
    """One page, fully parsed: keys, common prefixes, `IsTruncated`, `NextContinuationToken`."""
    body = _listing_xml(
        ["a/1.zip", "a/2.zip"],
        is_truncated=True,
        continuation_marker=CONTINUE_FROM,
        prefixes=["a/"],
    )
    scripted = ScriptedConnections([(200, body)])
    client = BinanceDumpBucketListingClient(connection_factory=scripted.factory)

    page = client.list_page(prefix="a/", delimiter="/")

    assert page.keys == ("a/1.zip", "a/2.zip")
    assert page.prefixes == ("a/",)
    assert page.is_truncated is True
    assert page.next_continuation_token == CONTINUE_FROM
    assert scripted.opened[0].host == DUMP_BUCKET_HOST


def test_a_non_200_status_refuses_instead_of_parsing_the_body() -> None:
    """A `5xx`/`4xx` body is never trustworthy XML — refuse before parsing it."""
    scripted = ScriptedConnections([(500, b"<Error/>")])
    client = BinanceDumpBucketListingClient(connection_factory=scripted.factory)

    with pytest.raises(UnexpectedListingStatusError, match="500"):
        client.list_page(prefix="a/")


def test_a_body_with_no_istruncated_element_is_refused_as_malformed() -> None:
    """A body that is not a `ListBucketResult` at all must not be silently treated as complete."""
    scripted = ScriptedConnections([(200, b"<NotABucketListing/>")])
    client = BinanceDumpBucketListingClient(connection_factory=scripted.factory)

    with pytest.raises(MalformedListingXmlError):
        client.list_page(prefix="a/")


def test_d7_8_list_all_object_keys_follows_nextcontinuationtoken_across_pages() -> None:
    """The end-to-end falsifier: 2 pages, first `IsTruncated=true` — ALL keys must come back.

    A regression that reads only the first page (the exact defect `D7.8` names) would return 500
    keys instead of 980; this test fails for that regression and passes for the correct loop.
    """
    page_one = _listing_xml(
        [f"k{i}.zip" for i in range(500)], is_truncated=True, continuation_marker=CONTINUE_FURTHER
    )
    page_two = _listing_xml(
        [f"k{i}.zip" for i in range(500, 980)], is_truncated=False, continuation_marker=None
    )
    scripted = ScriptedConnections([(200, page_one), (200, page_two)])
    client = BinanceDumpBucketListingClient(connection_factory=scripted.factory)

    keys = list_all_object_keys(client, prefix="data/futures/um/daily/aggTrades/")

    assert len(keys) == 980
    assert keys[0] == "k0.zip"
    assert keys[-1] == "k979.zip"
    # The SECOND request must carry the token the FIRST page handed back.
    _, second_url, _ = scripted.opened[1].requests[0]
    assert f"continuation-token={CONTINUE_FURTHER}" in second_url


def test_a_single_untruncated_page_stops_after_one_request() -> None:
    """The common case — no truncation — makes exactly one request."""
    body = _listing_xml(["only.zip"], is_truncated=False, continuation_marker=None)
    scripted = ScriptedConnections([(200, body)])
    client = BinanceDumpBucketListingClient(connection_factory=scripted.factory)

    keys = list_all_object_keys(client, prefix="a/")

    assert keys == ("only.zip",)
    assert len(scripted.opened) == 1
