"""`single_writer_cli`: the ONE production process that composes `run_single_writer`.

`SPEC-004` §3.4, literal, is the contract this composition root implements: *"connect_resp2 ->
RedisStreamConsumerGroup(connection, stream, group, consumer) -> ensure_group() ->
RedisSeriesWriteQueue(group, decode) ... conexao Postgres -> PostgresSeriesSink ...
PostgresObservedLookup ... loop: run_single_writer(queue, lookup, sink,
batch_size=WRITER_BATCH_SIZE); fila vazia => dorme WRITER_POLL_INTERVAL_MS"*. Boot is
fail-fast, mirroring `collectors_cli.py`'s own contract for the same `SPEC-004` §3.1 shape:
any unresolved `REDIS_*`/`POSTGRES_*` value is `rc != 0` within 5s, naming the offending
variable, no infinite retry (`RN-4`).

`ADR-002/D5` is why this module never calls `write_series_row` itself: `run_single_writer`
(`use_cases/run_single_writer.py`) is the only production caller
(`tests/sentimento/test_single_writer_call_sites.py` proves the count stays 1), and this module
is a THIN composition root around it — it never re-implements the drain loop, never re-decides
the read-before-write predicate (`RF-6`), and the `ack` inside `run_single_writer` still happens
strictly AFTER `write_series_row` returns; `PostgresSeriesSink.accept` committing before
returning is what makes that ordering durable across a `kill -9` (`D2.3`/`D2.4`, proved by
`T-02.7`, not this task).

── `[Q10]`: NO `md.ingest_gap` FROM THIS PROCESS, DELIBERATELY ──────────────────────────────

`gates/F2-series-ddl.md` §7.1 decided the writer records no `IngestGap` in `F2` — reconnection
is a COLLECTOR-side event (`F1`, closed) this process structurally never observes, it only ever
sees `SeriesRow` candidates arriving on the queue. That decision is about GAPS and still holds:
nothing below records an `IngestGap`.

── `ADR-035/D2`: THIS PROCESS NOW CLOSES THE RUN THE COLLECTOR OPENED ───────────────────────

What `[Q10]` above does NOT cover, and `ADR-035/D2` decides: `n_written` means "rows the WRITER
persisted" (`ADR-035/D1`), so the only process that can supply it is this one. `100%` of `2.910`
runs read `n_written = 0` while `md.series` held `23.512` rows `[MEDIDO 2026-09-10,
DIAGNOSTICO.md]` precisely because nobody ever wrote the number back. This module therefore does
touch `md.ingest_run` — through `PostgresIngestRecordStore.credit_written`, which names two
columns and cannot name a third, so it can never overwrite `weight_used` or any other field the
collector measured (`ADR-035`'s own `DoD-4`; `RNF-3`).

The accounting is DEFERRED and RETRIED, and both properties are load-bearing:

  * DEFERRED to the end of the batch: one Postgres round trip per `run_id` per batch instead of
    one per row, and the credit is additive so a batch boundary never loses a row.
  * RETRIED across batches: the writer normally reaches a cycle's rows BEFORE the collector
    records the run at cycle close, so `credit_written` finds no row and reports `False`. The
    credit stays in `_PendingRunCredits` and is re-attempted on every later batch. Dropping it
    instead would reproduce exactly the defect this decision exists to remove.
  * a row whose producer sent no `run_id` is counted separately and reported, never silently
    ignored: "no producer is wired yet" and "the wiring broke" have to be different signals.

── B7: A MESSAGE THAT WILL NEVER DECODE STAYS IN THE PEL, THE PROCESS KEEPS RUNNING ─────────

`gates/F2-series-ddl.md` §7.2 fixed the FINAL destination: no dead-letter stream (a second
`XADD` outside `RedisStreamPublisher.publish` would itself violate `RN-2`/`CA-F1-1`), no
automatic remediation (`NG-7`). `redis_series_write_queue.RedisSeriesWriteQueue` catches the
per-entry `SeriesRowWireError` and drops that ONE entry from what it returns — never acked, so
it is redelivered by `read_pending` on every subsequent iteration until an operator intervenes
(`XCLAIM`/`XACK`) or `REDIS_STREAM_MAXLEN` recycles it. `_reject_message` below is this
process's `on_rejected` hook: it only LOGS `writer_message_rejected{entry_id, reason}`
(`SPEC-004` §3.7) — the decision of what happens to the entry was already made, in the queue
adapter, per `B7`.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Final, Protocol

import psycopg

from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra.ingest_health_cli import (
    build_service_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.infra.ingest_record_store_composition import (
    DEFAULT_POSTGRES_HOST,
    DEFAULT_POSTGRES_PORT,
    POSTGRES_DB_VAR,
    POSTGRES_HOST_VAR,
    POSTGRES_PASSWORD_VAR,
    POSTGRES_PORT_VAR,
    POSTGRES_USER_VAR,
)
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.infra.postgres_series_sink import (
    PostgresObservedLookup,
    PostgresSeriesSink,
    ensure_schema,
)
from src.modules.sentimento.infra.redis_resp_client import (
    RedisCommandError,
    RespConnection,
    SocketFactory,
    connect_resp2,
    open_tcp_socket,
)
from src.modules.sentimento.infra.redis_series_write_queue import RedisSeriesWriteQueue
from src.modules.sentimento.infra.redis_stream_bus import RedisStreamConsumerGroup
from src.modules.sentimento.infra.series_row_wire import (
    InvalidWireFieldValueError,
    SeriesRowWireError,
)
from src.modules.sentimento.infra.series_row_wire import decode as decode_wire_fields
from src.modules.sentimento.infra.series_row_wire import decode_run_id as decode_wire_run_id
from src.modules.sentimento.use_cases.run_single_writer import (
    QueuedSeriesRow,
    SeriesWriteQueue,
    run_single_writer,
)
from src.modules.sentimento.use_cases.write_series_row import (
    ObservedLookup,
    SeriesSink,
    WriteOutcome,
)

logger = logging.getLogger(__name__)

# ── ENV VARS THE BOOT RESOLVES, `SPEC-004` §3.4/§3.2 (`[Q4]`) ──────────────────────────────
_REDIS_HOST_VAR: Final[str] = "REDIS_HOST"
_REDIS_PORT_VAR: Final[str] = "REDIS_PORT"
_REDIS_STREAM_VAR: Final[str] = "REDIS_STREAM"
_REDIS_STREAM_GROUP_VAR: Final[str] = "REDIS_STREAM_GROUP"
_REDIS_STREAM_CONSUMER_VAR: Final[str] = "REDIS_STREAM_CONSUMER"
# `POSTGRES_*_VAR` are imported (not redefined) from `ingest_record_store_composition` above —
# the var NAMES are shared across every composition root this phase has, even though this
# module never calls `compose_ingest_record_store` itself (see module docstring, `[Q10]`).
_WRITER_BATCH_SIZE_VAR: Final[str] = "WRITER_BATCH_SIZE"
_WRITER_POLL_INTERVAL_MS_VAR: Final[str] = "WRITER_POLL_INTERVAL_MS"

_DEFAULT_REDIS_HOST: Final[str] = "localhost"
_DEFAULT_REDIS_PORT: Final[int] = 6379
_DEFAULT_REDIS_STREAM: Final[str] = "md.series.write"
_DEFAULT_REDIS_STREAM_GROUP: Final[str] = "single_writer"
_DEFAULT_REDIS_STREAM_CONSUMER: Final[str] = "writer-1"
_DEFAULT_WRITER_BATCH_SIZE: Final[int] = 100
_DEFAULT_WRITER_POLL_INTERVAL_MS: Final[int] = 500

# `D2.5`: `REDIS_HOST=nao-existe`/`POSTGRES_HOST=nao-existe` both have to produce `rc != 0` in
# <= 5s — these bound the one connect attempt each stage makes, no retry, no loop.
_REDIS_CONNECT_TIMEOUT_S: Final[float] = 3.0
_POSTGRES_CONNECT_TIMEOUT_S: Final[int] = 5


class WriterBootConfigurationError(RuntimeError):
    """One environment variable could not be parsed into valid boot configuration.

    `variable` is the SAME name `writer_boot_refused{variable}` (`SPEC-004` §3.7) carries, so
    the log event and the exception that produced it never drift apart — same contract as
    `collectors_cli.CollectorBootConfigurationError`.
    """

    def __init__(self, variable: str, message: str) -> None:
        """Bind the offending variable name alongside the human-readable `message`."""
        super().__init__(message)
        self.variable = variable


class WriterBootConnectionError(RuntimeError):
    """Redis or Postgres could not be reached at boot — `RN-4` fail-fast."""

    def __init__(self, variable: str, message: str) -> None:
        """Bind the variable that names WHICH resolved value failed to connect."""
        super().__init__(message)
        self.variable = variable


@dataclass(frozen=True)
class BootConfig:
    """Every value `SPEC-004` §3.4's boot step resolves, before any socket opens."""

    redis_host: str
    redis_port: int
    redis_stream: str
    redis_stream_group: str
    redis_stream_consumer: str
    postgres_host: str
    postgres_port: int
    postgres_db: str
    postgres_user: str
    postgres_password: str
    writer_batch_size: int
    writer_poll_interval_ms: int


def _parse_int(environ: Mapping[str, str], variable: str, default: int) -> int:
    """Parse `variable` as `int`, or return `default` when absent — never a silent truncation."""
    raw = environ.get(variable)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as error:
        raise WriterBootConfigurationError(
            variable, f"{variable} must be an integer, got {raw!r}"
        ) from error


def _require(environ: Mapping[str, str], variable: str) -> str:
    """Return `environ[variable]`, or refuse naming it — never a silent empty default.

    Used only for the three Postgres vars the compose file already requires (`POSTGRES_DB`,
    `_USER`, `_PASSWORD`) — same split `ingest_record_store_composition._require` draws for the
    same three variables, kept local here because this module never calls that function (it
    never composes an `IngestRecordStore`, see the module docstring's `[Q10]` section).
    """
    value = environ.get(variable)
    if not value:
        raise WriterBootConfigurationError(
            variable, f"{variable} must be set to compose the postgres series sink"
        )
    return value


def resolve_boot_config(environ: Mapping[str, str]) -> BootConfig:
    """Resolve every boot value `SPEC-004` §3.4 names, or raise naming the offending variable.

    Every Postgres value is resolved HERE, before either `connect_redis` or `connect_postgres`
    opens a socket — a malformed `POSTGRES_PORT` or a missing `POSTGRES_PASSWORD` is a
    configuration mistake, not a network failure, exactly the split
    `ingest_record_store_composition._postgres_conninfo` draws for the same three variables.
    """
    return BootConfig(
        redis_host=environ.get(_REDIS_HOST_VAR, _DEFAULT_REDIS_HOST),
        redis_port=_parse_int(environ, _REDIS_PORT_VAR, _DEFAULT_REDIS_PORT),
        redis_stream=environ.get(_REDIS_STREAM_VAR, _DEFAULT_REDIS_STREAM),
        redis_stream_group=environ.get(_REDIS_STREAM_GROUP_VAR, _DEFAULT_REDIS_STREAM_GROUP),
        redis_stream_consumer=environ.get(
            _REDIS_STREAM_CONSUMER_VAR, _DEFAULT_REDIS_STREAM_CONSUMER
        ),
        postgres_host=environ.get(POSTGRES_HOST_VAR, DEFAULT_POSTGRES_HOST),
        postgres_port=_parse_int(environ, POSTGRES_PORT_VAR, DEFAULT_POSTGRES_PORT),
        postgres_db=_require(environ, POSTGRES_DB_VAR),
        postgres_user=_require(environ, POSTGRES_USER_VAR),
        postgres_password=_require(environ, POSTGRES_PASSWORD_VAR),
        writer_batch_size=_parse_int(environ, _WRITER_BATCH_SIZE_VAR, _DEFAULT_WRITER_BATCH_SIZE),
        writer_poll_interval_ms=_parse_int(
            environ, _WRITER_POLL_INTERVAL_MS_VAR, _DEFAULT_WRITER_POLL_INTERVAL_MS
        ),
    )


def connect_redis(config: BootConfig, open_socket: SocketFactory | None = None) -> RespConnection:
    """Open the RESP connection and `PING` it — `rc != 0` naming `REDIS_HOST` on any failure.

    `open_socket` is injectable, matching every other transport in this package, so the offline
    suite can point this at a real loopback `fakeredis.TcpFakeServer` instead of the network.
    """
    opener = open_socket or open_tcp_socket
    try:
        sock = opener(config.redis_host, config.redis_port)
    except OSError as error:
        raise WriterBootConnectionError(
            _REDIS_HOST_VAR,
            f"cannot connect to Redis at {_REDIS_HOST_VAR}={config.redis_host!r} "
            f"{_REDIS_PORT_VAR}={config.redis_port!r}: {error}",
        ) from error
    sock.settimeout(_REDIS_CONNECT_TIMEOUT_S)
    try:
        connection = connect_resp2(sock)
        reply = connection.command("PING")
    except (RedisCommandError, OSError) as error:
        sock.close()
        raise WriterBootConnectionError(
            _REDIS_HOST_VAR,
            f"Redis PING failed at {_REDIS_HOST_VAR}={config.redis_host!r}: {error}",
        ) from error
    if reply != b"PONG":
        connection.close()
        raise WriterBootConnectionError(
            _REDIS_HOST_VAR,
            f"Redis at {_REDIS_HOST_VAR}={config.redis_host!r} did not answer PONG: {reply!r}",
        )
    return connection


def connect_postgres(
    config: BootConfig,
    connect: Callable[[str], psycopg.Connection[Any]] | None = None,
) -> psycopg.Connection[Any]:
    """Open the ONE Postgres connection this process holds — `rc != 0` naming `POSTGRES_HOST`.

    `connect` is injectable (defaulting to `psycopg.connect`), the same seam
    `ingest_record_store_composition.compose_ingest_record_store` uses for the same reason: the
    offline suite proves "no retry, no hang" by counting calls to a fake instead of needing a
    live, unreachable Postgres on the wire.
    """
    opener = connect or psycopg.connect
    conninfo = (
        f"host={config.postgres_host} port={config.postgres_port} dbname={config.postgres_db} "
        f"user={config.postgres_user} password={config.postgres_password} "
        f"connect_timeout={_POSTGRES_CONNECT_TIMEOUT_S}"
    )
    try:
        return opener(conninfo)
    except psycopg.OperationalError as error:
        raise WriterBootConnectionError(
            POSTGRES_HOST_VAR,
            f"cannot connect to Postgres at {POSTGRES_HOST_VAR}={config.postgres_host!r} "
            f"{POSTGRES_PORT_VAR}={config.postgres_port!r}: {error}",
        ) from error


def _decode_wire_fields(fields: Mapping[bytes, bytes]) -> SeriesRow:
    """Adapt raw byte fields to `series_row_wire.decode`'s `Mapping[str, str]` contract.

    A field that is not valid UTF-8 is the same class of poison message `series_row_wire.decode`
    itself refuses — re-raised as `InvalidWireFieldValueError` so
    `RedisSeriesWriteQueue._decode_all` only ever has to catch ONE exception family
    (`SeriesRowWireError`) to tell "this message will never decode" from "this is a bug".
    """
    try:
        text_fields = {
            name.decode("utf-8"): value.decode("utf-8") for name, value in fields.items()
        }
    except UnicodeDecodeError as error:
        raise InvalidWireFieldValueError(
            f"wire mapping carries a field that is not valid UTF-8: {error}"
        ) from error
    return decode_wire_fields(text_fields)


def _reject_message(entry_id: bytes, error: SeriesRowWireError) -> None:
    """`RedisSeriesWriteQueue`'s `on_rejected` hook: log `writer_message_rejected`, nothing else.

    The DECISION of what happens to the entry (stays in the PEL, `B7`) was already made inside
    the queue adapter — this hook only reports it, through THIS process's own stdout logger, so
    it lands on the same stream as `writer_boot_refused`/`writer_batch_acked`.
    """
    logger.warning(
        "writer_message_rejected",
        extra={"entry_id": entry_id.decode("utf-8", errors="replace"), "reason": str(error)},
    )


def _decode_wire_run_id(fields: Mapping[bytes, bytes]) -> str | None:
    """Adapt raw byte fields to `series_row_wire.decode_run_id`'s `Mapping[str, str]` contract.

    Same UTF-8 refusal as `_decode_wire_fields`, and for the same reason: a field that is not
    valid UTF-8 is a poison message, and it has to arrive at `RedisSeriesWriteQueue._decode_all`
    as the ONE exception family that means "this will never decode".
    """
    try:
        text_fields = {
            name.decode("utf-8"): value.decode("utf-8") for name, value in fields.items()
        }
    except UnicodeDecodeError as error:
        raise InvalidWireFieldValueError(
            f"wire mapping carries a field that is not valid UTF-8: {error}"
        ) from error
    return decode_wire_run_id(text_fields)


class RunWrittenCreditor(Protocol):
    """The ONE thing this loop needs from the record store: credit a run with rows written.

    Narrow on purpose (`ADR-035/D2`): the writer must be structurally unable to touch any other
    field of `md.ingest_run`, and a port with one method is a stronger statement of that than a
    docstring on a port with six. `PostgresIngestRecordStore.credit_written` satisfies it.
    """

    def credit_written(  # noqa: D102
        self, run_id: str, n_written: int, accounted_at: str
    ) -> bool: ...


@dataclass
class _PendingRunCredits:
    """Rows persisted per `run_id` that Postgres has not accepted yet, plus the unattributed.

    Two counters, never merged. `by_run` is a credit waiting for the collector to record the
    run it belongs to — a NORMAL state, retried on the next batch. `unattributed` counts rows
    whose producer sent no `run_id` at all; those can never be credited to anything, and the
    only honest thing to do with them is report the number instead of letting it look like
    zero rows were written.
    """

    by_run: dict[str, int] = field(default_factory=dict)
    unattributed: int = 0

    def record(self, item: QueuedSeriesRow, outcome: WriteOutcome) -> None:
        """Count one written row against the run that produced it (`run_single_writer` hook)."""
        if outcome is not WriteOutcome.ACCEPTED:
            return
        if item.run_id is None:
            self.unattributed += 1
            return
        self.by_run[item.run_id] = self.by_run.get(item.run_id, 0) + 1

    def flush(self, creditor: RunWrittenCreditor, accounted_at: str) -> tuple[str, ...]:
        """Credit every pending run; keep the ones whose run row does not exist yet.

        Returns the ids actually credited. A run that `credit_written` reports as absent keeps
        its full count — the credit is additive, so re-attempting it later adds it exactly once.
        """
        credited: list[str] = []
        for run_id, n_written in list(self.by_run.items()):
            if creditor.credit_written(run_id, n_written, accounted_at):
                credited.append(run_id)
                del self.by_run[run_id]
        return tuple(credited)


def build_queue(config: BootConfig, connection: RespConnection) -> RedisSeriesWriteQueue:
    """Build the queue: `RedisStreamConsumerGroup` -> `ensure_group()` -> `RedisSeriesWriteQueue`.

    `SPEC-004` §3.4's composition, isolated so `run` below stays a thin loop over an
    already-built `SeriesWriteQueue`, testable with a fake one instead of a live Redis.
    """
    group = RedisStreamConsumerGroup(
        connection, config.redis_stream, config.redis_stream_group, config.redis_stream_consumer
    )
    group.ensure_group()
    return RedisSeriesWriteQueue(
        group,
        _decode_wire_fields,
        decode_run_id=_decode_wire_run_id,
        on_rejected=_reject_message,
    )


def _utc_now_iso() -> str:
    """`ADR-035/D2`'s accounting stamp, in the same `Z`-suffixed shape the runs already use."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def run(
    *,
    queue: SeriesWriteQueue,
    lookup: ObservedLookup,
    sink: SeriesSink,
    batch_size: int,
    poll_interval_s: float,
    creditor: RunWrittenCreditor | None = None,
    stop_event: threading.Event | None = None,
    sleep: Callable[[float], None] = time.sleep,
    now: Callable[[], str] = _utc_now_iso,
) -> int:
    """Drain the queue forever: one `run_single_writer` batch per iteration, then sleep if empty.

    Takes the three `run_single_writer` collaborators ALREADY BUILT — composing them (opening
    sockets, `ensure_group()`, wrapping connections) is `main()`'s job, not this loop's, exactly
    the split `collectors_cli.run` draws between boot and the loop it drives. That split is what
    lets this function be exercised with fakes (`test_single_writer_cli_run.py`) instead of a
    live Redis and Postgres.

    `stop_event` is a testing seam only (`SIGTERM` is not part of this task's scope — every
    write this process makes is already durable by the time it is `ack`ed, `D2.3`/`D2.4`, so an
    unhandled `SIGKILL`/`SIGTERM` loses nothing `T-02.7`'s restart test does not already cover);
    left `None`, the loop runs until the process is killed, exactly like a production writer.

    `creditor` left `None` keeps the loop EXACTLY as it was before `ADR-035/D2`: rows are
    written and no run is ever closed. That is the shape the offline tests of the drain loop
    use, and it is also the honest behaviour for any composition that has no record store —
    never a silent partial accounting.
    """
    stop = stop_event or threading.Event()
    credits = _PendingRunCredits()
    while not stop.is_set():
        outcomes = run_single_writer(
            queue, lookup, sink, batch_size=batch_size, on_outcome=credits.record
        )
        if not outcomes:
            sleep(poll_interval_s)
            continue
        n_accepted = sum(1 for outcome in outcomes if outcome is WriteOutcome.ACCEPTED)
        n_rejected = len(outcomes) - n_accepted
        logger.info(
            "writer_batch_acked",
            extra={"n_accepted": n_accepted, "n_rejected": n_rejected},
        )
        if creditor is not None:
            _credit_runs(credits, creditor, now())
    return 0


def _credit_runs(
    credits: _PendingRunCredits, creditor: RunWrittenCreditor, accounted_at: str
) -> None:
    """Flush what this batch wrote into `md.ingest_run`, and SAY what could not be flushed.

    `writer_run_credited` is the positive signal `ADR-035`'s falsifier reads. The two negative
    ones are logged separately and only when non-zero, because "the collector has not recorded
    this run yet" (ordinary, resolves itself) and "these rows belong to no run at all" (a
    producer is not wired) are different problems with different owners.
    """
    unattributed = credits.unattributed
    credits.unattributed = 0
    for run_id in credits.flush(creditor, accounted_at):
        logger.info("writer_run_credited", extra={"run_id": run_id})
    if credits.by_run:
        logger.info(
            "writer_run_credit_deferred",
            extra={"n_runs": len(credits.by_run), "n_rows": sum(credits.by_run.values())},
        )
    if unattributed:
        logger.warning("writer_rows_without_run_id", extra={"n_rows": unattributed})


def main(argv: Sequence[str]) -> int:
    """Resolve boot config, connect, and run — `rc != 0` naming the variable on any boot failure.

    `argv` is accepted (unused) for the same uniform `main(argv) -> int` signature every CLI in
    this package uses, so the suite can call it directly without `sys.exit` escaping the test
    process.
    """
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    # `ADR-035/D3` amendment of `2026-09-11` (`D9`): this is a DECLARED service process,
    # so its `stdout` is `docker logs` read by a human and renders `extra={}`. The
    # projection builder (`build_stdout_handler`) cannot render a pair at all.
    logger.addHandler(build_service_stdout_handler())
    logger.propagate = False
    try:
        config = resolve_boot_config(os.environ)
    except WriterBootConfigurationError as error:
        logger.error(
            "writer_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    try:
        connection = connect_redis(config)
    except WriterBootConnectionError as error:
        logger.error(
            "writer_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    try:
        postgres_connection = connect_postgres(config)
    except WriterBootConnectionError as error:
        logger.error(
            "writer_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    ensure_schema(postgres_connection)
    # `ADR-035/D2`. Idempotent, and it is what adds `writer_accounted_at` to a `md.ingest_run`
    # that was created before this decision existed — without it the first `credit_written`
    # would fail on an unknown column against every already-deployed database.
    record_store = PostgresIngestRecordStore(postgres_connection)
    record_store.initialise()
    queue = build_queue(config, connection)
    sink = PostgresSeriesSink(postgres_connection)
    lookup = PostgresObservedLookup(postgres_connection)
    return run(
        queue=queue,
        lookup=lookup,
        sink=sink,
        batch_size=config.writer_batch_size,
        poll_interval_s=config.writer_poll_interval_ms / 1000,
        creditor=record_store,
    )


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    raise SystemExit(main(sys.argv[1:]))
