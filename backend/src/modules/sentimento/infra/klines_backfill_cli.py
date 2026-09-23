"""One-shot `/fapi/v1/klines` backfill up to the `D5` ceiling — it RETURNS, it never loops."""
#
# Phase `01` item 1.6 + `DoD 6` of `SPEC-008` (`T-01.5`), `RNF-3`, `RNF-4`, `D5`, `ADR-027/D1`.
#
# ── WHY A SEPARATE ENTRYPOINT AND NOT A KNOB ON THE COLLECTOR ───────────────────────────────
#
# `ADR-027/D1` declares EXACTLY THREE long-lived processes (collectors, single writer, API) and
# says nothing else becomes a permanent container. Deepening the history is not a fourth: it is
# a job with an end, run once by an operator or by `cron`, and this module is written so that
# end is structural rather than promised — `run_backfill` has no outer `while`, no ticker and no
# `stop_event` to wait on, so the only way it does not return is a network call that hangs.
#
# It also could NOT have been a knob on `collectors_cli`. That module's boot backfill re-reads
# its whole window on EVERY restart (its watermark is deliberately process-local), which at the
# `D5` ceiling would be `90 x 1440 x 4 symbols x 6 identities = 3.110.400` rows appended per
# restart of a service whose restart policy is `unless-stopped`. `KLINES_BACKFILL_DAYS` is
# therefore left at its 7-day default and this job owns its own variable.
#
# ── THE CEILING IS 90 DAYS, AND IT IS REFUSED AT BOOT, NOT CLAMPED ──────────────────────────
#
# `[DECISAO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]`, literal: *"90 dias,
# como a SPEC declara"*. A request for more is refused by name at boot (`RN-4` fail-fast), never
# silently clamped: a clamp turns "I asked for a year" into a shorter history that looks
# deliberate, and the operator finds out months later by counting rows.
#
# ── BACKPRESSURE IS THE REASON THIS FILE IS MORE THAN A `for` LOOP ──────────────────────────
#
# Rows reach `md.series` only through the single writer (`RN-6`), so this job publishes onto the
# same Redis Stream every collector publishes onto — and that stream is capped
# (`XADD ... MAXLEN ~ N`, `ADR-032/D4`, default `100.000`). At the ceiling this job produces
# `3.110.400` entries, `31x` the cap: published flat out, `MAXLEN` would trim entries the writer
# had not read yet, and the loss would be SILENT — no error, just missing minutes nobody can
# name later. So the walk asks Redis how far behind the writer's consumer group is
# (`XINFO GROUPS`, field `lag`) and waits for it to drain below a declared ceiling before the
# next page. That makes the job's wall-clock a function of the WRITER's throughput, which is the
# honest dependency; it does not make it a service.
#
# ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────
#
# It does not decide series identity, does not re-implement the anti-lookahead cut, and does not
# write to Postgres. It calls `build_klines_to_rows` — the ONE mapping `T-01.3`/`T-01.4` pinned,
# including the sign of `is_closed_bucket` and the bucket that TERMINATES at `ceil(t/B)*B` — so
# a backfilled bar and a live bar are the same six rows by construction rather than by review.
# ⛔ That reuse is also `DoD 5` (`RNF-4`): the four candle readings come off the array already
# paid for, and this job adds no second request to `/fapi/v1/klines` for a bucket it has.

from __future__ import annotations

import hashlib
import logging
import os
import sys
import time
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final

from src.modules.sentimento.domain.history_ceiling import MAX_HISTORY_DAYS
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.infra.binance_klines_client import (
    MAX_LIMIT,
    BinanceKlinesClient,
    KlinesPageResponse,
)
from src.modules.sentimento.infra.collectors_cli import (
    CollectorBootConfigurationError,
    CollectorBootConnectionError,
    KlinesClient,
    connect_redis,
    resolve_boot_config,
)
from src.modules.sentimento.infra.ingest_health_cli import (
    build_service_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.infra.ingest_record_store_composition import (
    IngestRecordStoreConfigurationError,
    IngestRecordStoreConnectionError,
    compose_ingest_record_store,
)
from src.modules.sentimento.infra.redis_resp_client import (
    RedisCommandError,
    RedisProtocolError,
    RespConnection,
    RespValue,
)
from src.modules.sentimento.infra.redis_stream_series_sink import RedisStreamSeriesSink
from src.modules.sentimento.use_cases.collector_run_mapping import (
    KLINES_ENDPOINT,
    KnownVerdict,
    build_klines_run,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    INITIAL_SYMBOLS,
    KLINES_BUCKET_WIDTH_MS,
    KlinesToRows,
    build_klines_to_rows,
)

logger = logging.getLogger(__name__)

MS_PER_DAY: Final[int] = 86_400_000

# `D5`, the owner's ceiling. It is a MAXIMUM the boot check reads, and also the default: an
# operator who runs this job without saying how deep wants the history the SPEC declares.
#
# `T-05.3` moved the NUMBER itself to `domain/history_ceiling.MAX_HISTORY_DAYS` — the route
# refusal `T-05.4` builds on top of `GET /series-history` cannot import THIS module (`infra`)
# under `backend/pyproject.toml`'s `infra > use_cases > domain` layer contract, so the single
# source of truth had to move down a layer. `MAX_BACKFILL_DAYS` stays as the name this module's
# own boot check and test suite already know, now an ALIAS rather than a second declaration —
# see `domain/history_ceiling.py` for the arithmetic and the measured DoD 5/6 numbers.
MAX_BACKFILL_DAYS: Final[int] = MAX_HISTORY_DAYS
DEFAULT_BACKFILL_DAYS: Final[int] = MAX_BACKFILL_DAYS

# `interval` of the series this job deepens. Quoted from the collector's own constant family
# rather than re-typed: `klines_ohlc`/`klines_volume`/`cvd_source` are all `1m` series, and a
# backfill on a different grid would be a different series, not a deeper one.
BACKFILL_INTERVAL: Final[str] = "1m"

# How far the writer's consumer group may fall behind before the walk stops publishing. It has
# to leave room under `REDIS_STREAM_MAXLEN` for the OTHER producers that keep publishing while
# this job runs (the collector's four threads), so it is a fraction of the cap and not the cap:
# at the default `100.000` cap this leaves `80.000` entries of headroom.
DEFAULT_MAX_STREAM_LAG: Final[int] = 20_000

# How long to sleep between two `XINFO GROUPS` probes while waiting for that drain. One second
# is short against the ~9.000 rows a single page produces and long enough that the probe itself
# is not a load.
DEFAULT_LAG_POLL_INTERVAL_S: Final[float] = 1.0

_BACKFILL_DAYS_VAR: Final[str] = "KLINES_BACKFILL_ONE_SHOT_DAYS"
_MAX_STREAM_LAG_VAR: Final[str] = "KLINES_BACKFILL_MAX_STREAM_LAG"
_LAG_POLL_INTERVAL_S_VAR: Final[str] = "KLINES_BACKFILL_LAG_POLL_S"

# Must be the SAME group `single_writer_cli` joins, and it is read from the same variable with
# the same default for that reason: probing a group nobody consumes would report `lag = 0`
# forever and turn the backpressure into decoration.
_REDIS_STREAM_GROUP_VAR: Final[str] = "REDIS_STREAM_GROUP"
_DEFAULT_REDIS_STREAM_GROUP: Final[str] = "single_writer"

# `XINFO GROUPS` answers RESP2 as an array of flat `field value field value ...` arrays, one per
# group. These are the two fields this module reads off that reply.
_XINFO_GROUP_NAME_FIELD: Final[bytes] = b"name"
_XINFO_GROUP_LAG_FIELD: Final[bytes] = b"lag"

# The same closed tuple `collectors_cli` catches, for the same reason (`core.silent-except`):
# everything a publish attempt can raise that means "our own queue is in trouble", and nothing
# wider. A `KlineArityError` or a bug in the mapping is NOT in here and crashes loudly.
_PUBLISH_FAILURE_EXCEPTIONS: Final[tuple[type[Exception], ...]] = (
    RedisCommandError,
    RedisProtocolError,
    OSError,
    ValueError,
)


class StreamGroupMissingError(RuntimeError):
    """`XINFO GROUPS` did not list the consumer group the single writer is supposed to hold."""


@dataclass(frozen=True)
class BackfillConfig:
    """Everything this job resolves before it opens a socket — `RN-4`, all of it fail-fast."""

    days: int
    symbols: tuple[str, ...]
    stream: str
    stream_group: str
    max_stream_lag: int
    lag_poll_interval_s: float


@dataclass(frozen=True)
class BackfillTotals:
    """What one one-shot pass measured, in the units `build_klines_run` takes.

    `n_returned` counts BARS the source answered and `n_published` counts BARS whose six rows
    reached the stream; their difference is the anti-lookahead cut (`RS-3.4`), the same reading
    `_KlinesPassTotals` carries in the collector. `n_rows` is kept SEPARATELY because it is the
    number `DoD 6` is read off — one bar is six rows since `T-01.3`, and folding the two would
    make the disk projection unfalsifiable.
    """

    n_returned: int = 0
    n_published: int = 0
    n_rows: int = 0
    n_calls: int = 0
    api_code: int | None = None

    def plus(self, other: BackfillTotals) -> BackfillTotals:
        """Fold another symbol's totals in; the FIRST `api_code` seen is the one kept."""
        return BackfillTotals(
            n_returned=self.n_returned + other.n_returned,
            n_published=self.n_published + other.n_published,
            n_rows=self.n_rows + other.n_rows,
            n_calls=self.n_calls + other.n_calls,
            api_code=self.api_code if self.api_code is not None else other.api_code,
        )


def _epoch_ms() -> int:
    """Return the current instant as epoch milliseconds — the unit `SeriesRow` fields use."""
    return int(time.time() * 1000)


def _iso_now() -> str:
    """Return the current instant as an ISO-8601 UTC string — the unit `IngestRun` fields use."""
    return datetime.now(UTC).isoformat()


def _parse_int(environ: Mapping[str, str], variable: str, default: int) -> int:
    """Parse `variable` as `int`, or return `default` when absent — never a silent truncation."""
    raw = environ.get(variable)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as error:
        raise CollectorBootConfigurationError(
            variable, f"{variable} must be an integer, got {raw!r}"
        ) from error


def _parse_float(environ: Mapping[str, str], variable: str, default: float) -> float:
    """Parse `variable` as `float`, or return `default` when absent."""
    raw = environ.get(variable)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as error:
        raise CollectorBootConfigurationError(
            variable, f"{variable} must be a number, got {raw!r}"
        ) from error


def resolve_backfill_days(environ: Mapping[str, str]) -> int:
    """Resolve the depth, refusing `<= 0` and refusing anything ABOVE the `D5` ceiling.

    Both refusals are `RN-4` fail-fast and both name the variable. The upper one is the owner's
    decision made mechanical: a clamp would answer a request for 365 days with 90 days of rows
    and no line saying so, and the operator would read the shortfall as a gap in the source.
    """
    value = _parse_int(environ, _BACKFILL_DAYS_VAR, DEFAULT_BACKFILL_DAYS)
    if value <= 0:
        raise CollectorBootConfigurationError(
            _BACKFILL_DAYS_VAR, f"{_BACKFILL_DAYS_VAR} must be greater than zero, got {value!r}"
        )
    if value > MAX_BACKFILL_DAYS:
        raise CollectorBootConfigurationError(
            _BACKFILL_DAYS_VAR,
            f"{_BACKFILL_DAYS_VAR} must not exceed the {MAX_BACKFILL_DAYS}-day ceiling of "
            f"SPEC-008/D5, got {value!r}",
        )
    return value


def resolve_backfill_config(environ: Mapping[str, str]) -> BackfillConfig:
    """Resolve every value this job needs, reusing the collector's own Redis resolution.

    `resolve_boot_config` is called for the stream name and the cap because those belong to the
    TRANSPORT, not to this job: a backfill publishing to a different stream than the writer
    reads would be a job that succeeds and writes nothing.
    """
    boot = resolve_boot_config(environ)
    max_stream_lag = _parse_int(environ, _MAX_STREAM_LAG_VAR, DEFAULT_MAX_STREAM_LAG)
    if max_stream_lag <= 0:
        raise CollectorBootConfigurationError(
            _MAX_STREAM_LAG_VAR, f"{_MAX_STREAM_LAG_VAR} must be greater than zero"
        )
    if max_stream_lag >= boot.redis_stream_maxlen:
        raise CollectorBootConfigurationError(
            _MAX_STREAM_LAG_VAR,
            f"{_MAX_STREAM_LAG_VAR}={max_stream_lag!r} must stay BELOW the stream cap "
            f"({boot.redis_stream_maxlen!r}), or MAXLEN trims entries the writer has not read",
        )
    lag_poll_interval_s = _parse_float(
        environ, _LAG_POLL_INTERVAL_S_VAR, DEFAULT_LAG_POLL_INTERVAL_S
    )
    if lag_poll_interval_s <= 0.0:
        raise CollectorBootConfigurationError(
            _LAG_POLL_INTERVAL_S_VAR, f"{_LAG_POLL_INTERVAL_S_VAR} must be greater than zero"
        )
    return BackfillConfig(
        days=resolve_backfill_days(environ),
        symbols=tuple(sorted(INITIAL_SYMBOLS)),
        stream=boot.redis_stream,
        stream_group=environ.get(_REDIS_STREAM_GROUP_VAR, _DEFAULT_REDIS_STREAM_GROUP),
        max_stream_lag=max_stream_lag,
        lag_poll_interval_s=lag_poll_interval_s,
    )


def read_group_lag(connection: RespConnection, stream: str, group: str) -> int:
    """Return how many entries of `stream` the consumer `group` has not been delivered yet.

    Read from `XINFO GROUPS`'s `lag` field, which is the only number here that means "work the
    writer still owes". `XLEN` would be the wrong probe and the mistake is worth naming: a Redis
    Stream does NOT drop an entry when it is acknowledged, so `XLEN` sits pinned at the `MAXLEN`
    cap whether the writer is idle or hours behind — a backpressure loop reading it would either
    never publish or never wait.

    A missing group is an ERROR, not a zero: it means nothing is draining this stream, and
    publishing three million entries into it would be publishing them into a trimmer.
    """
    reply = connection.command("XINFO", "GROUPS", stream)
    if not isinstance(reply, list):
        raise StreamGroupMissingError(
            f"XINFO GROUPS {stream!r} answered {reply!r}, not the array of groups RESP2 promises"
        )
    for entry in reply:
        fields = _flat_map(entry)
        if fields.get(_XINFO_GROUP_NAME_FIELD) == group.encode("utf-8"):
            lag = fields.get(_XINFO_GROUP_LAG_FIELD)
            if not isinstance(lag, int):
                raise StreamGroupMissingError(
                    f"group {group!r} on {stream!r} reported lag={lag!r}, not an integer; the "
                    f"server is older than the Redis 7 reply this backpressure depends on"
                )
            return lag
    raise StreamGroupMissingError(
        f"no consumer group named {group!r} on stream {stream!r}: nothing is draining it, so "
        f"every entry this backfill publishes would be trimmed by MAXLEN unread"
    )


def _flat_map(entry: RespValue) -> dict[bytes, RespValue]:
    """Turn one `field value field value ...` RESP2 array into a mapping keyed by field name."""
    if not isinstance(entry, list):
        return {}
    pairs: dict[bytes, RespValue] = {}
    for index in range(0, len(entry) - 1, 2):
        name = entry[index]
        if isinstance(name, bytes):
            pairs[name] = entry[index + 1]
    return pairs


def wait_for_drain(
    *,
    connection: RespConnection,
    config: BackfillConfig,
    sleep: Callable[[float], None] = time.sleep,
) -> int:
    """Block until the writer's lag is at or below the ceiling; return the lag it settled at.

    There is no timeout and no bail-out, deliberately. A writer that has stopped draining is a
    condition an operator has to see, and the two alternatives both destroy data: giving up
    leaves a half-deep history that looks complete, and publishing anyway hands `MAXLEN` rows
    nobody will ever write. Waiting is the only option that keeps the failure legible — the job
    sits there, `backfill_waiting_for_writer` repeats in the log with the lag it is watching, and
    the operator kills it.
    """
    lag = read_group_lag(connection, config.stream, config.stream_group)
    while lag > config.max_stream_lag:
        logger.info(
            "backfill_waiting_for_writer",
            extra={
                "endpoint": KLINES_ENDPOINT,
                "stream": config.stream,
                "group": config.stream_group,
                "lag": lag,
                "max_lag": config.max_stream_lag,
            },
        )
        sleep(config.lag_poll_interval_s)
        lag = read_group_lag(connection, config.stream, config.stream_group)
    return lag


def _publish_page(
    *,
    page: KlinesPageResponse,
    sink: RedisStreamSeriesSink,
    to_rows: KlinesToRows,
    digest: hashlib._Hash,
    symbol: str,
    run_id: str,
    now_ms: int,
) -> tuple[int, int]:
    """Publish one page's CLOSED bars; return `(bars, rows)` — two numbers, never one.

    `digest` is fed the VERBATIM 12-field arrays, the same incremental shape the collector's
    session digest uses, so a backfill is never held in memory to be hashed.

    There is no watermark here and that is not an omission: a one-shot walk moves its cursor
    forward monotonically and never revisits a bucket within the same run, so the collector's
    process-local dedupe would have nothing to refuse. Across runs `md.series` is append-only
    with `observed_at` in the primary key, and `as_of` reads `argmin(observed_at)` — the FIRST
    observation — so a second backfill appends rather than rewrites what the first one saw.
    """
    for kline in page.rows:
        digest.update(repr(kline.raw).encode("utf-8"))
    rows = to_rows(now_ms, symbol, page.rows)
    for row in rows:
        sink.accept(row, run_id=run_id)
    return len({row.bucket_end for row in rows}), len(rows)


def backfill_symbol(
    *,
    client: KlinesClient,
    connection: RespConnection,
    sink: RedisStreamSeriesSink,
    to_rows: KlinesToRows,
    digest: hashlib._Hash,
    config: BackfillConfig,
    symbol: str,
    run_id: str,
    now_ms: Callable[[], int],
    sleep: Callable[[float], None] = time.sleep,
) -> BackfillTotals:
    """Walk one symbol from `now - days` to the present, one `MAX_LIMIT` page at a time.

    The walk stops on the first of four REAL ends, never on a loop guard: the source answered an
    error envelope, the page came back empty, the page came back short of `MAX_LIMIT` (the
    source has no more in this window), or the cursor reached the present. Each page is preceded
    by `wait_for_drain`, so the job's rate is the writer's rate.
    """
    totals = BackfillTotals()
    cursor = now_ms() - config.days * MS_PER_DAY
    while True:
        wait_for_drain(connection=connection, config=config, sleep=sleep)
        page = client.klines(symbol, BACKFILL_INTERVAL, MAX_LIMIT, start_time_ms=cursor)
        totals = totals.plus(
            BackfillTotals(n_returned=len(page.rows), n_calls=1, api_code=page.api_code)
        )
        if page.api_code is not None:
            logger.warning(
                "backfill_page_refused",
                extra={
                    "endpoint": KLINES_ENDPOINT,
                    "symbol": symbol,
                    "api_code": page.api_code,
                    "status": page.status,
                },
            )
            break
        if not page.rows:
            break
        bars, rows = _publish_page(
            page=page,
            sink=sink,
            to_rows=to_rows,
            digest=digest,
            symbol=symbol,
            run_id=run_id,
            now_ms=now_ms(),
        )
        totals = totals.plus(BackfillTotals(n_published=bars, n_rows=rows))
        if len(page.rows) < MAX_LIMIT:
            break
        cursor = page.rows[-1].open_time_ms + KLINES_BUCKET_WIDTH_MS
        if cursor >= now_ms():
            break
    logger.info(
        "backfill_symbol_completed",
        extra={
            "endpoint": KLINES_ENDPOINT,
            "symbol": symbol,
            "n_returned": totals.n_returned,
            "n_published": totals.n_published,
            "n_rows": totals.n_rows,
            "n_calls": totals.n_calls,
        },
    )
    return totals


def run_backfill(
    *,
    config: BackfillConfig,
    client: KlinesClient,
    connection: RespConnection,
    sink: RedisStreamSeriesSink,
    to_rows: KlinesToRows,
    record_run: Callable[[IngestRun], None],
    now_ms: Callable[[], int] = _epoch_ms,
    iso_now: Callable[[], str] = _iso_now,
    sleep: Callable[[float], None] = time.sleep,
) -> int:
    """Run ONE pass over the symbol universe and return the process exit code.

    ⛔ THERE IS NO OUTER LOOP, AND ITS ABSENCE IS THE TASK. `ADR-027/D1` allows three long-lived
    processes and this is not one of them; `test_klines_backfill_cli.py` asserts the absence by
    running this function to completion with a scripted client, which a service would never do.

    One `IngestRun` for the whole pass, the unit `build_klines_run` already fixes ("the run is
    the thing the operator schedules, not the HTTP call"). A publish failure closes the run
    `REJECTED` and returns `1`; a page the SOURCE refused closes `ACCEPTED_WITH_WARNING` and
    returns `0`, the same distinction the collector draws between trouble upstream at Binance and
    trouble writing to our own queue.
    """
    run_id = str(uuid.uuid4())
    started_at = iso_now()
    digest = hashlib.sha256()
    totals = BackfillTotals()
    try:
        for symbol in config.symbols:
            totals = totals.plus(
                backfill_symbol(
                    client=client,
                    connection=connection,
                    sink=sink,
                    to_rows=to_rows,
                    digest=digest,
                    config=config,
                    symbol=symbol,
                    run_id=run_id,
                    now_ms=now_ms,
                    sleep=sleep,
                )
            )
    except _PUBLISH_FAILURE_EXCEPTIONS as failure:
        record_run(
            build_klines_run(
                started_at=started_at,
                ended_at=iso_now(),
                n_returned=totals.n_returned,
                n_calls=totals.n_calls,
                api_code=totals.api_code,
                verdict="REJECTED",
                notes=f"{type(failure).__name__}: {failure}",
                src_sha256=digest.hexdigest(),
                run_id=run_id,
            )
        )
        logger.error(
            "backfill_completed %s: %s",
            KLINES_ENDPOINT,
            failure,
            extra={
                "endpoint": KLINES_ENDPOINT,
                "n_published": totals.n_published,
                "n_rows": totals.n_rows,
                "verdict": "REJECTED",
                "run_id": run_id,
            },
            exc_info=True,
        )
        return 1
    verdict: KnownVerdict = "ACCEPTED" if totals.api_code is None else "ACCEPTED_WITH_WARNING"
    record_run(
        build_klines_run(
            started_at=started_at,
            ended_at=iso_now(),
            n_returned=totals.n_returned,
            n_calls=totals.n_calls,
            api_code=totals.api_code,
            verdict=verdict,
            src_sha256=digest.hexdigest(),
            run_id=run_id,
        )
    )
    logger.info(
        "backfill_completed",
        extra={
            "endpoint": KLINES_ENDPOINT,
            "days": config.days,
            "n_symbols": len(config.symbols),
            "n_returned": totals.n_returned,
            "n_published": totals.n_published,
            "n_rows": totals.n_rows,
            "n_calls": totals.n_calls,
            "verdict": verdict,
            "run_id": run_id,
        },
    )
    return 0


def main(argv: Sequence[str]) -> int:
    """Resolve, connect, run once, return — `rc != 0` naming the variable on any boot failure.

    `argv` is accepted (unused) for the uniform `main(argv) -> int` signature every CLI in this
    package carries, so the suite calls it directly without `sys.exit` escaping a test process.
    """
    del argv
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_service_stdout_handler())
    logger.propagate = False
    try:
        config = resolve_backfill_config(os.environ)
        boot = resolve_boot_config(os.environ)
    except CollectorBootConfigurationError as error:
        logger.error(
            "backfill_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    try:
        connection = connect_redis(boot)
    except CollectorBootConnectionError as error:
        logger.error(
            "backfill_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    try:
        store = compose_ingest_record_store(os.environ)
    except (IngestRecordStoreConfigurationError, IngestRecordStoreConnectionError) as error:
        logger.error(
            "backfill_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    # ⛔ `store.initialise()` IS NOT CALLED HERE, AND THE OMISSION IS THE REPAIR OF A REAL
    # OUTAGE THIS TASK CAUSED. `PostgresIngestRecordStore.initialise()` runs DDL — among it
    # `ALTER TABLE md.ingest_run ADD COLUMN IF NOT EXISTS writer_accounted_at TEXT` — and DDL
    # takes an `ACCESS EXCLUSIVE` lock on `md.ingest_run`. Postgres queues that lock request
    # AHEAD of every reader that arrives after it, so an ALTER that is itself blocked blocks
    # the single writer behind it. On 2026-09-19 that is exactly what happened: two sessions
    # of the API sat `idle in transaction` holding the relation (`05:26:26` and `04:08:09`),
    # this job's ALTER waited on them, and the writer's `UPDATE md.ingest_run` plus the
    # collector's `INSERT` were stuck behind it for `00:02:54` until the ALTER was cancelled
    # `[MEDIDO 2026-09-19: pg_stat_activity, n=5 backends, wait_event_type=Lock]`.
    #
    # A one-shot has no business owning the schema. The three long-lived processes
    # (`ADR-027/D1`) create it at their own boot; this job only APPENDS runs, and a job that
    # `cron` may fire daily must not take `ACCESS EXCLUSIVE` on a hot table every time it
    # starts. If the table is genuinely absent, `record_run` fails loudly naming it — which is
    # the honest failure, and a far cheaper one than stalling the writer.
    try:
        return run_backfill(
            config=config,
            client=BinanceKlinesClient(),
            connection=connection,
            sink=RedisStreamSeriesSink(connection, boot.redis_stream, boot.redis_stream_maxlen),
            to_rows=build_klines_to_rows(),
            record_run=store.record_run,
        )
    finally:
        connection.close()


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    raise SystemExit(main(sys.argv[1:]))
