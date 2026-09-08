"""`RedisStreamSeriesSink`/`RedisPremiumIndexSink` over a REAL (fake) Redis Streams server.

`D1.4` (half): `grep -rn 'RedisStreamPublisher(' backend/src --include='*.py' | grep -v
redis_stream_bus.py | wc -l` reads at least 1 once `redis_stream_series_sink.py` exists — the
one call site is `RedisStreamSeriesSink.__init__`, exercised indirectly by every test below.

`test_a_failed_xadd_propagates_instead_of_being_swallowed` is the falsifier plan item 1.4 names
literally: "falha de XADD propaga (nunca `except` vazio)". A regression that wrapped `accept` (or
`RedisPremiumIndexSink.write`) in a blanket `except Exception: pass` would make this test fail to
raise — the one case a green `test_accept_publishes_one_row...` cannot rule out on its own.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator, Sequence
from typing import Any

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.premium_index_batch import PremiumIndexReading
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.redis_resp_client import (
    RedisCommandError,
    connect_resp2,
    open_tcp_socket,
)
from src.modules.sentimento.infra.redis_stream_bus import RedisStreamConsumerGroup
from src.modules.sentimento.infra.redis_stream_series_sink import (
    RedisPremiumIndexSink,
    RedisStreamSeriesSink,
)
from src.modules.sentimento.infra.series_row_wire import decode

STREAM = "md.series.write"
GROUP = "single_writer"
CONSUMER = "writer-1"
BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


@pytest.fixture
def redis_address() -> Iterator[tuple[str, int]]:
    """Start a real, loopback-only `fakeredis` Streams server and stop it after the test."""
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.socket.getsockname()
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


def _row(**overrides: Any) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_series_row_wire.py`'s helper."""
    columns: dict[str, Any] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_premium_index",
        "bucket_end": BUCKET_END_MS,
        "event_time": EVENT_TIME_MS,
        "available_at": EVENT_TIME_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": EVENT_TIME_MS + 45_000,
        "observed_at": EVENT_TIME_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "premiumIndex",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
        "value_raw": "1.0",
    }
    columns.update(overrides)
    return SeriesRow(**columns)


def _sink(address: tuple[str, int]) -> RedisStreamSeriesSink:
    host, port = address
    return RedisStreamSeriesSink(connect_resp2(open_tcp_socket(host, port)), STREAM)


def _group(address: tuple[str, int]) -> RedisStreamConsumerGroup:
    host, port = address
    connection = connect_resp2(open_tcp_socket(host, port))
    return RedisStreamConsumerGroup(connection, STREAM, GROUP, CONSUMER)


def _provision_group(address: tuple[str, int]) -> None:
    """Create the consumer group BEFORE anything publishes (`test_redis_stream_bus.py`'s shape).

    `ensure_group("$")` only sees entries published AFTER it runs, so the group has to exist
    before the first `accept`/`write` call in every test below.
    """
    _group(address).ensure_group()


def _read_all_published_rows(address: tuple[str, int], count: int) -> tuple[SeriesRow, ...]:
    """Read back `count` entries via a fresh connection to the group, decoded — the wire round-trip.

    Does NOT call `ensure_group()` again: the caller already provisioned the group
    (`_provision_group`) before publishing. A SECOND `ensure_group()` call right before
    `read_new`/`read_pending` on a non-empty PEL is the exact `fakeredis` double quirk
    `test_redis_series_write_queue.py`'s `_queue` docstring already measured and named — this
    helper avoids it by construction.
    """
    messages = _group(address).read_new(count)
    return tuple(_decode_fields(message.fields) for message in messages)


def _decode_fields(fields: dict[bytes, bytes]) -> SeriesRow:
    return decode({name.decode("ascii"): value.decode("ascii") for name, value in fields.items()})


def test_accept_publishes_one_row_that_round_trips_through_the_wire(
    redis_address: tuple[str, int],
) -> None:
    """`accept` encodes the row and `XADD`s it; reading it back decodes to the same row.

    This is "o equivalente do `forceOrder`" (plan item 1.4): `accept` is the single per-event
    call a future `forceOrder` producer makes, one row at a time — no batching involved.
    """
    _provision_group(redis_address)
    sink = _sink(redis_address)
    row = _row()

    sink.accept(row)

    [published] = _read_all_published_rows(redis_address, count=10)
    assert published == row


def test_a_failed_xadd_propagates_instead_of_being_swallowed(
    redis_address: tuple[str, int],
) -> None:
    """A `WRONGTYPE` reply from `XADD` propagates out of `accept` — no `except` catches it.

    Clobbering the stream key with a plain string BEFORE `accept` runs is a real way `XADD` can
    fail (`WRONGTYPE Operation against a key holding the wrong kind of value`), not a fabricated
    double — the same class of failure a real `RedisCommandError` covers in production (network
    drop, `NOAUTH`, ...). `SPEC-004` §3.1 hands this exact exception up to the collector process,
    which is only possible if this sink never swallows it.
    """
    host, port = redis_address
    setup = connect_resp2(open_tcp_socket(host, port))
    setup.command("SET", STREAM, "not-a-stream")
    sink = _sink(redis_address)

    with pytest.raises(RedisCommandError):
        sink.accept(_row())


def test_premium_index_sink_publishes_every_row_the_injected_mapping_derives(
    redis_address: tuple[str, int],
) -> None:
    """`RedisPremiumIndexSink.write` calls `to_rows` per reading and publishes each row in order.

    Two readings map to ONE row and TWO rows respectively, proving the adapter neither assumes a
    fixed one-reading-to-one-row ratio nor drops any of what `to_rows` returns.
    """
    _provision_group(redis_address)
    premium_index_sink = RedisPremiumIndexSink(_sink(redis_address), _to_rows_one_or_two)
    readings = (
        PremiumIndexReading(
            symbol="BTCUSDT",
            mark_price_raw="65000.10000000",
            index_price_raw="65001.20000000",
            estimated_settle_price_raw="65000.00000000",
            last_funding_rate_raw="0.00010000",
            interest_rate_raw="0.00010000",
            next_funding_time=EVENT_TIME_MS + 3_600_000,
            source_time=EVENT_TIME_MS,
        ),
        PremiumIndexReading(
            symbol="ETHUSDT",
            mark_price_raw="3200.10000000",
            index_price_raw="3200.20000000",
            estimated_settle_price_raw="3200.00000000",
            last_funding_rate_raw="0.00020000",
            interest_rate_raw="0.00010000",
            next_funding_time=EVENT_TIME_MS + 3_600_000,
            source_time=EVENT_TIME_MS,
        ),
    )

    premium_index_sink.write(EVENT_TIME_MS, readings)

    published = _read_all_published_rows(redis_address, count=10)
    assert [row.symbol for row in published] == ["BTCUSDT", "ETHUSDT", "ETHUSDT"]


def _to_rows_one_or_two(received_at: int, reading: PremiumIndexReading) -> Sequence[SeriesRow]:
    """Test double for `PremiumIndexReadingToRows`: BTCUSDT -> 1 row, everything else -> 2 rows."""
    if reading.symbol == "BTCUSDT":
        return (_row(symbol=reading.symbol, event_time=received_at),)
    return (
        _row(symbol=reading.symbol, event_time=received_at),
        _row(symbol=reading.symbol, event_time=received_at, src_label_raw="funding_rate"),
    )
