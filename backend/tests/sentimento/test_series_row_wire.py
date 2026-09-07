"""`series_row_wire`: `decode(encode(row)) == row`, field by field, over the 4 `Provenance`.

`test_round_trip_preserves_every_field` is `D1.2`'s falsifier: it asserts field by field rather
than `decoded == row`, so a mutant that swaps two fields' values or drops one from `encode`
fails NAMING the field that diverged, not just "rows differ" (`SPEC-004` §3.2, plan `01` D1.2).
The other tests exercise the three named failure modes — field missing, field extra, field
unparsable — each raising the typed English exception `series_row_wire` declares for it.
"""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.series_row_wire import (
    FIELD_NAMES,
    InvalidWireFieldValueError,
    MissingWireFieldError,
    UnexpectedWireFieldError,
    decode,
    encode,
)

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


def row(**overrides: Any) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_provenance_columns.py`'s helper."""
    columns: dict[str, Any] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_daily_metrics",
        "bucket_end": BUCKET_END_MS,
        "event_time": EVENT_TIME_MS,
        "available_at": EVENT_TIME_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": EVENT_TIME_MS + 45_000,
        "observed_at": EVENT_TIME_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "2026-08-23 00:00:00",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
    }
    columns.update(overrides)
    return SeriesRow(**columns)


def _assert_rows_equal_field_by_field(expected: SeriesRow, actual: SeriesRow) -> None:
    """Compare every one of the 15 fields on its own, naming whichever one first diverges."""
    for field in dataclasses.fields(SeriesRow):
        expected_value = getattr(expected, field.name)
        actual_value = getattr(actual, field.name)
        assert actual_value == expected_value, (
            f"field '{field.name}': decoded {actual_value!r}, expected {expected_value!r}"
        )


# `principal_id` is required non-blank exactly when `provenance is Provenance.HUMAN`
# (`SeriesRow.__post_init__`), so the parametrization supplies it only there — the same
# constraint `test_provenance_columns.py` observes for `HUMANO` rows.
_PROVENANCE_ROWS: tuple[SeriesRow, ...] = (
    row(provenance=Provenance.OBSERVED, is_final=True),
    row(provenance=Provenance.DERIVED, is_final=False),
    row(provenance=Provenance.MODELED, is_final=None),
    row(provenance=Provenance.HUMAN, is_final=None, principal_id="analyst-01"),
)


@pytest.mark.parametrize("original", _PROVENANCE_ROWS, ids=lambda r: r.provenance.name)
def test_round_trip_preserves_every_field(original: SeriesRow) -> None:
    """`decode(encode(row)) == row`, checked field by field, for all 4 `Provenance` members."""
    decoded = decode(encode(original))
    _assert_rows_equal_field_by_field(original, decoded)


def test_encode_produces_exactly_the_15_named_string_keys() -> None:
    """`encode`'s output has exactly `FIELD_NAMES`' 15 keys, and every value is `str`."""
    encoded = encode(row())
    assert set(encoded.keys()) == set(FIELD_NAMES)
    assert len(encoded) == 15
    assert all(isinstance(value, str) for value in encoded.values())


def test_optional_fields_round_trip_as_none() -> None:
    """`is_final=None` and `principal_id=None` (the non-`HUMANO` default) survive the wire."""
    original = row(provenance=Provenance.DERIVED, is_final=None)
    decoded = decode(encode(original))
    assert decoded.is_final is None
    assert decoded.principal_id is None


def test_decode_missing_field_names_it() -> None:
    """Dropping `is_final` names it, via `MissingWireFieldError`.

    This is the exact mutation `D1.2`'s morde names — the failure is a typed exception naming
    `is_final`, never a silent `None` or a bare `KeyError`.
    """
    encoded = dict(encode(row()))
    del encoded["is_final"]
    with pytest.raises(MissingWireFieldError, match="is_final"):
        decode(encoded)


def test_decode_extra_field_names_it() -> None:
    """A key none of the 15 columns owns raises `UnexpectedWireFieldError` naming it."""
    encoded = dict(encode(row()))
    encoded["not_a_series_row_column"] = "x"
    with pytest.raises(UnexpectedWireFieldError, match="not_a_series_row_column"):
        decode(encoded)


def test_decode_invalid_integer_names_the_field() -> None:
    """A non-decimal value in an integer column raises `InvalidWireFieldValueError` naming it."""
    encoded = dict(encode(row()))
    encoded["bucket_end"] = "not-a-number"
    with pytest.raises(InvalidWireFieldValueError, match="bucket_end"):
        decode(encoded)


def test_decode_invalid_enum_name_names_the_field() -> None:
    """A value that is not a `Provenance` member name raises `InvalidWireFieldValueError`."""
    encoded = dict(encode(row()))
    encoded["provenance"] = "NAO_EXISTE"
    with pytest.raises(InvalidWireFieldValueError, match="provenance"):
        decode(encoded)


def test_decode_invalid_bool_marker_names_the_field() -> None:
    """A value that is neither `'0'`, `'1'` nor the absence marker raises, naming the field."""
    encoded = dict(encode(row()))
    encoded["is_final"] = "yes"
    with pytest.raises(InvalidWireFieldValueError, match="is_final"):
        decode(encoded)


def test_swapped_field_values_break_round_trip_and_name_the_field() -> None:
    """`D1.2`'s morde, reproduced directly.

    Swapping two fields' encoded values must not decode back into the original row silently —
    the field-by-field comparison must name one of them.
    """
    original = row()
    encoded = dict(encode(original))
    encoded["event_time"], encoded["available_at"] = encoded["available_at"], encoded["event_time"]
    decoded = decode(encoded)
    with pytest.raises(AssertionError, match="field 'event_time'"):
        _assert_rows_equal_field_by_field(original, decoded)
