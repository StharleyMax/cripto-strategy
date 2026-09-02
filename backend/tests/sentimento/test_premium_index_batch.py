"""Parser bench for `premium_index_batch.py`: one control per refusal, plus a live capture."""

from __future__ import annotations

import json

import pytest

from src.modules.sentimento.domain.premium_index_batch import (
    InvalidPremiumIndexPayloadError,
    PremiumIndexReading,
    parse_premium_index_batch,
)

# Bytes captured live `[MEDIDO 2026-09-01]`:
#   curl -sS "https://fapi.binance.com/fapi/v1/premiumIndex" | python3 -m json.tool | head -12
# Two of the 888 entries that date, kept VERBATIM rather than hand-written, so the parser is
# exercised against what Binance actually sends.
_LIVE_CAPTURE_TWO_SYMBOLS = """
[
  {"symbol":"PAXGUSDT","markPrice":"4338.03450682","indexPrice":"4339.91744902",
   "estimatedSettlePrice":"4339.96469304","lastFundingRate":"0.00004516",
   "interestRate":"0.00010000","nextFundingTime":1788307200000,"time":1788302902000},
  {"symbol":"1000XUSDT","markPrice":"0.02084400","indexPrice":"0.02084400",
   "estimatedSettlePrice":"0.00000000","lastFundingRate":"0.00000000",
   "interestRate":"0.00010000","nextFundingTime":1788307200000,"time":1788302902000}
]
"""


def _valid_entry(**overrides: object) -> dict[str, object]:
    """One syntactically valid entry, so each refusal test changes exactly one field."""
    base: dict[str, object] = {
        "symbol": "BTCUSDT",
        "markPrice": "60000.00",
        "indexPrice": "60001.00",
        "estimatedSettlePrice": "60000.50",
        "lastFundingRate": "0.00010000",
        "interestRate": "0.00010000",
        "nextFundingTime": 1_788_307_200_000,
        "time": 1_788_302_902_000,
    }
    base.update(overrides)
    return base


def test_parses_the_live_capture_into_two_readings() -> None:
    """The exact bytes Binance sent parse into two readings, fields preserved raw."""
    readings = parse_premium_index_batch(json.loads(_LIVE_CAPTURE_TWO_SYMBOLS))

    assert readings == (
        PremiumIndexReading(
            symbol="PAXGUSDT",
            mark_price_raw="4338.03450682",
            index_price_raw="4339.91744902",
            estimated_settle_price_raw="4339.96469304",
            last_funding_rate_raw="0.00004516",
            interest_rate_raw="0.00010000",
            next_funding_time=1_788_307_200_000,
            source_time=1_788_302_902_000,
        ),
        PremiumIndexReading(
            symbol="1000XUSDT",
            mark_price_raw="0.02084400",
            index_price_raw="0.02084400",
            estimated_settle_price_raw="0.00000000",
            last_funding_rate_raw="0.00000000",
            interest_rate_raw="0.00010000",
            next_funding_time=1_788_307_200_000,
            source_time=1_788_302_902_000,
        ),
    )


def test_rejects_a_batch_that_is_not_a_list() -> None:
    """The top level of the batch is an array; anything else is refused, not coerced."""
    with pytest.raises(InvalidPremiumIndexPayloadError, match="not a list"):
        parse_premium_index_batch({"symbol": "BTCUSDT"})


def test_rejects_an_entry_that_is_not_an_object() -> None:
    """A stray scalar in the array is refused, naming its index."""
    with pytest.raises(InvalidPremiumIndexPayloadError, match=r"entry 1 is not an object"):
        parse_premium_index_batch([_valid_entry(), "BTCUSDT"])


@pytest.mark.parametrize(
    "field_name",
    [
        "symbol",
        "markPrice",
        "indexPrice",
        "estimatedSettlePrice",
        "lastFundingRate",
        "interestRate",
    ],
)
def test_rejects_a_missing_string_field(field_name: str) -> None:
    """Every required string column is checked, one at a time, and the name travels with it."""
    entry = _valid_entry()
    del entry[field_name]
    with pytest.raises(InvalidPremiumIndexPayloadError, match=field_name):
        parse_premium_index_batch([entry])


def test_rejects_an_empty_string_field() -> None:
    """A blank symbol is not a valid natural key any more than an absent one is."""
    with pytest.raises(InvalidPremiumIndexPayloadError, match="symbol"):
        parse_premium_index_batch([_valid_entry(symbol="")])


@pytest.mark.parametrize("field_name", ["nextFundingTime", "time"])
def test_rejects_a_missing_int_field(field_name: str) -> None:
    """Both millisecond timestamps are required and typed."""
    entry = _valid_entry()
    del entry[field_name]
    with pytest.raises(InvalidPremiumIndexPayloadError, match=field_name):
        parse_premium_index_batch([entry])


def test_rejects_a_boolean_where_a_timestamp_is_expected() -> None:
    """`bool` is an `int` subclass in Python; a stray `true` must not pass as a timestamp."""
    with pytest.raises(InvalidPremiumIndexPayloadError, match="time"):
        parse_premium_index_batch([_valid_entry(time=True)])


def test_rejects_a_repeated_symbol() -> None:
    """`symbol` is the natural key of this batch: a repeat is refused, never silently kept."""
    with pytest.raises(InvalidPremiumIndexPayloadError, match="BTCUSDT.*repeated"):
        parse_premium_index_batch([_valid_entry(), _valid_entry()])


def test_empty_batch_parses_to_no_readings() -> None:
    """An empty array is a valid (if useless) batch — it is not the same failure as `{}`."""
    assert parse_premium_index_batch([]) == ()
