"""`AvailabilityPollOutcome`'s XOR, and the pure parse of a Binance `/futures/data/*` body."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.availability_poll import (
    AvailabilityPollOutcome,
    MalformedAvailabilityResponseError,
    parse_binance_latest_event_time_ms,
)


def test_an_outcome_cannot_carry_both_status_and_transport_error() -> None:
    """An outcome cannot carry both a status and a transport error."""
    with pytest.raises(ValueError, match="OU"):
        AvailabilityPollOutcome(status=200, transport_error="boom")


def test_an_outcome_must_carry_one_of_status_or_transport_error() -> None:
    """An outcome must carry one of status or transport error."""
    with pytest.raises(ValueError, match="OU"):
        AvailabilityPollOutcome()


def test_a_transport_error_cannot_carry_a_parsed_timestamp() -> None:
    """There was no response — a timestamp here would be read off nothing."""
    with pytest.raises(ValueError, match="latest_event_time_ms"):
        AvailabilityPollOutcome(transport_error="boom", latest_event_time_ms=123)


def test_is_success_is_true_only_for_200() -> None:
    """`is_success` is true only for a `200` status."""
    assert AvailabilityPollOutcome(status=200).is_success is True
    assert AvailabilityPollOutcome(status=429).is_success is False
    assert AvailabilityPollOutcome(transport_error="boom").is_success is False


def test_parse_reads_the_last_elements_timestamp() -> None:
    """Newest LAST, per the family's own ordering — `limit=1` still exercises the same path."""
    body = b'[{"symbol": "BTCUSDT", "sumOpenInterest": "1", "timestamp": 1700000000000}]'

    assert parse_binance_latest_event_time_ms(body) == 1700000000000


def test_parse_of_an_empty_array_is_none_not_an_error() -> None:
    """A legitimately empty answer, same class of fact `parse_daily_points` also returns `()`."""
    assert parse_binance_latest_event_time_ms(b"[]") is None


def test_parse_of_invalid_json_raises() -> None:
    """Parsing of invalid JSON raises."""
    with pytest.raises(MalformedAvailabilityResponseError, match="JSON"):
        parse_binance_latest_event_time_ms(b"not json")


def test_parse_of_a_non_list_body_raises() -> None:
    """Parsing of a non-list body raises."""
    with pytest.raises(MalformedAvailabilityResponseError, match="lista"):
        parse_binance_latest_event_time_ms(b'{"timestamp": 1}')


def test_parse_of_an_element_without_timestamp_raises() -> None:
    """Parsing of an element without a `'timestamp'` field raises."""
    with pytest.raises(MalformedAvailabilityResponseError, match="timestamp"):
        parse_binance_latest_event_time_ms(b'[{"sumOpenInterest": "1"}]')


def test_parse_of_a_non_integer_timestamp_raises() -> None:
    """Parsing of a non-integer timestamp raises."""
    with pytest.raises(MalformedAvailabilityResponseError, match="timestamp"):
        parse_binance_latest_event_time_ms(b'[{"timestamp": "not-a-number"}]')
