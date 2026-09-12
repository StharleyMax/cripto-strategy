"""`collectors_cli`: ONE process, THREE threads, boot fail-fast, `SIGTERM` closes cleanly.

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

── THE THIRD THREAD, AND WHY `SPEC-004`'s "duas threads" STILL HOLDS ───────────────────────────

`T-01.3` (`SPEC-007` phase `01`) adds `_run_klines_collector`, so the sentence above reads TWO
and the process now runs THREE. That is not a contradiction being papered over: `SPEC-004` §3.1
enumerated the producers that EXISTED when it was written, and `ADR-027/D1`'s actual decision —
one synchronous process, one thread per capture surface, no `asyncio` — is what a third producer
extends rather than violates. `/fapi/v1/klines` is NOT a capture-or-lose surface (it is a REST
history, deep since 2019-09-08 `[MEDIDO 2026-09-10, SPEC-007 §9.2]`, re-readable at will), which
is exactly why it can afford to share a process with two surfaces that are. The alternative — a
fourth container for a poll that spends `4` of `2400` weight per minute — is the cost `ADR-027/D1`
already refused for the other two.

`docs/context/captura-em-producao/gates/Q3-run-definition.md` (signed 2026-09-07,
`quant-architect`) is the run-shape decision this module executes: §1 fixes what "one run" means
per producer (a stream SESSION, a poll CYCLE); §3 fixes the 16 `IngestRun` fields, including the
two physically-impossible sentinels (`CLOCK_SKEW_NOT_MEASURED_MS`, weight-not-readable). The
mapping itself — the two builders and the sentinels — lives in
`use_cases/collector_run_mapping.py` (`T-01.6`): a dedicated, tested module this composition root
calls at session/cycle close, so the mapping and this module's own tests share exactly one
construction, never two.

── THE `SeriesKey` MAPPING, AND WHERE IT NOW LIVES ─────────────────────────────────────────────

Turning ONE raw `!forceOrder@arr` liquidation or ONE `PremiumIndexReading` into the `SeriesRow`(s)
it becomes is a `SeriesKey` catalog decision. `infra/redis_stream_series_sink.py` and
`domain/price_source_catalog.py` both refused to make it at `T-01.4` ("no catalog for these two
producers exists yet ... this task's dependencies do not resolve it") — correctly, at the time:
no run-shape, no symbol universe and no consumer existed yet. That refusal outlived its own
justification: `main()` shipped with `premium_index_to_rows`/`force_order_to_rows` REQUIRED but
UNSUPPLIED, so every real boot fell through to `_mapping_not_decided_yet` (below) on the first
non-empty read — `[MEDIDO 2026-09-08]`, `docker inspect deploy-collector-1 --format
'{{.RestartCount}}'` -> 55 restarts in ~10 min
(`docs/context/captura-em-producao/medicoes/CA-F3-8-pegada.md` §1.1). `main()` now supplies the
REAL mapping — `use_cases/collector_series_mapping.py` (`quant-architect`, `T-05.3`), covering the
owner's declared four-symbol initial universe (`INITIAL_SYMBOLS` there) over the metrics that
module names a precedent for. `run()` keeps both parameters INJECTABLE (not hardcoded) so the
offline suite still exercises every other line of this module (boot, threads, `SIGTERM`, run
recording, the failure path) against a trivial fake mapping, exactly like
`redis_stream_series_sink.py`'s own tests inject `to_rows` — `_mapping_not_decided_yet` stays the
default `run()` falls back to when a CALLER (a test, or a future composition root) omits both,
so a misconfigured boot still fails loud rather than publishing a `SeriesRow` built from a guess.
"""

from __future__ import annotations

import hashlib
import logging
import os
import signal
import sys
import threading
import time
import uuid
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from types import FrameType
from typing import Final, Protocol

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
from src.modules.sentimento.infra.binance_klines_client import (
    MAX_LIMIT,
    BinanceKlinesClient,
    KlinesPageResponse,
)
from src.modules.sentimento.infra.binance_stream_probe import (
    BINANCE_FUTURES_STREAM_HOST,
    StreamIdleTimeoutError,
    WebSocketMessageSource,
    combined_stream_path,
    connect_tls,
)
from src.modules.sentimento.infra.ingest_health_cli import (
    build_service_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.infra.ingest_record_store_composition import (
    DEFAULT_INGEST_HEALTH_STORE_PATH,
    DEFAULT_INGEST_RECORD_BACKEND,
    INGEST_HEALTH_STORE_PATH_VAR,
    INGEST_RECORD_BACKEND_VAR,
    KNOWN_INGEST_RECORD_BACKENDS,
    IngestRecordStore,
    IngestRecordStoreConfigurationError,
    IngestRecordStoreConnectionError,
    compose_ingest_record_store,
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
from src.modules.sentimento.use_cases.collect_premium_index import (
    PremiumIndexCycleStage,
    PremiumIndexFetcher,
    RawPremiumIndexFetch,
    collect_premium_index_once,
)
from src.modules.sentimento.use_cases.collector_run_mapping import (
    FORCE_ORDER_ENDPOINT,
    KLINES_ENDPOINT,
    KnownVerdict,
    build_force_order_run,
    build_klines_run,
    build_premium_index_run,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    INITIAL_SYMBOLS,
    KLINES_BUCKET_WIDTH_MS,
    KlinesToRows,
    build_force_order_to_rows,
    build_klines_to_rows,
    build_premium_index_to_rows,
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
# `INGEST_RECORD_BACKEND_VAR`/`INGEST_HEALTH_STORE_PATH_VAR` are imported (not redefined) from
# `ingest_record_store_composition` above — `T-02.4`'s whole point is that the var names and
# the closed `sqlite`|`postgres` set live in exactly one place, shared by every composition
# root this phase has (this module, `single_writer_cli` in `T-02.5`, `src.main` in `T-02.6`).
_PREMIUM_INDEX_CYCLE_INTERVAL_S_VAR: Final[str] = "PREMIUM_INDEX_CYCLE_INTERVAL_S"

# ── `RS-3.5`: THE KLINES CADENCE IS CONFIGURATION, NEVER A CONSTANT IN CODE ────────────────
#
# `T-01.3`, literal: *"Cadencia em CONFIGURACAO, nunca constante em codigo (RS-3.5): e a unica
# variavel que paga cota, e grava-la em codigo transforma ajuste de configuracao em release."*
# Both values below are resolved from the environment exactly like
# `PREMIUM_INDEX_CYCLE_INTERVAL_S` already is — the defaults here are the value an UNSET
# environment gets, not the value the code imposes. `deploy/compose.yml` documents both on the
# `collector` service, and the operator sets them in `.env` (which `env_file:` supplies), the
# same route every other collector variable already takes.
_KLINES_CYCLE_INTERVAL_S_VAR: Final[str] = "KLINES_CYCLE_INTERVAL_S"
_KLINES_BACKFILL_DAYS_VAR: Final[str] = "KLINES_BACKFILL_DAYS"

_DEFAULT_REDIS_HOST: Final[str] = "localhost"
_DEFAULT_REDIS_PORT: Final[int] = 6379
_DEFAULT_REDIS_STREAM: Final[str] = "md.series.write"
# `gates/Q3-run-definition.md` §4, `[Q2]`: "Decisao: 60 segundos."
_DEFAULT_PREMIUM_INDEX_CYCLE_INTERVAL_S: Final[float] = 60.0

# One minute: `klines_volume` is an `interval="1m"` series (`SPEC-007` §4.1), so a cycle
# shorter than the bar it collects buys nothing but quota, and a longer one leaves the newest
# closed bar unpublished for the difference. Quota is not the binding constraint here — weight
# 1 per call against 2400 weight/min per IP `[MEDIDO 2026-09-10: sequencia 31->32->33]`, so
# four symbols at 60 s spend `4` of `2400`.
_DEFAULT_KLINES_CYCLE_INTERVAL_S: Final[float] = 60.0

# `T-01.3`: *"backfill_dias = 7, uma vez, no boot: 7 x 1440 = 10.080 barras = 7 chamadas de
# 1500. Da 672 candles de 15min e 42 de 4h — a menor e a maior unidade de operacao declarada
# (D5, owner) tem forma na tela."*
_DEFAULT_KLINES_BACKFILL_DAYS: Final[int] = 7

_MS_PER_DAY: Final[int] = 86_400_000

# `SPEC-007` §4.1's normative row for M1 — the `interval` term of the `SeriesKey`, and the
# `interval` query parameter of `/fapi/v1/klines`, which for this series are the same string
# because M1 is collected on the grid the source itself publishes (`native_grid = "1min"`).
_KLINES_INTERVAL: Final[str] = "1m"

# Two extra bars beyond what the configured cadence can possibly have closed. The watermark
# (`_run_klines_collector`) already stops a re-read from republishing a bar, so the overlap
# costs nothing and buys self-healing: a cycle the process slept through, or a bar the source
# published late, is picked up by the next one instead of leaving a permanent hole.
_KLINES_TAIL_MARGIN_BARS: Final[int] = 2

# `D1.4`: `REDIS_HOST=nao-existe` has to produce `rc != 0` in <= 5 s. DNS failure against a
# nonexistent host resolves near-instantly; this timeout only bounds the case the address
# resolves but nothing answers, so boot never blocks past the falsifier's window.
_REDIS_CONNECT_TIMEOUT_S: Final[float] = 3.0

# `FORCE_ORDER_ENDPOINT` is imported (not redefined) from `collector_run_mapping` above — this
# module names the same `!forceOrder@arr` literal `_run_force_order_collector`'s log events use,
# and a second definition here would be the exact drift `T-01.6`'s extraction exists to prevent.

_JOIN_TIMEOUT_S: Final[float] = 30.0
_MAIN_LOOP_POLL_S: Final[float] = 0.05

# `[MEDIDO 2026-09-08]`, `docker inspect deploy-collector-1`: 53 restarts/11min, every cycle
# `collector_session_closed !forceOrder@arr: FRAME: timeout: The read operation timed out` —
# `docs/context/captura-em-producao/handoff/forceorder-arr-crash-loop.md` traced this to TWO
# compounding facts, and the ORIGINAL `_FORCE_ORDER_READ_TIMEOUT_S = 900.0` here fixed only the
# first (the per-symbol combined stream, in `_default_force_order_source` below). The second —
# `_PUBLISH_FAILURE_EXCEPTIONS` treating every read timeout as fatal `REJECTED` — is what `ADR-004`
# Emenda D5/D6 (2026-09-08) fixes: a single 900s socket timeout was doing TWO jobs (read
# granularity AND the life-or-death verdict) with ONE number, and the fix is `docs/context/
# captura-em-producao/gates/forceorder-fix-quant-architect.md` §"O que fica em aberto" already
# named — two numbers, two jobs. `!forceOrder@arr` (the whole-market `@arr` array stream)
# delivered ZERO events to this host across >300s combined, INCLUDING a guaranteed 1msg/s control
# stream that also silenced — re-measured live in the same handoff; even the per-symbol combined
# stream this module uses instead is sparse enough that blocking a read on it for minutes is
# normal, healthy behaviour, not a sign of death.
#
# `_FORCE_ORDER_RECV_GRANULARITY_S` is the socket's OWN `settimeout()` — how often a blocking
# `recv()` call returns control to `WebSocketMessageSource._read_exact`'s retry loop so the idle
# clock below can advance and `SIGTERM` (`B14`) is never stuck behind a giant timeout. It is NOT
# a verdict: a single expiry just means "try again", per `ADR-004` D5's table.
_FORCE_ORDER_RECV_GRANULARITY_S: Final[float] = 20.0

# `_FORCE_ORDER_IDLE_TIMEOUT_S` IS the verdict: accumulated silence of ANY frame (not just a
# domain message — a `PING` answered by `rfc6455_client.build_pong_frame` counts as activity)
# across repeated `_FORCE_ORDER_RECV_GRANULARITY_S` ticks. `[INFERRED: ADR-004 D5]` — 2x
# Binance's documented 3-minute `ping` cadence, with margin, comfortably below the 10-minute
# window in which Binance itself would close the socket: "the websocket server will send a ping
# frame every 3 minutes... if the... server does not receive a pong frame back... within a 10
# minute period, the connection will be disconnected"
# (https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-api-general-info,
# read 2026-09-08). Crossing this raises `StreamIdleTimeoutError`, a DISTINCT type from the
# generic `StreamTransportError` `_PUBLISH_FAILURE_EXCEPTIONS` still treats as fatal — see
# `_run_force_order_collector`'s read loop, which routes it through the SAME reconnection path as
# a clean `StopIteration`, never through `_PUBLISH_FAILURE_EXCEPTIONS`.
_FORCE_ORDER_IDLE_TIMEOUT_S: Final[float] = 300.0


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
    klines_cycle_interval_s: float
    klines_backfill_days: int


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


def _positive_float(environ: Mapping[str, str], variable: str, default: float) -> float:
    """Parse `variable` as a float that must be `> 0`, refusing at BOOT rather than at use.

    `RN-4` fail-fast: a cadence of `0` (or a negative one) makes `stop_event.wait(interval)`
    return immediately, so the collector would hammer `/fapi/v1/klines` in a tight loop and be
    banned by the venue — a failure that surfaces minutes later, far from the typo that caused
    it, and only as an HTTP `418`. Refusing here names the variable while the process is still
    in its first five seconds (`SPEC-004` §3.1).
    """
    value = _parse_float(environ, variable, default)
    if value <= 0:
        raise CollectorBootConfigurationError(
            variable, f"{variable} must be greater than zero, got {value!r}"
        )
    return value


def _positive_int(environ: Mapping[str, str], variable: str, default: int) -> int:
    """Parse `variable` as an integer that must be `> 0` — same `RN-4` reasoning as above.

    Zero backfill days is refused rather than treated as "no backfill": a silent `0` is
    indistinguishable from a typo, and `SPEC-007`'s phase `01` `DoD-1` (`>= 10.000` rows) is
    exactly what a silently skipped backfill would fail, hours later, with no line naming the
    cause. An operator who genuinely wants a shorter history sets `1`, which is a statement.
    """
    value = _parse_int(environ, variable, default)
    if value <= 0:
        raise CollectorBootConfigurationError(
            variable, f"{variable} must be greater than zero, got {value!r}"
        )
    return value


def resolve_boot_config(environ: Mapping[str, str]) -> BootConfig:
    """Resolve every boot value `SPEC-004` §3.1 names, or raise naming the offending variable.

    `INGEST_RECORD_BACKEND` is checked HERE, eagerly, against the shared closed set
    (`KNOWN_INGEST_RECORD_BACKENDS`) — BEFORE `connect_redis` ever opens a socket. That
    ordering is the point: `D2.5`'s falsifier sets `INGEST_RECORD_BACKEND=foo` with no
    guarantee Redis is reachable either, and the failure has to name `INGEST_RECORD_BACKEND`,
    never `REDIS_HOST`, regardless of what else in the environment is broken. The actual store
    (which DOES touch the network for `postgres`) is composed later, in `main()`, via
    `compose_ingest_record_store` — the shared function `T-02.4` introduces so this module,
    `single_writer_cli` (`T-02.5`) and `src.main` (`T-02.6`) never re-derive the same decision.
    """
    backend = environ.get(INGEST_RECORD_BACKEND_VAR, DEFAULT_INGEST_RECORD_BACKEND)
    if backend not in KNOWN_INGEST_RECORD_BACKENDS:
        raise CollectorBootConfigurationError(
            INGEST_RECORD_BACKEND_VAR,
            f"{INGEST_RECORD_BACKEND_VAR}={backend!r} is not one of "
            f"{sorted(KNOWN_INGEST_RECORD_BACKENDS)}",
        )
    return BootConfig(
        redis_host=environ.get(_REDIS_HOST_VAR, _DEFAULT_REDIS_HOST),
        redis_port=_parse_int(environ, _REDIS_PORT_VAR, _DEFAULT_REDIS_PORT),
        redis_stream=environ.get(_REDIS_STREAM_VAR, _DEFAULT_REDIS_STREAM),
        redis_stream_maxlen=_parse_int(environ, _REDIS_STREAM_MAXLEN_VAR, DEFAULT_STREAM_MAXLEN),
        ingest_record_backend=backend,
        ingest_health_store_path=Path(
            environ.get(INGEST_HEALTH_STORE_PATH_VAR, DEFAULT_INGEST_HEALTH_STORE_PATH)
        ),
        premium_index_cycle_interval_s=_parse_float(
            environ,
            _PREMIUM_INDEX_CYCLE_INTERVAL_S_VAR,
            _DEFAULT_PREMIUM_INDEX_CYCLE_INTERVAL_S,
        ),
        klines_cycle_interval_s=_positive_float(
            environ, _KLINES_CYCLE_INTERVAL_S_VAR, _DEFAULT_KLINES_CYCLE_INTERVAL_S
        ),
        klines_backfill_days=_positive_int(
            environ, _KLINES_BACKFILL_DAYS_VAR, _DEFAULT_KLINES_BACKFILL_DAYS
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
    while not stop_event.is_set():
        # `ADR-035/D2`: the id is minted at cycle OPEN, not at cycle close, because the rows
        # this cycle publishes have to CARRY it — the writer credits `n_written` back onto the
        # run they name. `T-01.4` made `run_id` a parameter of `build_premium_index_run` for
        # exactly this call, and until this line existed no `run_id` ever reached the stream:
        # `uptimePercent` was `0.0` structurally, not because nothing was written.
        run_id = str(uuid.uuid4())
        premium_sink = RedisPremiumIndexSink(sink, to_rows, run_id)
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
                run_id=run_id,
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
            run_id=run_id,
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
    session_id: str,
    run_id: str,
) -> int:
    """Key one raw message, build its row(s) and publish them; return how many were published.

    An unkeyable message (`ForceOrderKeyExtractionError`) is logged and skipped — `B2` names
    keying failure as a data problem with the raw line, never a reason to stop the session.
    Every message that reaches this function (keyable or not) is logged at receipt — the happy
    path used to be silent end to end, which is why "is `forceOrder` really receiving data" could
    only be answered by an ad hoc raw-frame probe instead of `docker logs`.

    `run_id` is the SESSION's id (`Q3` §1.1: "one run" for this producer is one stream
    session), minted at session OPEN so every row this message becomes carries the run the
    writer will credit `n_written` back onto (`ADR-035/D2`).
    """
    logger.info(
        "force_order_message_received",
        extra={"session_id": session_id, "raw_preview": raw[:120]},
    )
    digest.update(raw.encode("utf-8"))
    try:
        key = extract_force_order_natural_key(raw)
    except ForceOrderKeyExtractionError:
        logger.warning(
            "force_order_message_unkeyable",
            extra={"session_id": session_id, "raw_preview": raw[:120]},
        )
        return 0
    observation = ForceOrderKeyObservation(key=key, day=trade_time_utc_date(key.trade_time))
    published = 0
    for row in to_rows(_epoch_ms(), observation):
        sink.accept(row, run_id=run_id)
        published += 1
    logger.info(
        "force_order_message_published",
        extra={"session_id": session_id, "n_published": published},
    )
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
    """Read `forceOrder` until told to stop, recording one `IngestRun` per SESSION close.

    `source_holder[0]` always names the currently-open source, so `run()`'s `SIGTERM` handler
    can force it closed from the main thread — that is what unblocks a read that is sitting in a
    blocking `recv` when the signal arrives (`B14`).

    A read that ends (`StopIteration`, clean `OPCODE_CLOSE`) OR that times out from idle silence
    of ANY frame (`StreamIdleTimeoutError`, `ADR-004` Emenda D5) while `stop_event` is NOT set is
    an unrequested disconnect: `reconnect_and_key` (`B1`, `ADR-004`) opens the next session before
    closing this one's read loop, in BOTH cases, by the SAME route — Emenda D6 named this
    explicitly: idle silence is not a fatal timeout, it reconnects exactly like a clean close. A
    read that FAILS for any other reason (including failing to OPEN the substitute connection —
    unchanged, still fatal) is `SPEC-004` §3.1's "falha ... em regime": the session closes
    `REJECTED`, the OTHER thread is told to stop too, and `exit_code[0] = 1`.

    `endpoint` — the value every `IngestRun`/log line below names — is read off `source.path`
    when `open_source()` returns something that declares it (`WebSocketMessageSource` does,
    real or faked), falling back to the legacy `FORCE_ORDER_ENDPOINT` literal for a double that
    does not (`docs/context/captura-em-producao/gates/forceorder-fix-qa.md`: recording the
    hardcoded literal regardless of what `open_source` actually opened is the defect this reads
    fixes — a `!forceOrder@arr` label surviving the move to a combined per-symbol stream would
    make `collector_status.py`'s dashboard, and a future incident's own log line, lie about
    which stream is connected). Computed ONCE, from the FIRST source: every reconnect
    (`reconnect_and_key`, below) opens a new socket through the SAME `open_source` factory, so
    the endpoint identity does not change mid-session.
    """
    session_id = uuid.uuid4().hex[:12]
    # `ADR-035/D2`, and it is a SECOND id rather than a reuse of `session_id`: `session_id` is
    # a short log correlator (12 hex chars, deliberately not unique-by-construction), while
    # `run_id` is the PRIMARY KEY of `md.ingest_run` that the writer's `ON CONFLICT (run_id)`
    # upsert credits against. Minted HERE, at session open, because the rows published below
    # have to carry it — the run the writer closes has to be the run the collector opened.
    run_id = str(uuid.uuid4())
    source = open_source()
    endpoint: str = getattr(source, "path", FORCE_ORDER_ENDPOINT)
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
            except (StopIteration, StreamIdleTimeoutError) as disconnect:
                if stop_event.is_set():
                    break
                logger.info(
                    "force_order_session_reconnect",
                    extra={
                        "session_id": session_id,
                        "endpoint": endpoint,
                        "reason": type(disconnect).__name__,
                        "n_published_so_far": n_published,
                    },
                )
                new_source = open_source()
                outcome = reconnect_and_key(source, new_source, (), time.monotonic)
                source = new_source
                source_holder[0] = source
                messages = source.messages()
                for observation in outcome.observations:
                    digest.update(str(observation.key).encode("utf-8"))
                    for row in to_rows(_epoch_ms(), observation):
                        sink.accept(row, run_id=run_id)
                        n_published += 1
                continue
            if stop_event.is_set():
                break
            n_published += _publish_raw_force_order_message(
                raw, sink, to_rows, digest, session_id, run_id
            )
    except _PUBLISH_FAILURE_EXCEPTIONS as failure:
        logger.error(
            "collector_session_closed %s: %s",
            endpoint,
            failure,
            extra={"session_id": session_id, "endpoint": endpoint, "verdict": "REJECTED"},
            exc_info=True,
        )
        verdict = "REJECTED"
        exit_code[0] = 1
        failure_event.set()
    finally:
        source.close()
        ended_at = _iso_now()
        run = build_force_order_run(
            started_at, ended_at, n_published, verdict, digest, endpoint, run_id
        )
        record_run(run)
        logger.info(
            "collector_session_closed",
            extra={
                "session_id": session_id,
                "endpoint": endpoint,
                "n_published": n_published,
                "verdict": verdict,
                "run_id": run.run_id,
            },
        )


# ── THE THIRD COLLECTOR: `/fapi/v1/klines` (`T-01.3`) ───────────────────────────────────────


class KlinesClient(Protocol):
    """The one call `_run_klines_collector` makes — `infra/binance_klines_client` satisfies it.

    Named as a `Protocol` for the same reason every other transport in this module is
    injectable: the offline suite (`backend/scripts/test.sh`'s "ZERO REDE") substitutes a fake
    that answers scripted pages, and production gets `BinanceKlinesClient`.
    """

    def klines(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = ...,
        end_time_ms: int | None = ...,
    ) -> KlinesPageResponse:
        """Return one page of klines for `symbol`, preserving all 12 fields of every array."""
        ...


@dataclass(frozen=True)
class _KlinesPassTotals:
    """What one pass over the symbol universe measured — the operands of `build_klines_run`.

    `n_returned` and `n_published` are deliberately SEPARATE: their difference is the size of
    the `RS-3.4` anti-lookahead cut plus whatever the watermark already had, and collapsing
    them would make the cut invisible in exactly the record an operator would consult to ask
    whether it is happening at all.

    Both count BARS, and they have to keep counting bars for that subtraction to mean anything:
    since `T-02.3` one bar becomes two `SeriesRow`s (see `_publish_klines_page`), so a
    row-counting `n_published` would exceed `n_returned` and turn the cut's size negative.
    """

    n_returned: int = 0
    n_published: int = 0
    n_calls: int = 0
    api_code: int | None = None

    def plus(self, other: _KlinesPassTotals) -> _KlinesPassTotals:
        """Fold another symbol's totals in; the FIRST `api_code` seen is the one kept."""
        return _KlinesPassTotals(
            n_returned=self.n_returned + other.n_returned,
            n_published=self.n_published + other.n_published,
            n_calls=self.n_calls + other.n_calls,
            api_code=self.api_code if self.api_code is not None else other.api_code,
        )


def _tail_limit(interval_s: float) -> int:
    """How many of the newest bars one periodic cycle asks for — cadence plus a fixed margin.

    Derived from the CONFIGURED cadence rather than fixed in code (`RS-3.5`): raising
    `KLINES_CYCLE_INTERVAL_S` to 10 minutes must widen the page to cover those ten bars, or
    the collector would silently publish one bar in ten. Capped at the endpoint's own
    `MAX_LIMIT`, which is a fact of the provider and not a setting.
    """
    bars_per_cycle = int(interval_s // (KLINES_BUCKET_WIDTH_MS / 1000))
    return min(MAX_LIMIT, bars_per_cycle + _KLINES_TAIL_MARGIN_BARS)


def _publish_klines_page(
    *,
    page: KlinesPageResponse,
    sink: RedisStreamSeriesSink,
    to_rows: KlinesToRows,
    digest: hashlib._Hash,
    symbol: str,
    run_id: str,
    watermark: dict[str, int],
) -> int:
    """Publish the CLOSED, not-yet-seen bars of one page; return how many BARS reached the stream.

    ⛔ BARS, NOT ROWS, AND SINCE `T-02.3` THOSE ARE DIFFERENT NUMBERS. `build_klines_to_rows`
    now emits TWO rows per closed bar (`klines_volume` and `cvd_source`/`kline_takerbuy`, two
    identities off one array). Returning `len(rows)` would double `n_published` and silently
    destroy the one reading `_KlinesPassTotals` promises for it — that `n_returned -
    n_published` is the size of the `RS-3.4` anti-lookahead cut plus the watermark. Counting
    DISTINCT `bucket_end`s keeps that difference meaning what it says, and keeps meaning it when
    phase `04` hangs a third identity off the same page. The count of ROWS is not lost: it is
    `n_written`, measured by the single writer that actually puts them in `md.series`.

    The `RS-3.4` cut itself is NOT made here — it lives in
    `use_cases/collector_series_mapping.is_closed_bucket`, where its sign is under test. This
    function applies the second, independent filter: the WATERMARK, the newest bar already
    published for `symbol` in this process. The two are different refusals and neither implies
    the other — the watermark stops a duplicate, the finality cut stops a LIE.

    `digest` is fed the VERBATIM 12-field arrays (`KlineRow.raw`), not the HTTP bytes: the
    client parses the body and does not surface it, and the arrays are what it preserved
    unchanged (`T-01.2`'s whole point). Same incremental shape `build_force_order_run`'s
    session digest uses, for the same reason — never hold a backfill in memory to hash it.
    """
    for kline in page.rows:
        digest.update(repr(kline.raw).encode("utf-8"))
    seen = watermark.get(symbol)
    fresh = tuple(kline for kline in page.rows if seen is None or kline.open_time_ms > seen)
    rows = to_rows(_epoch_ms(), symbol, fresh)
    for row in rows:
        sink.accept(row, run_id=run_id)
    if rows:
        watermark[symbol] = max(row.bucket_end for row in rows) - KLINES_BUCKET_WIDTH_MS
    return len({row.bucket_end for row in rows})


def _collect_klines_for_symbol(
    *,
    client: KlinesClient,
    sink: RedisStreamSeriesSink,
    to_rows: KlinesToRows,
    digest: hashlib._Hash,
    symbol: str,
    run_id: str,
    watermark: dict[str, int],
    stop_event: threading.Event,
    backfill_from_ms: int | None,
    tail_limit: int,
) -> _KlinesPassTotals:
    """Collect one symbol for one pass: the boot backfill when `backfill_from_ms` is given.

    THE BACKFILL PAGES, THE PERIODIC CYCLE DOES NOT, and that asymmetry is the endpoint's, not
    a choice: `/fapi/v1/klines` answers at most `MAX_LIMIT` (1500) bars per call, so seven days
    of one-minute bars (`7 x 1440 = 10.080`) is seven calls walked forward by `startTime`,
    while one 60-second cycle needs the newest two.

    The walk stops on the FIRST of four conditions, and each one is a real end rather than a
    guard against an infinite loop: the cursor reaches the present, the page comes back short
    of `MAX_LIMIT` (the source has no more), the page comes back empty, or the source answered
    an error envelope. A `SIGTERM` mid-backfill also stops it — `stop_event` is checked between
    pages so a shutdown never waits out seven round trips per symbol.
    """
    totals = _KlinesPassTotals()
    cursor = backfill_from_ms
    while not stop_event.is_set():
        limit = MAX_LIMIT if cursor is not None else tail_limit
        page = client.klines(symbol, _KLINES_INTERVAL, limit, start_time_ms=cursor)
        totals = totals.plus(
            _KlinesPassTotals(n_returned=len(page.rows), n_calls=1, api_code=page.api_code)
        )
        if page.api_code is not None:
            logger.warning(
                "klines_page_refused",
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
        published = _publish_klines_page(
            page=page,
            sink=sink,
            to_rows=to_rows,
            digest=digest,
            symbol=symbol,
            run_id=run_id,
            watermark=watermark,
        )
        totals = totals.plus(_KlinesPassTotals(n_published=published))
        if cursor is None or len(page.rows) < MAX_LIMIT:
            break
        cursor = page.rows[-1].open_time_ms + KLINES_BUCKET_WIDTH_MS
        if cursor >= _epoch_ms():
            break
    return totals


def _run_klines_collector(
    *,
    stop_event: threading.Event,
    failure_event: threading.Event,
    exit_code: list[int],
    client: KlinesClient,
    sink: RedisStreamSeriesSink,
    to_rows: KlinesToRows,
    record_run: Callable[[IngestRun], None],
    symbols: Sequence[str],
    interval_s: float,
    backfill_days: int,
) -> None:
    """Backfill `backfill_days` once at boot, then poll the tail every `interval_s`.

    ONE `IngestRun` PER PASS over the whole symbol universe, matching what `Q3` §1.2 fixes for
    the other polling producer — see `build_klines_run` for why a run is not a page. The boot
    backfill is the first pass; every cycle after it is another.

    The WATERMARK (`{symbol: newest published open_time}`) lives for the life of the process and
    is what makes the periodic overlap free. It is deliberately NOT persisted: on restart the
    boot backfill re-reads the same seven days, and `md.series`'s primary key includes
    `observed_at`, so those re-reads append rather than conflict. That cost is real and bounded
    — `7 x 1440 x |symbols|` rows per restart — and it is the price of the task's literal
    requirement ("backfill_dias = 7, uma vez, no boot"); the read path is unaffected, because
    `as_of` returns `argmin(observed_at)`, which is the ORIGINAL observation, not the re-read.

    A publish failure is `SPEC-004` §3.1's "falha do Redis em regime": the pass closes
    `REJECTED`, the other threads are told to stop, and `exit_code[0] = 1`. A page the SOURCE
    refused (an error envelope, `api_code`) is not that — it closes `ACCEPTED_WITH_WARNING`,
    the same distinction `_run_premium_index_collector` already draws between trouble upstream
    at Binance and trouble writing to our own queue.
    """
    watermark: dict[str, int] = {}
    tail_limit = _tail_limit(interval_s)
    backfill_from_ms: int | None = _epoch_ms() - backfill_days * _MS_PER_DAY
    while not stop_event.is_set():
        run_id = str(uuid.uuid4())
        started_at = _iso_now()
        digest = hashlib.sha256()
        totals = _KlinesPassTotals()
        try:
            for symbol in symbols:
                if stop_event.is_set():
                    break
                totals = totals.plus(
                    _collect_klines_for_symbol(
                        client=client,
                        sink=sink,
                        to_rows=to_rows,
                        digest=digest,
                        symbol=symbol,
                        run_id=run_id,
                        watermark=watermark,
                        stop_event=stop_event,
                        backfill_from_ms=backfill_from_ms,
                        tail_limit=tail_limit,
                    )
                )
        except _PUBLISH_FAILURE_EXCEPTIONS as failure:
            run = build_klines_run(
                started_at=started_at,
                ended_at=_iso_now(),
                n_returned=totals.n_returned,
                n_calls=totals.n_calls,
                api_code=totals.api_code,
                verdict="REJECTED",
                src_sha256=digest.hexdigest(),
                run_id=run_id,
            )
            record_run(run)
            logger.error(
                "collector_cycle_completed %s: %s",
                KLINES_ENDPOINT,
                failure,
                extra={
                    "endpoint": KLINES_ENDPOINT,
                    "n_published": totals.n_published,
                    "verdict": "REJECTED",
                    "run_id": run.run_id,
                },
                exc_info=True,
            )
            exit_code[0] = 1
            failure_event.set()
            return
        verdict: KnownVerdict = "ACCEPTED" if totals.api_code is None else "ACCEPTED_WITH_WARNING"
        run = build_klines_run(
            started_at=started_at,
            ended_at=_iso_now(),
            n_returned=totals.n_returned,
            n_calls=totals.n_calls,
            api_code=totals.api_code,
            verdict=verdict,
            src_sha256=digest.hexdigest(),
            run_id=run_id,
        )
        record_run(run)
        logger.info(
            "collector_cycle_completed",
            extra={
                "endpoint": KLINES_ENDPOINT,
                "n_published": totals.n_published,
                "n_returned": totals.n_returned,
                "backfill": backfill_from_ms is not None,
                "verdict": verdict,
                "run_id": run.run_id,
            },
        )
        backfill_from_ms = None
        stop_event.wait(interval_s)


# ── THE COMPOSITION ITSELF ──────────────────────────────────────────────────────────────────


def _default_force_order_source() -> MessageSource:
    """Build the LIVE `forceOrder` source: per-symbol combined stream, never `!forceOrder@arr`.

    `combined_stream_path` is the SAME function `aggtrade_nq_probe_cli.py` already proved live
    over a real handshake (`T-03.1`) — one connection for the whole `INITIAL_SYMBOLS` universe,
    not one per symbol, and `sorted()` only pins the connection path deterministic for tests; it
    carries no ordering meaning for a combined stream. `ADR-004` Emenda D5: the socket's own
    `settimeout()` is `_FORCE_ORDER_RECV_GRANULARITY_S` (small — a read granularity, not a
    verdict); `idle_timeout_s=_FORCE_ORDER_IDLE_TIMEOUT_S` is the accumulated-silence threshold
    that actually declares the connection dead. See both constants' comments for why they are two
    numbers now, not the one `_FORCE_ORDER_READ_TIMEOUT_S` (900s) used to be.
    """
    return WebSocketMessageSource(
        BINANCE_FUTURES_STREAM_HOST,
        combined_stream_path(sorted(INITIAL_SYMBOLS), stream="forceOrder"),
        lambda: connect_tls(BINANCE_FUTURES_STREAM_HOST, timeout=_FORCE_ORDER_RECV_GRANULARITY_S),
        idle_timeout_s=_FORCE_ORDER_IDLE_TIMEOUT_S,
    )


def run(
    *,
    config: BootConfig,
    connection: RespConnection,
    store: IngestRecordStore,
    force_order_source_factory: Callable[[], MessageSource] | None = None,
    premium_index_fetcher_factory: Callable[[], PremiumIndexFetcher] | None = None,
    klines_client_factory: Callable[[], KlinesClient] | None = None,
    premium_index_to_rows: PremiumIndexReadingToRows | None = None,
    force_order_to_rows: ForceOrderObservationToRows | None = None,
    klines_to_rows: KlinesToRows | None = None,
    klines_symbols: Sequence[str] | None = None,
    stop_event: threading.Event | None = None,
) -> int:
    """Start the THREE collector threads, install `SIGTERM`, and wait for a clean/failed exit.

    Every network-touching default is injectable, matching every other CLI in this package —
    left to default, `force_order_source_factory` opens a real per-symbol combined `forceOrder`
    WebSocket (`_default_force_order_source`, NOT `!forceOrder@arr` — see its docstring),
    `premium_index_fetcher_factory` opens a real HTTPS client, and `klines_client_factory`
    opens a real `BinanceKlinesClient`; the offline suite injects fakes for all three, exactly
    like `premium_index_probe_cli.py`/`force_order_collector_cli.py` already do.

    `klines_to_rows` falls back to the REAL mapping rather than to `_mapping_not_decided_yet`,
    and the asymmetry with the other two is deliberate: that sentinel exists because the
    `SeriesKey` for `premiumIndex`/`forceOrder` genuinely was undecided when `run()` first
    shipped, and a guessed row is worse than a loud crash. `klines_volume` is the opposite
    case — `T-01.1` decided the identity, `domain/klines_volume_catalog.py` holds it, and
    `use_cases/collector_series_mapping.build_klines_to_rows` is the one construction of it.
    There is nothing for a sentinel to protect against, and the 55-restart crash loop of
    `[MEDIDO 2026-09-08]` is what the other two got for defaulting to one.
    """
    open_force_order_source = force_order_source_factory or _default_force_order_source
    build_premium_index_fetcher = premium_index_fetcher_factory or PremiumIndexHttpClient
    build_klines_client = klines_client_factory or BinanceKlinesClient
    premium_to_rows = premium_index_to_rows or _mapping_not_decided_yet
    force_order_to_rows_ = force_order_to_rows or _mapping_not_decided_yet
    klines_to_rows_ = klines_to_rows or build_klines_to_rows()
    klines_symbols_ = sorted(INITIAL_SYMBOLS) if klines_symbols is None else klines_symbols

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
    klines_thread = threading.Thread(
        target=_run_klines_collector,
        name="collector-klines",
        kwargs={
            "stop_event": stop,
            "failure_event": failure,
            "exit_code": exit_code,
            "client": build_klines_client(),
            "sink": sink,
            "to_rows": klines_to_rows_,
            "record_run": store.record_run,
            "symbols": klines_symbols_,
            "interval_s": config.klines_cycle_interval_s,
            "backfill_days": config.klines_backfill_days,
        },
    )
    try:
        force_order_thread.start()
        premium_index_thread.start()
        klines_thread.start()
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
        klines_thread.join(timeout=_JOIN_TIMEOUT_S)
    finally:
        signal.signal(signal.SIGTERM, previous_handler)
    return exit_code[0]


def main(argv: Sequence[str]) -> int:
    """Resolve boot config, connect, and run — `rc != 0` naming the variable on any boot failure.

    `argv` is accepted (unused) for the same reason every CLI in this package takes it: a
    uniform `main(argv) -> int` signature the suite calls directly, without `sys.exit` escaping
    a test process. `run()` is called with the REAL `SeriesKey` mapping
    (`use_cases/collector_series_mapping.py`) — see this module's own docstring for why that
    default changed, and `test_collectors_cli_boot.py`'s `test_main_wires_the_real_series_mapping`
    for the regression pinning it.
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
    try:
        # Shared with `single_writer_cli` (`T-02.5`) and `src.main` (`T-02.6`) — `T-02.4`'s
        # whole point. `config.ingest_record_backend` was already validated above (membership
        # in `KNOWN_INGEST_RECORD_BACKENDS`, before `connect_redis` ever opened a socket); this
        # second read of `os.environ` is what actually builds the engine, and for `postgres` is
        # the ONE place this process opens a network connection to it.
        store = compose_ingest_record_store(os.environ)
    except (IngestRecordStoreConfigurationError, IngestRecordStoreConnectionError) as error:
        logger.error(
            "collector_boot_refused %s: %s",
            error.variable,
            error,
            extra={"variable": error.variable},
        )
        return 1
    store.initialise()
    store.describe_readiness()
    return run(
        config=config,
        connection=connection,
        store=store,
        premium_index_to_rows=build_premium_index_to_rows(
            interval_s=config.premium_index_cycle_interval_s
        ),
        force_order_to_rows=build_force_order_to_rows(),
    )


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    raise SystemExit(main(sys.argv[1:]))
