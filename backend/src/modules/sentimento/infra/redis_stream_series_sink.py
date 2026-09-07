"""The publication port both live collectors converge on: `encode(row)` then `XADD`.

`SPEC-004` §3.1 ("publicacao"), literal: *"por evento (`forceOrder`) e por leitura
(`premiumIndex`): `encode(row)` (§3.2) -> `RedisStreamPublisher.publish(fields)`; nenhum outro
`XADD` (`RN-2`)"*. This module is that convergence point — the ONE place besides
`redis_stream_bus.py` itself where a `RedisStreamPublisher` is constructed (`D1.4`:
`grep -rn 'RedisStreamPublisher(' backend/src | grep -v redis_stream_bus.py` must read at least
one call site here, and the falsifier is the same grep over `XADD`/`xadd`, which must stay at
`0` — nobody outside `redis_stream_bus.py` ever assembles that command by hand).

`RedisStreamSeriesSink.accept` is the SHARED unit both producers reduce to, one already-built
`SeriesRow` at a time:

  * `forceOrder` (event-driven): a future per-event producer (`T-01.5`'s `collectors_cli`,
    composing `reconnect_and_key`'s `ForceOrderKeyObservation`s) calls `accept` once per row it
    derives from one liquidation event. THIS is "o equivalente do `forceOrder`" the plan (item
    1.4) names — there is no second class for it, because at the wire level a `forceOrder` row
    and a `premiumIndex` row are published identically; the ONLY thing that differs between the
    two producers is how many rows one upstream unit turns into, which is `RedisPremiumIndexSink`
    below for the batch case.
  * `premiumIndex` (poll-driven, `PremiumIndexSink.write`, `collect_premium_index.py`):
    `RedisPremiumIndexSink` wraps this sink and calls `accept` once per row derived from one
    cycle's batch of `PremiumIndexReading`s.

WHAT THIS MODULE DELIBERATELY DOES NOT DO, so the boundary is a decision and not an omission:
it does NOT decide which `SeriesKey` (the fifteen-term identity `series_key.py` fixes) a raw
`PremiumIndexReading` or a keyed `forceOrder` event belongs to, and it does NOT split one
`PremiumIndexReading` (mark price, index price, funding rate, ...) into however many series it
represents. That mapping is `SeriesKey`/catalog work `[NÃO SEI]` this task's dependencies do not
resolve (`T-01.4` depends only on `T-01.2` wire and `T-01.3` MAXLEN, not on `T-01.1`'s run-shape
gate, and no catalog for these two producers exists yet — `open_interest_catalog.py`,
`cvd_source_catalog.py` and `price_source_catalog.py` are the precedent for OTHER sources, none
of them these two). Fixing that mapping here, ahead of the catalog owner deciding it, would be
exactly the "decision from premise" `redis_series_write_queue.py`'s own `Decoder` injection
already refuses for the read side of this same stream — `RedisPremiumIndexSink` below takes the
mapping as an INJECTED `to_rows` callable for the identical reason.

`accept` NEVER catches what `RedisStreamPublisher.publish` raises (`core.silent-except`): a
failed `XADD` — connection lost, `WRONGTYPE` if the stream key were ever clobbered by something
else, any `RedisCommandError` — propagates to the caller unchanged. `SPEC-004` §3.1 names the
consequence one layer up, in the collector process: *"`XADD` falha ... o coletor encerra a
sessao com `verdict=REJECTED` ... e sai `rc != 0`"* — that recovery can only happen if this sink
never swallows the failure that triggers it.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable

from src.modules.sentimento.domain.premium_index_batch import PremiumIndexReading
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra.redis_resp_client import RespConnection
from src.modules.sentimento.infra.redis_stream_bus import (
    DEFAULT_STREAM_MAXLEN,
    RedisStreamPublisher,
)
from src.modules.sentimento.infra.series_row_wire import encode


class RedisStreamSeriesSink:
    """Encode one `SeriesRow` and publish it — the row-level adapter every producer injects.

    `connection` is INJECTED (`RespConnection`, already `connect_resp2`'d) rather than opened
    here: this class never touches a socket, matching every other adapter in this package
    (`redis_stream_bus.py`'s own classes, `redis_series_write_queue.py`) and the plan's "NAO abre
    socket fora do composition root" constraint for this task. Opening the connection is the
    composition root's job (`T-01.5`'s `collectors_cli`).
    """

    def __init__(
        self,
        connection: RespConnection,
        stream: str,
        max_len: int = DEFAULT_STREAM_MAXLEN,
    ) -> None:
        """Bind one `RedisStreamPublisher` to `connection`/`stream`; nothing is sent yet."""
        self._publisher = RedisStreamPublisher(connection, stream, max_len)

    def accept(self, row: SeriesRow) -> None:
        """Encode `row` (`series_row_wire.encode`) and `XADD` it. A failed `XADD` propagates."""
        self._publisher.publish(encode(row))


# `to_rows` turns ONE poll's `received_at` plus ONE `PremiumIndexReading` into however many
# `SeriesRow`s that reading represents (zero or more: `mark_price`, `funding_rate`, ... are
# separate `SeriesKey`s, `series_key.py`) — see the module docstring's "WHAT THIS MODULE
# DELIBERATELY DOES NOT DO" for why that decision is injected rather than made in this file.
PremiumIndexReadingToRows = Callable[[int, PremiumIndexReading], Iterable[SeriesRow]]


class RedisPremiumIndexSink:
    """Adapts `RedisStreamSeriesSink` to the `PremiumIndexSink` port.

    `collect_premium_index_once` (`collect_premium_index.py`) calls this structurally, without
    this module importing that `Protocol` — the same way `infra/premium_index_jsonl_sink.py`
    already implements it. Does not change `PremiumIndexSink`'s signature
    (`write(received_at, readings) -> None`, plan item 1.4's "NAO muda a assinatura das portas
    existentes"); it only supplies a THIRD implementation of it (`PremiumIndexJsonlSink` writes
    raw JSON lines; this one writes `SeriesRow`s onto the shared Redis Stream) built from the
    row-level sink above plus the injected `to_rows` mapping.
    """

    def __init__(self, sink: RedisStreamSeriesSink, to_rows: PremiumIndexReadingToRows) -> None:
        """Bind to an already-constructed row sink and the reading-to-rows mapping to apply."""
        self._sink = sink
        self._to_rows = to_rows

    def write(self, received_at: int, readings: tuple[PremiumIndexReading, ...]) -> None:
        """Map every reading of one cycle to its row(s) and publish each, in order.

        One `PremiumIndexReading` may become zero, one or several `SeriesRow`s — whatever
        `to_rows` returns — and every one of them reaches `RedisStreamSeriesSink.accept`
        individually: a failure on the Nth row still leaves the first N-1 durably published
        (`XADD` is per-entry), and propagates instead of being swallowed, exactly like `accept`
        itself.
        """
        for reading in readings:
            for row in self._to_rows(received_at, reading):
                self._sink.accept(row)
