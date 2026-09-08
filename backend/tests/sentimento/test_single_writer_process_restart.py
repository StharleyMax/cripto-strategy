"""`T-02.7` / `D2.3`+`D2.4`: a REAL `single_writer_cli` process, `kill -9`ed mid-drain.

Same idiom `test_producer_killed_mid_publish.py` (`T-01.7`) already established for `T-01.5`'s
collector, one layer deeper: the process under test here is the WRITER, not the producer, and
it talks to TWO real, ephemeral containers — `redis:7-alpine` (the Stream, same image
`deploy/compose.yml` runs) and `timescale/timescaledb:2.17.2-pg15` (`md.series`), the same
image `gates/F2-series-ddl.md` was verified against and `test_postgres_series_sink.py` already
uses — never `fakeredis.TcpFakeServer` (see the note beside the `redis_address` fixture below
for why). `docker` absent skips (not fails) the whole module — the rest of the suite still
proves every unit-level falsifier `T-02.5`/`T-02.2` own, offline.

`SPEC-004 R-G`: this module carries `@pytest.mark.process_real` throughout, so
`scripts/verify.sh` deselects it from `make verify` by default (`-m 'not process_real'`) — it
exists to be run manually, via the literal command each test's docstring names, until the
owner opts it back in.

Rows are published through `RedisStreamSeriesSink` (`T-01.4`'s real port: `encode(row)` then
`XADD`) — never a fake publisher — and read back by the real, unmodified `single_writer_cli`
entrypoint (`T-02.5`) — never a fake sink. `NAO usa fake do sink; NAO usa fake do publisher`.

── `D2.4`: restart loses nothing and duplicates nothing ─────────────────────────────────────

100 distinct rows (`B4`/`B5`: "morre entre commit e ack", "entre read e commit") are published
BEFORE the writer starts, so the consumer group's ONE `XREADGROUP` delivers them all to this
consumer's Pending Entries List at once (`WRITER_BATCH_SIZE=1` then drains them one at a time,
one `writer_batch_acked` stdout line per row — a deterministic checkpoint, not a wall-clock
race). The writer is `kill -9`ed right after the 40th such line, restarted under the identical
consumer identity, and left to drain the rest. `PostgresSeriesSink.accept` commits BEFORE
`run_single_writer` acks (`postgres_series_sink.py` module docstring) — that ordering is what
makes `count(*) == 100` and zero duplicate keys true regardless of exactly which row was
in-flight at the kill instant: an already-committed-but-unacked row is redelivered by
`read_pending` on restart and lands as a no-op (`ON CONFLICT ... DO NOTHING` on the primary
key), never a second row.

`test_ack_before_commit_would_have_lost_rows_on_restart` and
`test_a_sink_without_upsert_noop_would_have_duplicated_a_redelivered_row` are the morde
companions the `D2.4` row names literally ("`ack` antes do commit ⇒ `< 100`"; "sem upsert-noop
⇒ duplicatas `> 0`") — in-process, no subprocess and no Docker, because both properties are
about the ORDER OF TWO CALLS and a SQL clause, not about process boundaries, and asserting them
against fakes makes the two failure modes executable instead of merely described.

── `D2.3`: the read-before-write predicate survives the real entrypoint ─────────────────────

One `OBSERVED` row, then one `MODELED` row for the SAME bucket
(`series_key_id, symbol, source, bucket_end`, different `observed_at`) — published one after
the other, waiting for the `writer_batch_acked` line each produces before publishing the next,
so the two are provably processed in order. `select provenance` for the bucket must answer
`OBSERVADO` alone: `ADR-002/D5`'s predicate (`write_series_row`,
`modeled_write_overwrites_observed`) blocks the `MODELADO` write from ever reaching
`sink.accept`.

`test_bypassing_write_series_row_lets_modeled_land_over_observed` is `D2.3`'s morde companion,
literal to the DoD's own words ("entrypoint chamando o sink direto ⇒ `MODELED`"): it calls
`PostgresSeriesSink.accept` DIRECTLY for both rows, skipping `write_series_row`'s predicate
entirely, and shows BOTH rows land — the exact defect `single_writer_cli.py` never re-implements
`write_series_row` itself (module docstring, `ADR-002/D5`) to avoid.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Final

import psycopg
import pytest

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.postgres_series_sink import PostgresSeriesSink, ensure_schema
from src.modules.sentimento.infra.redis_resp_client import (
    RespConnection,
    connect_resp2,
    open_tcp_socket,
)
from src.modules.sentimento.infra.redis_stream_bus import RedisStreamConsumerGroup
from src.modules.sentimento.infra.redis_stream_series_sink import RedisStreamSeriesSink
from src.modules.sentimento.use_cases.run_single_writer import (
    QueuedSeriesRow,
    SeriesWriteQueue,
    run_single_writer,
)
from src.modules.sentimento.use_cases.write_series_row import ObservedLookup, write_series_row

pytestmark = pytest.mark.skipif(
    shutil.which("docker") is None, reason="docker not on PATH — see module docstring"
)

_IMAGE = "timescale/timescaledb:2.17.2-pg15"
_CONTAINER_NAME_PREFIX = "t-02-7-writer-restart-test-"
_READY_TIMEOUT_S = 30.0

BACKEND_ROOT = Path(__file__).resolve().parents[2]
CLI_MODULE = "src.modules.sentimento.infra.single_writer_cli"
BOOT_DEADLINE_S = 5.0
ROW_COUNT: Final[int] = 100
KILL_AFTER_ROWS: Final[int] = 40
BATCH_ACKED_MARKER: Final[str] = "writer_batch_acked"

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


# ── shared docker/postgres plumbing — mirrors test_postgres_series_sink.py ───────────────────


def _run_docker(*args: str) -> subprocess.CompletedProcess[str]:
    """Run one `docker` subcommand, capturing output for the caller to inspect on failure."""
    return subprocess.run(  # noqa: S603 — argv is a literal list, never shell-interpolated
        ["docker", *args], capture_output=True, text=True, timeout=60
    )


@pytest.fixture
def postgres_conninfo() -> Iterator[str]:
    """Start a throwaway TimescaleDB container, yield its `psycopg` conninfo, then tear it down."""
    name = f"{_CONTAINER_NAME_PREFIX}{uuid.uuid4().hex[:8]}"
    started = _run_docker(
        "run",
        "-d",
        "--rm",
        "--name",
        name,
        "-e",
        "POSTGRES_PASSWORD=test",
        "-e",
        "POSTGRES_USER=test",
        "-e",
        "POSTGRES_DB=test",
        "-p",
        "127.0.0.1::5432",
        _IMAGE,
    )
    if started.returncode != 0:
        pytest.skip(f"could not start {_IMAGE}: {started.stderr.strip()}")
    try:
        port_output = _run_docker("port", name, "5432/tcp")
        host_port = port_output.stdout.strip().rsplit(":", maxsplit=1)[-1]
        conninfo = f"host=127.0.0.1 port={host_port} dbname=test user=test password=test"
        _wait_until_ready(conninfo).close()
        yield conninfo
    finally:
        _run_docker("rm", "-f", "-v", name)


def _wait_until_ready(conninfo: str) -> psycopg.Connection:
    """Poll for the container to accept connections, refusing after `_READY_TIMEOUT_S`."""
    deadline = time.monotonic() + _READY_TIMEOUT_S
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            return psycopg.connect(conninfo)
        except psycopg.OperationalError as error:
            last_error = error
            time.sleep(0.5)
    raise TimeoutError(f"postgres did not become ready within {_READY_TIMEOUT_S}s") from last_error


def _host_port_from_conninfo(conninfo: str) -> tuple[str, str, str, str, str]:
    """Parse `host=... port=... dbname=... user=... password=...` into the `POSTGRES_*` values."""
    fields = dict(part.split("=", 1) for part in conninfo.split())
    return fields["host"], fields["port"], fields["dbname"], fields["user"], fields["password"]


# ── real, ephemeral `redis:7-alpine` listener — same image `deploy/compose.yml` runs ─────────
#
# `fakeredis.TcpFakeServer` (the idiom `test_producer_killed_mid_publish.py` uses) is NOT used
# here: `[MEDIDO 2026-09-08, reproduced in-process, no subprocess]` a SECOND connection whose
# `XGROUP CREATE` hits `BUSYGROUP` (exactly what a restarted writer's OWN `ensure_group()` does
# every time, `single_writer_cli.build_queue`) leaves that fake server's connection unable to
# answer the very next command — `XREADGROUP` gets `RedisProtocolError("connection closed
# while a reply line was expected")` instead of a reply. The identical sequence against a real
# `redis:7-alpine` container answers correctly. Since `D2.4`'s restart is EXACTLY "call
# `ensure_group()` again after the group already exists", the fake server's bug would fire on
# every restart this test performs — a real, throwaway container sidesteps a fake's limitation
# rather than working around it in the assertions.


@pytest.fixture
def redis_address() -> Iterator[tuple[str, int]]:
    """Start a throwaway `redis:7-alpine` container, yield its address, then tear it down."""
    name = f"{_CONTAINER_NAME_PREFIX}redis-{uuid.uuid4().hex[:8]}"
    started = _run_docker(
        "run", "-d", "--rm", "--name", name, "-p", "127.0.0.1::6379", "redis:7-alpine"
    )
    if started.returncode != 0:
        pytest.skip(f"could not start redis:7-alpine: {started.stderr.strip()}")
    try:
        port_output = _run_docker("port", name, "6379/tcp")
        host_port = int(port_output.stdout.strip().rsplit(":", maxsplit=1)[-1])
        _wait_for_redis_ready("127.0.0.1", host_port)
        yield ("127.0.0.1", host_port)
    finally:
        _run_docker("rm", "-f", "-v", name)


def _wait_for_redis_ready(host: str, port: int) -> None:
    """Poll `PING` until it answers `PONG`, refusing after `_READY_TIMEOUT_S`."""
    deadline = time.monotonic() + _READY_TIMEOUT_S
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            connection = connect_resp2(open_tcp_socket(host, port))
            reply = connection.command("PING")
            connection.close()
            if reply == b"PONG":
                return
        except OSError as error:
            last_error = error
        time.sleep(0.2)
    raise TimeoutError(f"redis did not become ready within {_READY_TIMEOUT_S}s") from last_error


def _connection(address: tuple[str, int]) -> RespConnection:
    host, port = address
    return connect_resp2(open_tcp_socket(host, port))


def _row(**overrides: object) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_postgres_series_sink.py`'s helper."""
    columns: dict[str, object] = {
        "series_key_id": "a" * 64,
        "symbol": "T027USDT",
        "source": "t-02-7-restart-test",
        "bucket_end": BUCKET_END_MS,
        "event_time": EVENT_TIME_MS,
        "available_at": EVENT_TIME_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": EVENT_TIME_MS + 45_000,
        "observed_at": EVENT_TIME_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "2026-09-08 00:00:00",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


def _spawn_writer(
    *,
    redis_address: tuple[str, int],
    stream: str,
    group: str,
    consumer: str,
    postgres_conninfo: str,
    writer_batch_size: int,
) -> subprocess.Popen[str]:
    """Launch the REAL `single_writer_cli` entrypoint as its own OS process."""
    host, port = redis_address
    pg_host, pg_port, pg_db, pg_user, pg_password = _host_port_from_conninfo(postgres_conninfo)
    environment = dict(
        os.environ,
        PYTHONPATH=str(BACKEND_ROOT),
        REDIS_HOST=host,
        REDIS_PORT=str(port),
        REDIS_STREAM=stream,
        REDIS_STREAM_GROUP=group,
        REDIS_STREAM_CONSUMER=consumer,
        POSTGRES_HOST=pg_host,
        POSTGRES_PORT=pg_port,
        POSTGRES_DB=pg_db,
        POSTGRES_USER=pg_user,
        POSTGRES_PASSWORD=pg_password,
        WRITER_BATCH_SIZE=str(writer_batch_size),
        WRITER_POLL_INTERVAL_MS="50",
    )
    return subprocess.Popen(
        [sys.executable, "-m", CLI_MODULE],
        cwd=str(BACKEND_ROOT),
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )


def _wait_for_nth_batch_acked_line(
    process: subprocess.Popen[str], target_count: int, timeout_s: float
) -> None:
    """Block until `stdout` prints `target_count` MORE `writer_batch_acked` lines from here.

    `target_count` is relative to THIS call, not cumulative across calls: `readline()`
    consumes each line it returns, so a line a PRIOR call already saw can never be counted
    again — calling this twice for "1 total, then 2 total" would wait for a THIRD line that
    never arrives. Callers that need N separate checkpoints call this N times with
    `target_count=1` each, never once with an accumulating total.

    A deterministic checkpoint, not a wall-clock guess: `single_writer_cli.run` logs exactly
    one such line per non-empty `run_single_writer` batch, and `WRITER_BATCH_SIZE=1` makes each
    batch exactly one row while the writer runs uninterrupted — so the `target_count`-th line
    means that many rows are ALREADY committed (the log call happens strictly after `ack`,
    which happens strictly after `PostgresSeriesSink.accept` committed).
    """
    assert process.stdout is not None
    deadline = time.monotonic() + timeout_s
    seen = 0
    while seen < target_count:
        if time.monotonic() > deadline:
            raise TimeoutError(
                f"only saw {seen}/{target_count} '{BATCH_ACKED_MARKER}' lines within "
                f"{timeout_s}s (process alive: {process.poll() is None})"
            )
        line = process.stdout.readline()
        if not line:
            raise RuntimeError(
                f"writer stdout closed after {seen}/{target_count} '{BATCH_ACKED_MARKER}' "
                f"lines (process exited: {process.poll()!r})"
            )
        if BATCH_ACKED_MARKER in line:
            seen += 1


def _kill_and_wait(process: subprocess.Popen[str]) -> None:
    """`kill -9` the process and wait for it to actually die, tolerating an already-dead one."""
    if process.poll() is None:
        process.send_signal(signal.SIGKILL)  # `B4`/`B5` — see module docstring
    process.wait(timeout=10)


def _distinct_key_count(connection: psycopg.Connection, symbol: str, source: str) -> int:
    """`count(*)` for this test's own rows — never a bare `SELECT count(*) FROM md.series`."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM md.series WHERE symbol = %s AND source = %s", (symbol, source)
        )
        (count,) = cursor.fetchone()  # type: ignore[misc]
        return int(count)


def _duplicate_key_count(connection: psycopg.Connection, symbol: str, source: str) -> int:
    """`D2.4`'s literal duplicate check: rows sharing the primary key, grouped and counted."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM ("
            "  SELECT series_key_id, symbol, source, bucket_end, observed_at"
            "  FROM md.series WHERE symbol = %s AND source = %s"
            "  GROUP BY 1, 2, 3, 4, 5 HAVING count(*) > 1"
            ") d",
            (symbol, source),
        )
        (count,) = cursor.fetchone()  # type: ignore[misc]
        return int(count)


# ── `D2.4`: kill -9 mid-drain, restart, count(*) == 100, zero duplicates ─────────────────────


@pytest.mark.process_real
def test_restart_after_kill_minus_9_recovers_every_row_without_loss_or_duplicate(
    redis_address: tuple[str, int], postgres_conninfo: str
) -> None:
    """DoD `D2.4`, literal: publish 100, `kill -9` after 40 are durably acked, restart, drain.

    `select count(*) -> 100` and the group-by-primary-key duplicate query -> `0` are asserted
    against THIS test's own `(symbol, source)`, over a database this fixture created fresh.
    """
    symbol = "T027USDT"
    source = "t-02-7-restart-test"
    stream = f"md.series.write.t02-7.{uuid.uuid4().hex[:8]}"
    group = "single_writer"
    consumer = "writer-1"

    # The group must exist BEFORE anything publishes — `XGROUP CREATE ... $` starts the group
    # at "now"; entries `XADD`ed before the group exists would never reach `read_new`.
    RedisStreamConsumerGroup(_connection(redis_address), stream, group, consumer).ensure_group()

    publisher = RedisStreamSeriesSink(_connection(redis_address), stream)
    for sequence in range(ROW_COUNT):
        publisher.accept(
            _row(
                symbol=symbol,
                source=source,
                bucket_end=BUCKET_END_MS + sequence * 60_000,
                observed_at=EVENT_TIME_MS + 46_000 + sequence,
            )
        )

    writer_one = _spawn_writer(
        redis_address=redis_address,
        stream=stream,
        group=group,
        consumer=consumer,
        postgres_conninfo=postgres_conninfo,
        writer_batch_size=1,
    )
    try:
        _wait_for_nth_batch_acked_line(writer_one, KILL_AFTER_ROWS, timeout_s=30.0)
    finally:
        _kill_and_wait(writer_one)

    assert writer_one.returncode is not None and writer_one.returncode < 0, (
        f"expected the writer to die by signal (negative returncode), got {writer_one.returncode}"
    )

    inspection = psycopg.connect(postgres_conninfo)
    try:
        count_at_kill = _distinct_key_count(inspection, symbol, source)
    finally:
        inspection.close()
    assert 0 < count_at_kill < ROW_COUNT, (
        f"expected a genuinely partial drain (0 < n < {ROW_COUNT}) at the kill instant, got "
        f"{count_at_kill} — the test's own checkpoint failed to land mid-way"
    )

    writer_two = _spawn_writer(
        redis_address=redis_address,
        stream=stream,
        group=group,
        consumer=consumer,
        postgres_conninfo=postgres_conninfo,
        writer_batch_size=10,
    )
    try:
        deadline = time.monotonic() + 30.0
        connection = psycopg.connect(postgres_conninfo)
        try:
            while _distinct_key_count(connection, symbol, source) < ROW_COUNT:
                if time.monotonic() > deadline:
                    raise TimeoutError(
                        f"restart did not reach {ROW_COUNT} rows within 30s "
                        f"(process alive: {writer_two.poll() is None})"
                    )
                time.sleep(0.05)

            assert _distinct_key_count(connection, symbol, source) == ROW_COUNT, (
                f"D2.4: count(*) must be exactly {ROW_COUNT} after restart drains the rest"
            )
            assert _duplicate_key_count(connection, symbol, source) == 0, (
                "D2.4: no primary key may be shared by more than one row after restart — "
                "a redelivered, already-committed row must land as a no-op"
            )
        finally:
            connection.close()
    finally:
        _kill_and_wait(writer_two)


def test_ack_before_commit_would_have_lost_rows_on_restart() -> None:
    """Morde for `D2.4`: an `ack`-before-commit sink loses the in-flight row on a simulated crash.

    In-process, no subprocess, no Docker — the property under test is the ORDER of two calls
    (`ack` then a deferred commit) relative to `run_single_writer`, which this fake reproduces
    directly. The real `PostgresSeriesSink.accept` commits BEFORE returning
    (`postgres_series_sink.py` module docstring); this fake commits ONLY when `flush()` is
    called explicitly, so acking the queue entry before that flush is exactly the defect the
    DoD names: "`ack` antes do commit ⇒ `< 100`".
    """

    class _DeferredCommitSink:
        """Accepts a row into a staging list; `flush()` is the only thing that makes it durable."""

        def __init__(self) -> None:
            self.durable: list[SeriesRow] = []
            self._staged: SeriesRow | None = None

        def accept(self, row: SeriesRow) -> None:
            self._staged = row  # NOT durable yet — this is the bug under demonstration.

        def flush(self) -> None:
            if self._staged is not None:
                self.durable.append(self._staged)
                self._staged = None

    class _AlwaysAbsentLookup:
        def observed_already_present(self, row: SeriesRow) -> bool:
            return False

    class _OneShotQueue:
        """Ten entries, `ack`ed immediately by the caller — this fake never re-delivers."""

        def __init__(self, rows: list[SeriesRow]) -> None:
            self._pending = [QueuedSeriesRow(entry_id=i, row=row) for i, row in enumerate(rows)]
            self.acked: list[object] = []

        def read_pending(self, count: int) -> tuple[QueuedSeriesRow, ...]:
            return ()

        def read_new(self, count: int) -> tuple[QueuedSeriesRow, ...]:
            batch = tuple(self._pending[:count])
            self._pending = self._pending[count:]
            return batch

        def ack(self, entry_id: object) -> None:
            self.acked.append(entry_id)

    rows = [
        _row(bucket_end=BUCKET_END_MS + i * 60_000, observed_at=EVENT_TIME_MS + i)
        for i in range(10)
    ]
    queue = _OneShotQueue(rows)
    lookup: ObservedLookup = _AlwaysAbsentLookup()
    sink = _DeferredCommitSink()
    typed_queue: SeriesWriteQueue = queue

    # `run_single_writer` calls `sink.accept` THEN `queue.ack`, per row — with THIS sink, the
    # row is staged (not durable) at the moment it is acked. A crash right here is simulated by
    # simply never calling `flush()` for the row that "crashed" mid-flight: the staged value at
    # that instant is dropped, matching a process death before an un-flushed write hits disk.
    run_single_writer(typed_queue, lookup, sink, batch_size=6)
    # The remaining 4 durable rows are flushed normally, mirroring "the process comes back and
    # the rest of the batch finishes cleanly" — irrelevant to the point being demonstrated,
    # which is that the FIRST 6 were already acked without ever being made durable.
    sink.flush()

    assert len(queue.acked) == 6, "sanity: six entries were acked by this batch"
    assert len(sink.durable) < 6, (
        f"ack-before-commit must lose at least one row: expected < 6 durable rows, got "
        f"{len(sink.durable)} — `sink.accept` here NEVER makes a row durable on its own"
    )


def test_a_sink_without_upsert_noop_would_have_duplicated_a_redelivered_row() -> None:
    """Morde for `D2.4`: a sink lacking `ON CONFLICT ... DO NOTHING` duplicates on redelivery.

    In-process, no subprocess, no Docker. `PostgresSeriesSink.accept`'s `INSERT ... ON CONFLICT
    (...) DO NOTHING` is what makes redelivering the SAME entry (unacked at crash time, then
    `read_pending` on restart) land as one row, not two. This fake appends unconditionally,
    reproducing "sem upsert-noop ⇒ duplicatas `> 0`" literally.
    """

    class _AppendOnlySink:
        """No conflict handling at all: every `accept` call appends, even for the same key."""

        def __init__(self) -> None:
            self.written: list[SeriesRow] = []

        def accept(self, row: SeriesRow) -> None:
            self.written.append(row)

    class _AlwaysAbsentLookup:
        def observed_already_present(self, row: SeriesRow) -> bool:
            return False

    candidate = _row()
    sink = _AppendOnlySink()
    lookup: ObservedLookup = _AlwaysAbsentLookup()

    # The SAME entry delivered twice — exactly what `read_pending` hands back on restart for a
    # row that was written (accept returned) but never acked before the crash.
    write_series_row(candidate, lookup=lookup, sink=sink)
    write_series_row(candidate, lookup=lookup, sink=sink)

    duplicates = [row for row in sink.written if row == candidate]
    assert len(duplicates) > 1, (
        f"a sink without upsert-noop must duplicate a redelivered identical row: expected > 1 "
        f"copies of the same key, got {len(duplicates)}"
    )


# ── `D2.3`: the read-before-write predicate survives the real entrypoint ─────────────────────


@pytest.mark.process_real
def test_modeled_after_observed_same_bucket_leaves_only_observed(
    redis_address: tuple[str, int], postgres_conninfo: str
) -> None:
    """DoD `D2.3`, literal: publish 1 `OBSERVED` + 1 `MODELED` for the same bucket, in order.

    `select provenance from md.series where <bucket>` must answer `OBSERVADO` alone — the
    `MODELADO` write for the identical `(series_key_id, symbol, source, bucket_end)` is refused
    by `write_series_row`'s predicate (`ADR-002/D5`) before it ever reaches
    `PostgresSeriesSink.accept`.
    """
    symbol = "T027USDT"
    source = "t-02-7-predicate-test"
    stream = f"md.series.write.t02-7-d23.{uuid.uuid4().hex[:8]}"
    group = "single_writer"
    consumer = "writer-1"
    bucket_end = BUCKET_END_MS

    RedisStreamConsumerGroup(_connection(redis_address), stream, group, consumer).ensure_group()

    observed = _row(
        symbol=symbol,
        source=source,
        bucket_end=bucket_end,
        provenance=Provenance.OBSERVED,
        availability_source=AvailabilitySource.OBSERVED,
        observed_at=EVENT_TIME_MS + 46_000,
    )
    modeled = _row(
        symbol=symbol,
        source=source,
        bucket_end=bucket_end,
        provenance=Provenance.MODELED,
        availability_source=AvailabilitySource.MODELED,
        observed_at=EVENT_TIME_MS + 47_000,  # different `observed_at` — same bucket otherwise
    )

    publisher = RedisStreamSeriesSink(_connection(redis_address), stream)

    writer = _spawn_writer(
        redis_address=redis_address,
        stream=stream,
        group=group,
        consumer=consumer,
        postgres_conninfo=postgres_conninfo,
        writer_batch_size=10,
    )
    try:
        publisher.accept(observed)
        # Wait for the FIRST batch-acked line before publishing the second row, so the two are
        # provably processed in the order the DoD names ("OBSERVED depois MODELED").
        _wait_for_nth_batch_acked_line(writer, 1, timeout_s=BOOT_DEADLINE_S + 10.0)

        publisher.accept(modeled)
        # `target_count=1`, not 2: this is a SEPARATE call, and the first line is already
        # consumed — see `_wait_for_nth_batch_acked_line`'s docstring.
        _wait_for_nth_batch_acked_line(writer, 1, timeout_s=10.0)

        connection = psycopg.connect(postgres_conninfo)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT DISTINCT provenance FROM md.series WHERE symbol = %s "
                    "AND source = %s AND bucket_end = %s",
                    (symbol, source, bucket_end),
                )
                provenances = {row[0] for row in cursor.fetchall()}
        finally:
            connection.close()

        assert provenances == {"OBSERVADO"}, (
            f"D2.3: the bucket must carry OBSERVADO alone after a MODELADO write for the same "
            f"bucket, got {provenances}"
        )
    finally:
        _kill_and_wait(writer)


def test_bypassing_write_series_row_lets_modeled_land_over_observed(
    postgres_conninfo: str,
) -> None:
    """Morde for `D2.3`, literal: "entrypoint chamando o sink direto ⇒ `MODELED`".

    Calling `PostgresSeriesSink.accept` DIRECTLY for both rows — skipping `write_series_row`'s
    predicate entirely, as a defective entrypoint would — lets the `MODELADO` row land
    alongside the `OBSERVADO` one, proving the predicate (not the primary key alone) is what
    the real test above depends on.
    """
    connection = psycopg.connect(postgres_conninfo)
    try:
        ensure_schema(connection)
        sink = PostgresSeriesSink(connection)
        symbol = "T027USDT"
        source = "t-02-7-bypass-test"
        bucket_end = BUCKET_END_MS

        observed = _row(
            symbol=symbol,
            source=source,
            bucket_end=bucket_end,
            provenance=Provenance.OBSERVED,
            availability_source=AvailabilitySource.OBSERVED,
            observed_at=EVENT_TIME_MS + 46_000,
        )
        modeled = _row(
            symbol=symbol,
            source=source,
            bucket_end=bucket_end,
            provenance=Provenance.MODELED,
            availability_source=AvailabilitySource.MODELED,
            observed_at=EVENT_TIME_MS + 47_000,
        )

        sink.accept(observed)  # bypasses write_series_row — no predicate is ever consulted
        sink.accept(modeled)

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT DISTINCT provenance FROM md.series WHERE symbol = %s AND source = %s "
                "AND bucket_end = %s",
                (symbol, source, bucket_end),
            )
            provenances = {row[0] for row in cursor.fetchall()}
    finally:
        connection.close()

    assert "MODELADO" in provenances, (
        f"bypassing the predicate must let MODELADO land over OBSERVADO, got {provenances}"
    )
