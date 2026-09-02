"""One page of an S3-style bucket listing, and the invariant that catches a truncated listing."""

# `SPEC-001` §5.7, `T-07.1` (`CA-F3-5`): the `data.binance.vision` bucket listing paginates by
# `IsTruncated` + `NextContinuationToken`, `[MEDIDO]` 980 prefixes against `MaxKeys=1000` — a
# margin of only 20, and the universe grows (`+28 symbols in 30 d`, `+136 in 90 d`). `D7.8` demands
# the listing FAIL if `IsTruncated=true` without a subsequent page, rather than quietly returning a
# partial listing that looks complete.
#
# This module carries the invariant in two places:
#
#   * `BucketListingPage.__post_init__` refuses to construct a page that claims `is_truncated=True`
#     with no token to continue from — the defence against a parser that silently drops the token.
#   * `merge_pages` refuses a fetched SEQUENCE of pages whose last page is still truncated — the
#     defence against a caller that stops fetching one page too early.
#
# `domain`: no socket, no XML parser. A page arrives as already-parsed data.

from __future__ import annotations

from dataclasses import dataclass


class TruncatedWithoutContinuationTokenError(Exception):
    """A page claims more results exist but carries no token to fetch them with."""


class UnpaginatedTruncationError(Exception):
    """A fetched sequence of pages stopped while the last one still had more results."""


@dataclass(frozen=True)
class BucketListingPage:
    """One page of a bucket listing: the keys, the common prefixes, and whether more remain."""

    keys: tuple[str, ...]
    prefixes: tuple[str, ...]
    is_truncated: bool
    next_continuation_token: str | None

    def __post_init__(self) -> None:
        """Refuse a page that says more results exist but hands back no way to fetch them."""
        if self.is_truncated and self.next_continuation_token is None:
            raise TruncatedWithoutContinuationTokenError(
                "page has is_truncated=True but no next_continuation_token — a parser that "
                "drops the token silently would look identical to 'the listing is complete'"
            )


def merge_pages(pages: tuple[BucketListingPage, ...]) -> tuple[str, ...]:
    """Merge the `keys` of `pages`, fetched in order — refusing a sequence that stopped early.

    `D7.8`: `pages[-1].is_truncated` being `True` means the caller stopped asking for more while
    the provider still had results. Returning the partial union here would be indistinguishable
    from a complete listing to every caller downstream, which is exactly the silent failure the
    DoD names.
    """
    if pages and pages[-1].is_truncated:
        raise UnpaginatedTruncationError(
            f"the last of {len(pages)} page(s) still has is_truncated=True; fetch the next page "
            "with its next_continuation_token before trusting this listing as complete"
        )
    keys: list[str] = []
    for page in pages:
        keys.extend(page.keys)
    return tuple(keys)
