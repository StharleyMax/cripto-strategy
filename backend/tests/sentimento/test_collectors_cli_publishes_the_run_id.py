"""`T-01.3` closes `T-01.4`'s named gap: the PRODUCER side of `ADR-035/D2` is now wired.

`docs/context/cinco-metricas-do-core/gates/T-01.4-build.md` §6, literal: *"O lado PRODUTOR nao
esta ligado, e isto e limite de escopo, nao esquecimento. Hoje nenhum `run_id` e publicado no
stream em producao"* — the transport existed and was proven end to end IN TEST, but no collector
ever minted an id at cycle/session open and handed it to `encode`. The consequence it named:
*"`DoD-4` da fase ... e `DoD-2` de `ADR-035` (`uptimePercent` do `premiumIndex` deixa de ser
`0.0`) NAO sao observaveis ao fim desta task"*.

So the tests here are deliberately NOT unit tests of the sink. They drive the three REAL
collector threads against a REAL (loopback `fakeredis`) Streams server, and then read the
entries back through the REAL consumer the single writer uses (`RedisSeriesWriteQueue` with
`decode_run_id` injected — the exact composition `single_writer_cli.main` builds). The
assertion is the one `ADR-035/D2` is about: the id the writer would credit is the id the
collector recorded in `md.ingest_run`.

BASELINE, so the change is a number and not an adjective: `100%` of `2.910` runs carried
`n_written = 0` while `md.series` held `23.512` rows `[MEDIDO 2026-09-10, DIAGNOSTICO.md]`,
because a writer with no `run_id` has nothing to credit.
"""

from __future__ import annotations

import hashlib
import threading
from collections.abc import Iterator

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.infra.binance_klines_client import KlineRow, KlinesPageResponse
from src.modules.sentimento.infra.collectors_cli import (
    _run_force_order_collector,
    _run_klines_collector,
    _run_premium_index_collector,
)
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.redis_series_write_queue import RedisSeriesWriteQueue
from src.modules.sentimento.infra.redis_stream_series_sink import RedisStreamSeriesSink
from src.modules.sentimento.infra.single_writer_cli import BootConfig as WriterBootConfig
from src.modules.sentimento.infra.single_writer_cli import build_queue
from src.modules.sentimento.use_cases.collect_premium_index import RawPremiumIndexFetch
from src.modules.sentimento.use_cases.collector_series_mapping import (
    KLINES_BUCKET_WIDTH_MS,
    build_force_order_to_rows,
    build_klines_to_rows,
    build_premium_index_to_rows,
)

STREAM = "md.series.write"
GROUP = "single_writer"
CONSUMER = "writer-1"

_T0 = 1_788_000_000_000

_ONE_SYMBOL_PREMIUM_INDEX_BODY = (
    b'[{"symbol":"BTCUSDT","markPrice":"60000.1","indexPrice":"60000.0",'
    b'"estimatedSettlePrice":"60000.0","lastFundingRate":"0.0001","interestRate":"0.0001",'
    b'"nextFundingTime":1788000000000,"time":1788000000000}]'
)

# One real `!forceOrder@arr` combined-stream frame for a symbol inside `INITIAL_SYMBOLS`.
_ONE_LIQUIDATION_FRAME = (
    '{"stream":"btcusdt@forceOrder","data":{"e":"forceOrder","E":1788000000000,'
    '"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.014","p":"60000.10",'
    '"ap":"60000.10","X":"FILLED","l":"0.014","z":"0.014","T":1788000000000}}}'
)


@pytest.fixture
def connections() -> Iterator[tuple[object, object]]:
    """Yield one publisher and one consumer connection to a real loopback Streams server."""
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.socket.getsockname()
    try:
        yield connect_resp2(open_tcp_socket(host, port)), connect_resp2(open_tcp_socket(host, port))
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


def _writer_queue(reader_connection: object) -> RedisSeriesWriteQueue:
    """Build the queue with `single_writer_cli.build_queue` — the writer's OWN composition.

    Not a hand-assembled `RedisSeriesWriteQueue`: the writer wraps `series_row_wire.decode`/
    `decode_run_id` in its own UTF-8 byte adapters (`_decode_wire_fields`,
    `_decode_wire_run_id`), and a test that skipped them would be asserting about a decoder
    nobody runs in production. `build_queue` calls `ensure_group()` itself.
    """
    return build_queue(_writer_config(), reader_connection)  # type: ignore[arg-type]


def _writer_config() -> WriterBootConfig:
    """Return the writer boot config `build_queue` reads; only the Redis fields matter here."""
    return WriterBootConfig(
        redis_host="unused",
        redis_port=0,
        redis_stream=STREAM,
        redis_stream_group=GROUP,
        redis_stream_consumer=CONSUMER,
        postgres_host="unused",
        postgres_port=0,
        postgres_db="unused",
        postgres_user="unused",
        # `build_queue` never opens a Postgres connection — it composes the Redis side only
        # — so these five fields are placeholders, not credentials. `noqa: S106` because the
        # rule reads the ARGUMENT NAME, and there is no secret here to leak.
        postgres_password="unused",  # noqa: S106
        writer_batch_size=100,
        writer_poll_interval_ms=500,
    )


def _drain_run_ids(queue: RedisSeriesWriteQueue) -> list[str | None]:
    """Read every published entry back the way the single writer reads it."""
    return [queued.run_id for queued in queue.read_new(1000)]


class _OneBatchFetcher:
    """A `PremiumIndexFetcher` that answers one real, single-symbol batch."""

    def fetch(self) -> RawPremiumIndexFetch:
        """Return `status=200` with a body `collect_premium_index_once` reaches `WRITTEN` on."""
        return RawPremiumIndexFetch(status=200, headers={}, body=_ONE_SYMBOL_PREMIUM_INDEX_BODY)


class _OneFrameThenClose:
    """A `MessageSource` that yields one liquidation frame and then ends the session."""

    path = "/stream?streams=btcusdt@forceOrder"

    def __init__(self, stop_event: threading.Event) -> None:
        """Bind the event this source sets once its single frame has been delivered."""
        self._stop_event = stop_event
        self._sent = False

    def open(self) -> None:
        """No transport to open."""

    def close(self) -> None:
        """No transport to close."""

    def messages(self) -> _OneFrameThenClose:
        """Return self — this fake IS its own iterator."""
        return self

    def __iter__(self) -> _OneFrameThenClose:
        """Return self."""
        return self

    def __next__(self) -> str:
        """Yield the one frame, then ask the collector to stop and end the iteration."""
        if self._sent:
            self._stop_event.set()
            raise StopIteration
        self._sent = True
        return _ONE_LIQUIDATION_FRAME


class _OneBarKlinesClient:
    """A `KlinesClient` answering one page with a single, long-settled bar."""

    def klines(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        """Return one closed bar for `symbol`."""
        return KlinesPageResponse(
            status=200,
            api_code=None,
            rows=(
                KlineRow(
                    raw=(
                        _T0,
                        "60000.0",
                        "60010.0",
                        "59990.0",
                        "60005.0",
                        "12.345",
                        _T0 + KLINES_BUCKET_WIDTH_MS - 1,
                        "740000.0",
                        11,
                        "6.0",
                        "360000.0",
                        "0",
                    )
                ),
            ),
        )


def test_the_premium_index_cycle_publishes_rows_under_the_run_id_it_recorded(
    connections: tuple[object, object],
) -> None:
    """Every row of a cycle reaches the writer carrying the run the collector opened.

    Morde: drop the `run_id=` argument from `RedisPremiumIndexSink`'s `accept` call (or stop
    minting the id at cycle open) and `decode_run_id` answers `None` for every entry — which
    is precisely the production state `T-01.4` measured and could not fix from its own scope.
    """
    publisher, reader = connections
    queue = _writer_queue(reader)
    stop = threading.Event()
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        stop.set()

    _run_premium_index_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        fetcher=_OneBatchFetcher(),
        sink=RedisStreamSeriesSink(publisher, STREAM),  # type: ignore[arg-type]
        to_rows=build_premium_index_to_rows(interval_s=60.0),
        record_run=_record,
        interval_s=60.0,
    )

    published = _drain_run_ids(queue)
    assert published, "the cycle published at least one row"
    assert set(published) == {runs[0].run_id}


def test_the_force_order_session_publishes_rows_under_the_run_id_it_recorded(
    connections: tuple[object, object],
) -> None:
    """A liquidation row carries the SESSION's run id, not `None` and not the log's short id.

    `session_id` (12 hex chars, a log correlator) and `run_id` (the primary key of
    `md.ingest_run`) are two different values on purpose — asserting equality with the
    RECORDED run is what keeps a future refactor from publishing the correlator by mistake.
    """
    publisher, reader = connections
    queue = _writer_queue(reader)
    stop = threading.Event()
    runs: list[IngestRun] = []

    _run_force_order_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        open_source=lambda: _OneFrameThenClose(stop),
        sink=RedisStreamSeriesSink(publisher, STREAM),  # type: ignore[arg-type]
        to_rows=build_force_order_to_rows(),
        record_run=runs.append,
        source_holder=[None],
    )

    published = _drain_run_ids(queue)
    assert published, "the session published at least one row"
    assert set(published) == {runs[0].run_id}


def test_the_klines_pass_publishes_rows_under_the_run_id_it_recorded(
    connections: tuple[object, object],
) -> None:
    """The third producer is wired the same way, through the same envelope field."""
    publisher, reader = connections
    queue = _writer_queue(reader)
    stop = threading.Event()
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        stop.set()

    _run_klines_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        client=_OneBarKlinesClient(),
        sink=RedisStreamSeriesSink(publisher, STREAM),  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=_record,
        symbols=("BTCUSDT",),
        interval_s=60.0,
        backfill_days=1,
    )

    published = _drain_run_ids(queue)
    assert published, "the pass published at least one row"
    assert set(published) == {runs[0].run_id}


def test_two_consecutive_cycles_publish_under_two_different_run_ids(
    connections: tuple[object, object],
) -> None:
    """Each cycle is its own run — minting once outside the loop would merge them.

    Morde: hoist the `uuid4()` above `while not stop_event.is_set()` and every cycle of the
    process credits the FIRST cycle's run, so `n_written` grows without bound on one row of
    `md.ingest_run` while every later run stays open forever.
    """
    publisher, reader = connections
    queue = _writer_queue(reader)
    stop = threading.Event()
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        if len(runs) == 2:
            stop.set()

    _run_premium_index_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        fetcher=_OneBatchFetcher(),
        sink=RedisStreamSeriesSink(publisher, STREAM),  # type: ignore[arg-type]
        to_rows=build_premium_index_to_rows(interval_s=60.0),
        record_run=_record,
        interval_s=0.01,
    )

    assert len({run.run_id for run in runs}) == 2
    assert set(_drain_run_ids(queue)) == {run.run_id for run in runs}


def test_the_run_id_on_the_wire_is_the_envelope_field_not_a_seventeenth_row_column(
    connections: tuple[object, object],
) -> None:
    """`decode` still returns a valid row, and the id rides ALONGSIDE it, not inside it.

    `series_row_wire.FIELD_NAMES` stays 16 (`md.series` has no `run_id` column, and
    `T-01.4`'s wire module says a 17th name there "must never become one"). Reading the row
    back successfully through the same entry proves the envelope did not corrupt the payload.
    """
    publisher, reader = connections
    queue = _writer_queue(reader)
    stop = threading.Event()
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        stop.set()

    _run_klines_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        client=_OneBarKlinesClient(),
        sink=RedisStreamSeriesSink(publisher, STREAM),  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=_record,
        symbols=("BTCUSDT",),
        interval_s=60.0,
        backfill_days=1,
    )

    queued = queue.read_new(10)
    assert len(queued) == 1
    assert queued[0].run_id == runs[0].run_id
    assert queued[0].row.value_raw == "12.345"
    assert queued[0].row.is_final is True
    # And the run's own digest is over SOMETHING: the empty `sha256` is what a pass that read
    # the page but never fed the hash would record, and it is indistinguishable from a pass
    # that genuinely returned nothing unless the two are told apart here.
    assert runs[0].src_sha256 != hashlib.sha256(b"").hexdigest()
