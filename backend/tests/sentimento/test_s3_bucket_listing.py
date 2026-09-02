"""`D7.8`: a truncated listing without a way to continue, or a caller who stops early, fails."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.s3_bucket_listing import (
    BucketListingPage,
    TruncatedWithoutContinuationTokenError,
    UnpaginatedTruncationError,
    merge_pages,
)

CONTINUE_FROM = "continue-from-here"  # noqa: S105 - an opaque pagination marker, not a secret


def test_a_truncated_page_with_no_continuation_token_is_refused_at_construction() -> None:
    """A parser that drops `NextContinuationToken` must not look like 'listing complete'."""
    with pytest.raises(TruncatedWithoutContinuationTokenError):
        BucketListingPage(keys=("a",), prefixes=(), is_truncated=True, next_continuation_token=None)


def test_a_truncated_page_with_a_token_constructs_fine() -> None:
    """The positive control: `is_truncated=True` is fine as long as a token comes with it."""
    page = BucketListingPage(
        keys=("a",),
        prefixes=(),
        is_truncated=True,
        next_continuation_token=CONTINUE_FROM,  # noqa: S106
    )
    assert page.next_continuation_token == CONTINUE_FROM


def test_a_complete_untruncated_page_needs_no_token() -> None:
    """The common case: the last page, nothing more to fetch."""
    page = BucketListingPage(
        keys=("a", "b"), prefixes=(), is_truncated=False, next_continuation_token=None
    )
    assert page.is_truncated is False


def test_merge_pages_concatenates_keys_across_pages_in_order() -> None:
    """Two pages, drained fully, merge into one tuple of all their keys."""
    page_one = BucketListingPage(
        keys=("k1", "k2"),
        prefixes=(),
        is_truncated=True,
        next_continuation_token=CONTINUE_FROM,  # noqa: S106
    )
    page_two = BucketListingPage(
        keys=("k3",), prefixes=(), is_truncated=False, next_continuation_token=None
    )

    assert merge_pages((page_one, page_two)) == ("k1", "k2", "k3")


def test_d7_8_the_falsifier_merging_only_the_first_of_two_truncated_pages_is_refused() -> None:
    """THE FALSIFIER: a caller that stops after the first (still-truncated) page must be refused.

    This is the exact mutation `D7.8` names — `IsTruncated=true` without paginating further —
    reproduced directly against `merge_pages` rather than only through the HTTP loop, so the
    invariant is provably load-bearing on its own.
    """
    page_one = BucketListingPage(
        keys=tuple(f"k{i}" for i in range(500)),
        prefixes=(),
        is_truncated=True,
        next_continuation_token=CONTINUE_FROM,  # noqa: S106
    )

    with pytest.raises(UnpaginatedTruncationError):
        merge_pages((page_one,))


def test_merge_pages_of_an_empty_sequence_is_an_empty_listing() -> None:
    """No pages fetched is a degenerate but valid case: an empty listing, not an error."""
    assert merge_pages(()) == ()
