"""`collectors_cli`: ONE process, TWO threads, boot fail-fast, `SIGTERM` closes cleanly.

`SPEC-004` §3.1, literal, is the contract this composition root implements: *"um processo, duas
threads (`forceOrder` stream; `premiumIndex` poll) ... boot (fail-fast, `RN-4`): resolve
`REDIS_HOST`/`REDIS_PORT`/`REDIS_STREAM`/`REDIS_STREAM_MAXLEN`, `INGEST_RECORD_BACKEND` ...,
`PREMIUM_INDEX_CYCLE_INTERVAL_S`; abre a conexao RESP (`connect_resp2`) e faz `PING`;
`describe_readiness()` do registro. Qualquer falha => `rc != 0` em <= 5 s, mensagem em ingles
nomeando a variavel; nenhum retry infinito no boot ... `SIGTERM` => fecha sessao corrente, grava
o `IngestRun` dela ... sai `rc=0`"*.

`ADR-027/D1` is why this is ONE process with THREADS and not two: the two collectors are the
only "capture-or-lose" surfaces (liquidation events, premium/funding polls), and today's code is
synchronous, without `asyncio`.

`docs/context/captura-em-producao/gates/Q3-run-definition.md` (signed 2026-09-07,
`quant-architect`) is the run-shape decision this module executes: §1 fixes what "one run" means
per producer (a stream SESSION, a poll CYCLE); §3 fixes the 16 `IngestRun` fields, including the
two physically-impossible sentinels (`CLOCK_SKEW_NOT_MEASURED_MS`, weight-not-readable). The
mapping itself — the two builders and the sentinels — lives in
`use_cases/collector_run_mapping.py` (`T-01.6`): a dedicated, tested module this composition root
calls at session/cycle close, so the mapping and this module's own tests share exactly one
construction, never two.

── WHAT THIS MODULE DELIBERATELY DOES NOT DECIDE, NAMED RATHER THAN HIDDEN ────────────────────

Turning ONE raw `!forceOrder@arr` liquidation or ONE `PremiumIndexReading` into the `SeriesRow`(s)
it becomes is a `SeriesKey` catalog decision — and `infra/redis_stream_series_sink.py`'s own
docstring already refuses to make it for the premiumIndex side ("no catalog for these two
producers exists yet ... Fixing that mapping here ... would be exactly the decision from premise
... already refuses"); `domain/price_source_catalog.py` independently confirms it, listing
`premium_index`/`index_price` in `PRICE_SOURCES` while explicitly NOT building catalog rows for
either ("cataloguing a series nobody reads yet would be a row with no evidence behind it"). This
module is the composition root, not the catalog owner: `premium_index_to_rows` and
`force_order_to_rows` are REQUIRED, INJECTED callables with NO real default. Left unsupplied,
`main()` wires `_mapping_not_decided_yet` (below), which raises loud, typed and immediately the
first time either thread would need to build a row — a misconfigured boot fails fast instead of
publishing a `SeriesRow` built from a guess. The offline suite exercises every other line of this
module (boot, threads, `SIGTERM`, run recording, the failure path) by injecting a trivial fake
mapping instead, exactly like `redis_stream_series_sink.py`'s own tests inject `to_rows`.
"""

from __future__ import annotations

import hashlib
import logging
import os
import signal
import sys
import threading
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from types import FrameType
from typing import Final

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.force_order_natural_key import (
    ForceOrderKeyExtractionError,
    extract_force_order_natural_key,
    trade_time_utc_date,
)
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.domain.quota_bucket import USED_WEIGHT_HEADER
from src.modules.sentimento.infra.binance_stream_probe import (
    BINANCE_FUTURES_STREAM_HOST,
    WebSocketMessageSource,
    connect_tls,
)
from src.modules.sentimento.infra.ingest_health_cli import (
    build_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.infra.premium_index_http_client import PremiumIndexHttpClient
from src.modules.sentimento.infra.redis_resp_client import (
    RedisCommandError,
    RedisProtocolError,
    RespConnection,
    SocketFactory,
    connect_resp2,
    open_tcp_socket,
)
from src.modules.sentimento.infra.redis_stream_bus import DEFAULT_STREAM_MAXLEN
from src.modules.sentimento.infra.redis_stream_series_sink import (
    PremiumIndexReadingToRows,
    RedisPremiumIndexSink,
    RedisStreamSeriesSink,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.collect_premium_index import (
    PremiumIndexCycleStage,
    PremiumIndexFetcher,
    RawPremiumIndexFetch,
    collect_premium_index_once,
)
from src.modules.sentimento.use_cases.collector_run_mapping import (
    FORCE_ORDER_ENDPOINT,
    KnownVerdict,
    build_force_order_run,
    build_premium_index_run,
)
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import (
    MessageSource,
    StreamTransportError,
)
from src.modules.sentimento.use_cases.reconnect_force_order_stream import reconnect_and_key

logger = logging.getLogger(__name__)

# ── ENV VARS THE BOOT RESOLVES, `SPEC-004` §3.1 ────────────────────────────────────────────
_REDIS_HOST_VAR: Final[str] = "REDIS_HOST"
_REDIS_PORT_VAR: Final[str] = "REDIS_PORT"
_REDIS_STREAM_VAR: Final[str] = "REDIS_STREAM"
_REDIS_STREAM_MAXLEN_VAR: Final[str] = "REDIS_STREAM_MAXLEN"
_INGEST_RECORD_BACKEND_VAR: Final[str] = "INGEST_RECORD_BACKEND"
_INGEST_HEALTH_STORE_PATH_VAR: Final[str] = "INGEST_HEALTH_STORE_PATH"
_PREMIUM_INDEX_CYCLE_INTERVAL_S_VAR: Final[str] = "PREMIUM_INDEX_CYCLE_INTERVAL_S"

_DEFAULT_REDIS_HOST: Final[str] = "localhost"
_DEFAULT_REDIS_PORT: Final[int] = 6379
_DEFAULT_REDIS_STREAM: Final[str] = "md.series.write"
_DEFAULT_INGEST_RECORD_BACKEND: Final[str] = "sqlite"
# Same default `src/main/__init__.py` uses for the same store — one composition root's default
# path is not a second decision, it is the same decision read twice.
_DEFAULT_INGEST_HEALTH_STORE_PATH: Final[str] = "data/md/ingest_health.sqlite3"
# `gates/Q3-run-definition.md` §4, `[Q2]`: "Decisao: 60 segundos."
_DEFAULT_PREMIUM_INDEX_CYCLE_INTERVAL_S: Final[float] = 60.0

# `D1.4`: `REDIS_HOST=nao-existe` has to produce `rc != 0` in <= 5 s. DNS failure against a
# nonexistent host resolves near-instantly; this timeout only bounds the case the address
# resolves but nothing answers, so boot never blocks past the falsifier's window.
_REDIS_CONNECT_TIMEOUT_S: Final[float] = 3.0

# `FORCE_ORDER_ENDPOINT` is imported (not redefined) from `collector_run_mapping` above — this
# module names the same `!forceOrder@arr` literal `_run_force_order_collector`'s log events use,
# and a second definition here would be the exact drift `T-01.6`'s extraction exists to prevent.

_JOIN_TIMEOUT_S: Final[float] = 30.0
_MAIN_LOOP_POLL_S: Final[float] = 0.05


class CollectorBootConfigurationError(RuntimeError):
    """One environment variable could not be parsed into valid boot configuration.

    `variable` is the SAME name `collector_boot_refused{variable}` (`SPEC-004` §3.7) carries,
    so the log event and the exception that produced it never drift apart.
    """

    def __init__(self, variable: str, message: str) -> None:
        """Bind the offending variable name alongside the human-readable `message`."""
        super().__init__(message)
        self.variable = variable


class CollectorBootConnectionError(RuntimeError):
    """Redis (or the record store) could not be reached at boot — `RN-4` fail-fast."""

    def __init__(self, variable: str, message: str) -> None:
        """Bind the variable that names WHICH resolved value failed to connect."""
        super().__init__(message)
        self.variable = variable


class SeriesRowMappingNotDecidedError(NotImplementedError):
    """The `SeriesKey` mapping for a raw event/reading is not decided yet — see module docstring."""


# Named, not caught as bare `Exception` (`core.silent-except`): every failure a publish attempt
# or a `!forceOrder@arr` reconnection can raise that `SPEC-004` §3.1's "falha ... em regime"
# covers — a refused or malformed `XADD` (`RedisCommandError`/`RedisProtocolError`), the
# connection dying mid-write or mid-reconnect (`OSError`, `StreamTransportError`), a row
# `SeriesRow.__post_init__` refuses (`ValueError` — also `ReconnectionGapError`'s base), or the
# mapping genuinely not being decided yet (`SeriesRowMappingNotDecidedError`). Anything OUTSIDE
# this tuple is a programming error this module does not know how to turn into a session close,
# and is left to propagate and crash the process loudly instead of being folded into `REJECTED`.
_PUBLISH_FAILURE_EXCEPTIONS: Final[tuple[type[Exception], ...]] = (
    RedisCommandError,
    RedisProtocolError,
    OSError,
    ValueError,
    StreamTransportError,
    SeriesRowMappingNotDecidedError,
)


@dataclass(frozen=True)
class BootConfig:
    """Every value `SPEC-004` §3.1's boot step resolves, before any socket opens."""

    redis_host: str
    redis_port: int
    redis_stream: str
    redis_stream_maxlen: int
    ingest_record_backend: str
    ingest_health_store_path: Path
    premium_index_cycle_interval_s: float


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


def resolve_boot_config(environ: Mapping[str, str]) -> BootConfig:
    """Resolve every boot value `SPEC-004` §3.1 names, or raise naming the offending variable.

    `INGEST_RECORD_BACKEND` is checked against the closed set THIS PHASE supports — `postgres`
    arrives with the shared composition of `T-02.4`, which this module does not anticipate
    (plan `01` item 1.3, "nao abre Postgres fora do composition root": there is no Postgres
    composition here to open).
    """
    backend = environ.get(_INGEST_RECORD_BACKEND_VAR, _DEFAULT_INGEST_RECORD_BACKEND)
    if backend != "sqlite":
        raise CollectorBootConfigurationError(
            _INGEST_RECORD_BACKEND_VAR,
            f"{_INGEST_RECORD_BACKEND_VAR}={backend!r} is not supported in phase F1 (only "
            "'sqlite' — the shared 'sqlite'|'postgres' composition arrives in T-02.4); refusing "
            "to boot rather than silently falling back",
        )
    return BootConfig(
        redis_host=environ.get(_REDIS_HOST_VAR, _DEFAULT_REDIS_HOST),
        redis_port=_parse_int(environ, _REDIS_PORT_VAR, _DEFAULT_REDIS_PORT),
        redis_stream=environ.get(_REDIS_STREAM_VAR, _DEFAULT_REDIS_STREAM),
        redis_stream_maxlen=_parse_int(environ, _REDIS_STREAM_MAXLEN_VAR, DEFAULT_STREAM_MAXLEN),
        ingest_record_backend=backend,
        ingest_health_store_path=Path(
            environ.get(_INGEST_HEALTH_STORE_PATH_VAR, _DEFAULT_INGEST_HEALTH_STORE_PATH)
        ),
        premium_index_cycle_interval_s=_parse_float(
            environ,
            _PREMIUM_INDEX_CYCLE_INTERVAL_S_VAR,
            _DEFAULT_PREMIUM_INDEX_CYCLE_INTERVAL_S,
        ),
    )


def connect_redis(config: BootConfig, open_socket: SocketFactory | None = None) -> RespConnection:
    """Open the RESP connection and `PING` it — `rc != 0` naming `REDIS_HOST` on any failure.

    `open_socket` is injectable (matching every other transport in this package) so the offline
    suite can point this at a real loopback `fakeredis.TcpFakeServer` instead of the network.
    """
    opener = open_socket or open_tcp_socket
    try:
        sock = opener(config.redis_host, config.redis_port)
    except OSError as error:
        raise CollectorBootConnectionError(
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
        raise CollectorBootConnectionError(
            _REDIS_HOST_VAR,
            f"Redis PING failed at {_REDIS_HOST_VAR}={config.redis_host!r}: {error}",
        ) from error
    if reply != b"PONG":
        connection.close()
        raise CollectorBootConnectionError(
            _REDIS_HOST_VAR,
            f"Redis at {_REDIS_HOST_VAR}={config.redis_host!r} did not answer PONG: {reply!r}",
        )
    return connection


def _epoch_ms() -> int:
    """Return the current instant as epoch milliseconds — the unit `SeriesRow` fields use."""
    return int(time.time() * 1000)


def _iso_now() -> str:
    """Return the current instant as an ISO-8601 UTC string — the unit `IngestRun` fields use."""
    return datetime.now(UTC).isoformat()


def _mapping_not_decided_yet(*_args: object, **_kwargs: object) -> Iterable[SeriesRow]:
    """Raise, loud, the first time either `to_rows` callable is needed — the real default.

    See the module docstring's "WHAT THIS MODULE DELIBERATELY DOES NOT DECIDE" — a misconfigured
    production boot must fail here rather than publish a `SeriesRow` guessed into existence.
    """
    raise SeriesRowMappingNotDecidedError(
        "the SeriesKey mapping for this producer's raw event/reading is not decided yet "
        "(no catalog exists for 'premium_index'/forceOrder liquidations — see "
        "infra/redis_stream_series_sink.py and domain/price_source_catalog.py); pass "
        "premium_index_to_rows=/force_order_to_rows= explicitly to run() to supply it"
    )


ForceOrderObservationToRows = Callable[[int, ForceOrderKeyObservation], Iterable[SeriesRow]]


class _CapturingPremiumIndexFetcher:
    """Wrap a `PremiumIndexFetcher`, remembering the last raw body — without changing its port.

    `collect_premium_index_once` never returns the raw body (plan item 1.3, "nao altera ... alem
    de reaproveitar suas funcoes" — its signature is not this task's to change), and `Q3` §3
    wants `src_sha256` over that exact body. Capturing it here, at the one call site this module
    owns, gets the hash without touching the use case's port.
    """

    def __init__(self, inner: PremiumIndexFetcher) -> None:
        """Wrap `inner`; nothing has been fetched yet."""
        self._inner = inner
        self.last_body: bytes | None = None

    def fetch(self) -> RawPremiumIndexFetch:
        """Delegate to `inner`, remembering the body before returning the fetch unchanged."""
        result = self._inner.fetch()
        self.last_body = result.body
        return result


# ── THE TWO COLLECTOR THREADS ───────────────────────────────────────────────────────────────


def _run_premium_index_collector(
    *,
    stop_event: threading.Event,
    failure_event: threading.Event,
    exit_code: list[int],
    fetcher: PremiumIndexFetcher,
    sink: RedisStreamSeriesSink,
    to_rows: PremiumIndexReadingToRows,
    record_run: Callable[[IngestRun], None],
    interval_s: float,
) -> None:
    """Poll `premiumIndex` every `interval_s`, recording one `IngestRun` per cycle (`Q3` §1.2).

    A cycle that never reaches `WRITTEN` (transport/decode/payload trouble upstream at Binance)
    records `ACCEPTED_WITH_WARNING` — nothing was published, but nothing tried to reach Redis
    either, so it is not the `SPEC-004` §3.1 "falha do Redis em regime" this module reserves
    `REJECTED` for. A publish failure (the sink's `XADD` itself raising) IS that case: it stops
    this thread, signals the OTHER thread to stop too, and sets `exit_code[0] = 1`.
    """
    capturing = _CapturingPremiumIndexFetcher(fetcher)
    premium_sink = RedisPremiumIndexSink(sink, to_rows)
    while not stop_event.is_set():
        started_at = _iso_now()
        try:
            result = collect_premium_index_once(
                capturing, premium_sink, _epoch_ms(), USED_WEIGHT_HEADER
            )
        except _PUBLISH_FAILURE_EXCEPTIONS as failure:
            ended_at = _iso_now()
            run = build_premium_index_run(
                started_at,
                ended_at,
                n_symbols=0,
                status=None,
                weight_used=None,
                verdict="REJECTED",
                src_sha256=hashlib.sha256(capturing.last_body or b"").hexdigest(),
            )
            record_run(run)
            logger.error(
                "collector_cycle_completed %s: %s",
                PREMIUM_INDEX_ENDPOINT,
                failure,
                extra={
                    "endpoint": PREMIUM_INDEX_ENDPOINT,
                    "n_published": 0,
                    "verdict": "REJECTED",
                    "run_id": run.run_id,
                },
                exc_info=True,
            )
            exit_code[0] = 1
            failure_event.set()
            return
        ended_at = _iso_now()
        verdict: KnownVerdict = (
            "ACCEPTED"
            if result.stage == PremiumIndexCycleStage.WRITTEN
            else "ACCEPTED_WITH_WARNING"
        )
        run = build_premium_index_run(
            started_at,
            ended_at,
            n_symbols=result.n_symbols,
            status=result.status,
            weight_used=result.weight_used,
            verdict=verdict,
            src_sha256=hashlib.sha256(capturing.last_body or b"").hexdigest(),
        )
        record_run(run)
        logger.info(
            "collector_cycle_completed",
            extra={
                "endpoint": PREMIUM_INDEX_ENDPOINT,
                "n_published": result.n_symbols,
                "verdict": verdict,
                "run_id": run.run_id,
            },
        )
        stop_event.wait(interval_s)


def _publish_raw_force_order_message(
    raw: str,
    sink: RedisStreamSeriesSink,
    to_rows: ForceOrderObservationToRows,
    digest: hashlib._Hash,
) -> int:
    """Key one raw message, build its row(s) and publish them; return how many were published.

    An unkeyable message (`ForceOrderKeyExtractionError`) is logged and skipped — `B2` names
    keying failure as a data problem with the raw line, never a reason to stop the session.
    """
    digest.update(raw.encode("utf-8"))
    try:
        key = extract_force_order_natural_key(raw)
    except ForceOrderKeyExtractionError:
        logger.warning("force_order_message_unkeyable", extra={"raw_preview": raw[:120]})
        return 0
    observation = ForceOrderKeyObservation(key=key, day=trade_time_utc_date(key.trade_time))
    published = 0
    for row in to_rows(_epoch_ms(), observation):
        sink.accept(row)
        published += 1
    return published


def _run_force_order_collector(
    *,
    stop_event: threading.Event,
    failure_event: threading.Event,
    exit_code: list[int],
    open_source: Callable[[], MessageSource],
    sink: RedisStreamSeriesSink,
    to_rows: ForceOrderObservationToRows,
    record_run: Callable[[IngestRun], None],
    source_holder: list[MessageSource | None],
) -> None:
    """Read `!forceOrder@arr` until told to stop, recording one `IngestRun` per SESSION close.

    `source_holder[0]` always names the currently-open source, so `run()`'s `SIGTERM` handler
    can force it closed from the main thread — that is what unblocks a read that is sitting in a
    blocking `recv` when the signal arrives (`B14`).

    A read that ends (`StopIteration`) while `stop_event` is NOT set is an unrequested
    disconnect: `reconnect_and_key` (`B1`, `ADR-004`) opens the next session before closing this
    one's read loop. A read that FAILS for any other reason is `SPEC-004` §3.1's "falha ... em
    regime": the session closes `REJECTED`, the OTHER thread is told to stop too, and
    `exit_code[0] = 1`.
    """
    source = open_source()
    source_holder[0] = source
    source.open()
    started_at = _iso_now()
    digest = hashlib.sha256()
    n_published = 0
    verdict: KnownVerdict = "ACCEPTED"
    messages = source.messages()
    try:
        while True:
            try:
                raw = next(messages)
            except StopIteration:
                if stop_event.is_set():
                    break
                new_source = open_source()
                outcome = reconnect_and_key(source, new_source, (), time.monotonic)
                source = new_source
                source_holder[0] = source
                messages = source.messages()
                for observation in outcome.observations:
                    digest.update(str(observation.key).encode("utf-8"))
                    for row in to_rows(_epoch_ms(), observation):
                        sink.accept(row)
                        n_published += 1
                continue
            if stop_event.is_set():
                break
            n_published += _publish_raw_force_order_message(raw, sink, to_rows, digest)
    except _PUBLISH_FAILURE_EXCEPTIONS as failure:
        logger.error(
            "collector_session_closed %s: %s",
            FORCE_ORDER_ENDPOINT,
            failure,
            extra={"endpoint": FORCE_ORDER_ENDPOINT, "verdict": "REJECTED"},
            exc_info=True,
        )
        verdict = "REJECTED"
        exit_code[0] = 1
        failure_event.set()
    finally:
        source.close()
        ended_at = _iso_now()
        run = build_force_order_run(started_at, ended_at, n_published, verdict, digest)
        record_run(run)
        logger.info(
            "collector_session_closed",
            extra={
                "endpoint": FORCE_ORDER_ENDPOINT,
                "n_published": n_published,
                "verdict": verdict,
                "run_id": run.run_id,
            },
        )


# ── THE COMPOSITION ITSELF ──────────────────────────────────────────────────────────────────


def run(
    *,
    config: BootConfig,
    connection: RespConnection,
    store: SqliteIngestRecordStore,
    force_order_source_factory: Callable[[], MessageSource] | None = None,
    premium_index_fetcher_factory: Callable[[], PremiumIndexFetcher] | None = None,
    premium_index_to_rows: PremiumIndexReadingToRows | None = None,
    force_order_to_rows: ForceOrderObservationToRows | None = None,
    stop_event: threading.Event | None = None,
) -> int:
    """Start both collector threads, install `SIGTERM`, and wait for a clean or a failed exit.

    Every network-touching default is injectable, matching every other CLI in this package —
    left to default, `force_order_source_factory` opens a real `!forceOrder@arr` WebSocket and
    `premium_index_fetcher_factory` opens a real HTTPS client; the offline suite injects fakes
    for both, exactly like `premium_index_probe_cli.py`/`force_order_collector_cli.py` already do.
    """
    open_force_order_source = force_order_source_factory or (
        lambda: WebSocketMessageSource(
            BINANCE_FUTURES_STREAM_HOST,
            "/ws/!forceOrder@arr",
            lambda: connect_tls(BINANCE_FUTURES_STREAM_HOST),
        )
    )
    build_premium_index_fetcher = premium_index_fetcher_factory or PremiumIndexHttpClient
    premium_to_rows = premium_index_to_rows or _mapping_not_decided_yet
    force_order_to_rows_ = force_order_to_rows or _mapping_not_decided_yet

    sink = RedisStreamSeriesSink(connection, config.redis_stream, config.redis_stream_maxlen)
    stop = stop_event or threading.Event()
    failure = threading.Event()
    exit_code: list[int] = [0]
    source_holder: list[MessageSource | None] = [None]

    def _handle_sigterm(_signum: int, _frame: FrameType | None) -> None:
        stop.set()
        current = source_holder[0]
        if current is not None:
            try:
                current.close()
            except OSError:
                logger.debug("force_order_source_close_on_sigterm_failed", exc_info=True)

    previous_handler = signal.signal(signal.SIGTERM, _handle_sigterm)
    force_order_thread = threading.Thread(
        target=_run_force_order_collector,
        name="collector-force-order",
        kwargs={
            "stop_event": stop,
            "failure_event": failure,
            "exit_code": exit_code,
            "open_source": open_force_order_source,
            "sink": sink,
            "to_rows": force_order_to_rows_,
            "record_run": store.record_run,
            "source_holder": source_holder,
        },
    )
    premium_index_thread = threading.Thread(
        target=_run_premium_index_collector,
        name="collector-premium-index",
        kwargs={
            "stop_event": stop,
            "failure_event": failure,
            "exit_code": exit_code,
            "fetcher": build_premium_index_fetcher(),
            "sink": sink,
            "to_rows": premium_to_rows,
            "record_run": store.record_run,
            "interval_s": config.premium_index_cycle_interval_s,
        },
    )
    try:
        force_order_thread.start()
        premium_index_thread.start()
        while not stop.is_set() and not failure.is_set():
            time.sleep(_MAIN_LOOP_POLL_S)
        if failure.is_set() and not stop.is_set():
            stop.set()
            current = source_holder[0]
            if current is not None:
                try:
                    current.close()
                except OSError:
                    logger.debug("force_order_source_close_on_failure_failed", exc_info=True)
        force_order_thread.join(timeout=_JOIN_TIMEOUT_S)
        premium_index_thread.join(timeout=_JOIN_TIMEOUT_S)
    finally:
        signal.signal(signal.SIGTERM, previous_handler)
    return exit_code[0]


def main(argv: Sequence[str]) -> int:
    """Resolve boot config, connect, and run — `rc != 0` naming the variable on any boot failure.

    `argv` is accepted (unused) for the same reason every CLI in this package takes it: a
    uniform `main(argv) -> int` signature the suite calls directly, without `sys.exit` escaping
    a test process.
    """
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    logger.propagate = False
    try:
        config = resolve_boot_config(os.environ)
    except CollectorBootConfigurationError as error:
        logger.error(
            "collector_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    try:
        connection = connect_redis(config)
    except CollectorBootConnectionError as error:
        logger.error(
            "collector_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    store = SqliteIngestRecordStore(config.ingest_health_store_path)
    store.initialise()
    store.describe_readiness()
    return run(config=config, connection=connection, store=store)


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    raise SystemExit(main(sys.argv[1:]))
