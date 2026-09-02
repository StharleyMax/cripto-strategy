"""GET the `data.binance.vision` bucket listing (S3 `ListObjectsV2`), and drain it correctly."""

# Same connection shape as the other clients in this package: `http.client`, a connection FACTORY
# the test suite injects a fake into, one connection per call. This is the ONLY file that parses
# the S3 `ListBucketResult` XML — `domain/s3_bucket_listing.py` owns what a page MEANS
# (`BucketListingPage`, `merge_pages`) and never touches XML or a socket.
#
# `list_all_object_keys` is the loop `T-07.1`/`D7.8` mandates: it does not stop at the first page
# that answers — it keeps asking, passing back `NextContinuationToken`, until a page reports
# `IsTruncated=false`, and then hands the accumulated keys through `merge_pages`, which is the
# second half of the same invariant (refusing a sequence that stopped one page too early).

from __future__ import annotations

import http.client
import xml.etree.ElementTree as ElementTree
from collections.abc import Callable, Mapping
from typing import Final, Protocol
from urllib.parse import quote, urlencode

from src.modules.sentimento.domain.s3_bucket_listing import BucketListingPage, merge_pages

DUMP_BUCKET_HOST: Final[str] = "data.binance.vision"

# The S3 XML namespace every `ListBucketResult` element carries — `ElementTree.find` needs it
# verbatim (Clark notation) to locate children by tag.
_S3_NAMESPACE: Final[str] = "{http://s3.amazonaws.com/doc/2006-03-01/}"

DEFAULT_MAX_KEYS: Final[int] = 1000


class HttpResponseLike(Protocol):
    """The two things this client needs from a response."""

    @property
    def status(self) -> int:
        """Return the HTTP status line's code."""
        ...

    def read(self) -> bytes:
        """Drain the body, which MUST happen before the connection can be reused."""
        ...


class HttpConnectionLike(Protocol):
    """A connection to one host — the same shape every other client in this package depends on."""

    def request(
        self,
        method: str,
        url: str,
        body: None = ...,
        headers: Mapping[str, str] = ...,
    ) -> None:
        """Send one request."""
        ...

    def getresponse(self) -> HttpResponseLike:
        """Read the response for the request just sent."""
        ...

    def close(self) -> None:
        """Drop the connection."""
        ...


ConnectionFactory = Callable[[str], HttpConnectionLike]


def open_https_connection(host: str) -> HttpConnectionLike:  # pragma: no cover - the socket itself
    """Open a real TLS connection to `host` — the only line here that touches the network."""
    return http.client.HTTPSConnection(host, timeout=20.0)


class UnexpectedListingStatusError(Exception):
    """The bucket listing endpoint answered something other than `200`."""


class MalformedListingXmlError(Exception):
    """The body did not parse as XML, or was not a `ListBucketResult`."""


class BinanceDumpBucketListingClient:
    """One connection per page, to the public `data.binance.vision` bucket listing endpoint."""

    def __init__(
        self,
        connection_factory: ConnectionFactory = open_https_connection,
        host: str = DUMP_BUCKET_HOST,
    ) -> None:
        """Wire the client to a host and a way of opening connections; nothing is sent here."""
        self._connection_factory = connection_factory
        self._host = host

    def list_page(
        self,
        prefix: str,
        delimiter: str | None = None,
        continuation_token: str | None = None,
        max_keys: int = DEFAULT_MAX_KEYS,
    ) -> BucketListingPage:
        """Fetch ONE page of `ListObjectsV2` — never loops; `list_all_object_keys` does that."""
        params: dict[str, str] = {"list-type": "2", "prefix": prefix, "max-keys": str(max_keys)}
        if delimiter is not None:
            params["delimiter"] = delimiter
        if continuation_token is not None:
            params["continuation-token"] = continuation_token
        path = f"/?{urlencode(params, quote_via=quote)}"

        connection = self._connection_factory(self._host)
        try:
            connection.request("GET", path, headers={"Accept": "application/xml"})
            response = connection.getresponse()
            body = response.read()
            if response.status != 200:
                raise UnexpectedListingStatusError(
                    f"{self._host}{path} responded {response.status}, expected 200: {body[:200]!r}"
                )
            return _parse_listing(body)
        finally:
            connection.close()


def list_all_object_keys(
    client: BinanceDumpBucketListingClient,
    prefix: str,
    delimiter: str | None = None,
    max_keys: int = DEFAULT_MAX_KEYS,
) -> tuple[str, ...]:
    """Drain every page of `prefix`, following `NextContinuationToken` until `IsTruncated=false`.

    `D7.8`: `[MEDIDO]` 980 prefixes against `MaxKeys=1000` is a folga of only 20 — a universe that
    grows past 1000 in one page is not a hypothetical, it is the next backfill. `merge_pages`
    refuses the result if this loop is ever changed to stop early.
    """
    pages: list[BucketListingPage] = []
    token: str | None = None
    while True:
        page = client.list_page(
            prefix=prefix, delimiter=delimiter, continuation_token=token, max_keys=max_keys
        )
        pages.append(page)
        if not page.is_truncated:
            break
        token = page.next_continuation_token
    return merge_pages(tuple(pages))


def _parse_listing(body: bytes) -> BucketListingPage:
    """Parse one `ListBucketResult` XML body into a `BucketListingPage`."""
    try:
        root = ElementTree.fromstring(body)  # noqa: S314 - the publisher's own bucket XML
    except ElementTree.ParseError as failure:
        raise MalformedListingXmlError(
            f"listing body is not well-formed XML: {failure}"
        ) from failure

    is_truncated_text = _child_text(root, "IsTruncated")
    if is_truncated_text is None:
        raise MalformedListingXmlError("listing body has no <IsTruncated>; not a ListBucketResult")
    is_truncated = is_truncated_text.strip().lower() == "true"

    keys = tuple(
        text
        for contents in root.findall(f"{_S3_NAMESPACE}Contents")
        if (text := _child_text(contents, "Key")) is not None
    )
    prefixes = tuple(
        text
        for common in root.findall(f"{_S3_NAMESPACE}CommonPrefixes")
        if (text := _child_text(common, "Prefix")) is not None
    )
    return BucketListingPage(
        keys=keys,
        prefixes=prefixes,
        is_truncated=is_truncated,
        next_continuation_token=_child_text(root, "NextContinuationToken"),
    )


def _child_text(parent: ElementTree.Element, tag: str) -> str | None:
    """Return the text of `parent`'s `<tag>` child, or `None` if it is absent."""
    child = parent.find(f"{_S3_NAMESPACE}{tag}")
    return child.text if child is not None else None
