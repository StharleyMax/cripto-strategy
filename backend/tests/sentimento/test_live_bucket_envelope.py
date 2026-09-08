"""`LiveBucketEnvelope` — the two guards `__post_init__` states but no existing test exercised.

`ADR-005/D2`'s five terms plus `is_final`. `test_series_live_route.py` only ever builds VALID
envelopes through `_FiniteSource`. Coverage before this file: 82% (2 lines uncovered — the two
`raise` branches), measured via `bash scripts/check-coverage-layers.sh`'s own `coverage.xml` on
`2026-09-08`.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.live_bucket_envelope import (
    InvalidLiveBucketEnvelopeError,
    LiveBucketEnvelope,
)


def _envelope(**overrides: object) -> LiveBucketEnvelope:
    """Build a valid envelope — every field `ADR-005/D2` fixes, with sane defaults."""
    fields: dict[str, object] = {
        "bucket_open_ts": "2026-09-08T00:00:00Z",
        "cvd_delta_parcial": "1.5",
        "last_price": "65000.10",
        "n_trades": 3,
        "seq": 7,
        "is_final": False,
    }
    fields.update(overrides)
    return LiveBucketEnvelope(**fields)  # type: ignore[arg-type]


def test_a_valid_envelope_builds_without_error() -> None:
    """The happy path: every field within `ADR-005/D2`'s bounds, nothing conditional triggered."""
    envelope = _envelope()

    assert envelope.n_trades == 3
    assert envelope.seq == 7
    assert envelope.is_final is False


def test_a_negative_n_trades_is_refused() -> None:
    """`__post_init__`: a trade count cannot be negative — never silently clamped to zero."""
    with pytest.raises(InvalidLiveBucketEnvelopeError, match="n_trades"):
        _envelope(n_trades=-1)


def test_a_negative_seq_is_refused() -> None:
    """`ADR-005/D2`: `seq` is a monotonic counter, so negative is never a valid starting point."""
    with pytest.raises(InvalidLiveBucketEnvelopeError, match="seq"):
        _envelope(seq=-1)


def test_zero_n_trades_and_zero_seq_are_both_accepted() -> None:
    """Zero is the boundary, not the refusal — only NEGATIVE values are malformed."""
    envelope = _envelope(n_trades=0, seq=0)

    assert envelope.n_trades == 0
    assert envelope.seq == 0


def test_to_wire_projects_the_exact_six_field_names_verbatim() -> None:
    """`ADR-005/D2`'s five terms plus `is_final` — never renamed, never a seventh field added."""
    envelope = _envelope(is_final=True)

    wire = envelope.to_wire()

    assert set(wire) == {
        "bucket_open_ts",
        "cvd_delta_parcial",
        "last_price",
        "n_trades",
        "seq",
        "is_final",
    }
    assert wire["is_final"] is True
