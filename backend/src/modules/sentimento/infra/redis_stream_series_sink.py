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

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """Encode `row` (`series_row_wire.encode`) and `XADD` it. A failed `XADD` propagates.

        `run_id` is the `ADR-035/D2` envelope field: the id of the collector run that produced
        this row, minted at cycle/session/pass OPEN by the composition root
        (`infra/collectors_cli.py`) and carried through the queue so the SINGLE WRITER can
        credit `n_written` back onto the run the collector opened. It is a KEYWORD with a
        `None` default because it is a property of the PRODUCER's bookkeeping, not of the row:
        `T-01.4` built the whole transport for it (`series_row_wire.encode(row, run_id=...)`,
        `decode_run_id`, `single_writer_cli._PendingRunCredits`) and left this one call
        deliberately unconnected, which is why `uptimePercent` read `0.0` structurally and
        `100%` of `2.910` runs read `n_written = 0` `[MEDIDO 2026-09-10, DIAGNOSTICO.md]`. A
        caller that passes nothing still publishes exactly the 16 wire fields it always did.
        """
        self._publisher.publish(encode(row, run_id=run_id))


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

    def __init__(
        self,
        sink: RedisStreamSeriesSink,
        to_rows: PremiumIndexReadingToRows,
        run_id: str | None = None,
    ) -> None:
        """Bind to an already-constructed row sink, the mapping, and this CYCLE's `run_id`.

        `run_id` belongs to ONE cycle (`Q3` §1.2: "one run" for this producer IS one poll
        cycle), and `PremiumIndexSink.write(received_at, readings)` is a port whose signature
        this class may not change (`T-01.4` plan item 1.4: "NAO muda a assinatura das portas
        existentes"). So the id is bound at CONSTRUCTION and the composition root builds one
        of these per cycle — which is also what makes the binding impossible to get wrong:
        there is no mutable field a second cycle could forget to update, and no cycle can
        publish under another cycle's id.
        """
        self._sink = sink
        self._to_rows = to_rows
        self._run_id = run_id

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
                self._sink.accept(row, run_id=self._run_id)
