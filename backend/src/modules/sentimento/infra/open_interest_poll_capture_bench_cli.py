"""The bench for `T-03.6`: the open-interest poll collector alone, on a stack it owns, audited."""

# ── THIS IS NOT A TEST, AND IT MUST NEVER BECOME ONE ───────────────────────────────────────
#
# `backend/scripts/test.sh` declares "ZERO REDE". This bench spends real Binance quota (weight 1
# per call, 4 calls per minute) against a Postgres and a Redis that `scripts/oi-poll-capture-
# bench.sh` starts and destroys for the run. What the suite owns is the LOGIC below — the guard,
# the call log, the three verdicts — exercised offline through injected ports, exactly like
# `quota_ramp_cli.py`.
#
# ── THE THREE COMMANDS ─────────────────────────────────────────────────────────────────────
#
#   collect   runs `collectors_cli._run_open_interest_poll_collector` — the SAME function the
#             `collector-open-interest-poll` thread runs in production — and nothing else, until
#             `SIGTERM`. Every `open_interest_poll_call` line goes to `--calls-log` as JSON.
#   counts    `md.series` rows of the four polled series and the `n_written` the writer credited
#             to the poll runs: the `0` of `DoD-1` before the collector starts.
#   audit     the three verdicts of plan `03` `DoD-03a` items 1 (count), 2 and 4.
#
# ── WHY THE THREAD RUNS ALONE, AND NOT THROUGH `collectors_cli.run()` ──────────────────────
#
# `run()` starts all seven threads. The other six spend quota on the SAME IP (a klines backfill at
# boot alone is hundreds of weighted calls), and `x-mbx-used-weight-1m` is per IP: the header
# `DoD-2` reads would measure them, not this collector. The loop, the ticker, the stamping, the
# sink and the run accounting are the production ones; only the six neighbours are absent.
#
# ── THE GUARD AGAINST THE SHARED STACK (`D-g`) ─────────────────────────────────────────────
#
# `collect` publishes rows and `audit` reads them, so pointed at the shared Postgres this bench
# would be exactly the seeding `D-g` forbids. Both `POSTGRES_DB` and `REDIS_STREAM` must carry
# `BENCH_NAME_PREFIX`, a name only the bench's own containers are given: a shared database is
# refused before any socket opens, and a shared stream too — a row on the shared stream would be
# written into the shared Postgres by the shared writer, bench database or not.
#
# ── OUTPUT IS ONE JSON OBJECT ON `stdout` ──────────────────────────────────────────────────
#
# Same contract as `quota_ramp_cli.py`: the bytes are the record; diagnostics go to `stderr`.

from __future__ import annotations

import json
import logging
import os
import signal
import sys
import threading
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass
from enum import Enum
from pathlib import Path
from types import FrameType
from typing import Any, Final, Protocol, TextIO

import psycopg

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_poll_key
from src.modules.sentimento.domain.open_interest_grid_stamp import (
    OPEN_INTEREST_ADMISSION_WINDOW_MS,
    OPEN_INTEREST_GRID_MS,
)
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.binance_open_interest_client import BinanceOpenInterestClient
from src.modules.sentimento.infra.ingest_record_store_composition import (
    INGEST_RECORD_BACKEND_VAR,
    POSTGRES_DB_VAR,
    POSTGRES_HOST_VAR,
    POSTGRES_PASSWORD_VAR,
    POSTGRES_PORT_VAR,
    POSTGRES_USER_VAR,
    compose_ingest_record_store,
)
from src.modules.sentimento.infra.redis_stream_series_sink import RedisStreamSeriesSink
from src.modules.sentimento.use_cases.collector_run_mapping import (
    OPEN_INTEREST_POLL_ENDPOINT,
    OPEN_INTEREST_POLL_OBSERVER_ID,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    INITIAL_SYMBOLS,
    build_open_interest_poll_to_rows,
)

logger = logging.getLogger(__name__)

BENCH_NAME_PREFIX: Final[str] = "oi_capture_bench"
"""The only prefix `POSTGRES_DB` and `REDIS_STREAM` may carry here (see the guard above)."""

QUOTA_CEILING_PER_MINUTE: Final[int] = 4
"""Plan `03` `DoD-03a` item 2: this collector's share of `x-mbx-used-weight-1m`."""

_REDIS_STREAM_VAR: Final[str] = "REDIS_STREAM"  # same name `collectors_cli` resolves
_POSTGRES_BACKEND: Final[str] = "postgres"
_CALL_EVENT: Final[str] = "open_interest_poll_call"
_CALL_FIELDS: Final[tuple[str, ...]] = (
    "symbol",
    "outcome",
    "fate",
    "event_time_ms",
    "grid_instant_ms",
    "lag_ms",
    "staleness_ms",
    "used_weight_1m",
    "failure",
    "run_id",
)
_EXIT_REFUSED: Final[int] = 2


class BenchStackRefusedError(RuntimeError):
    """The environment points somewhere the bench does not own; nothing was opened."""

    def __init__(self, variable: str, message: str) -> None:
        """Keep the offending variable, so the refusal can name it."""
        super().__init__(message)
        self.variable = variable


def require_bench_stack(environ: Mapping[str, str]) -> None:
    """Refuse unless `POSTGRES_DB` and `REDIS_STREAM` both carry `BENCH_NAME_PREFIX`.

    Also refuses any `INGEST_RECORD_BACKEND` but `postgres`: the default `sqlite` would write the
    runs to `data/md/`, a path the bench does not own either.
    """
    for variable in (POSTGRES_DB_VAR, _REDIS_STREAM_VAR):
        value = environ.get(variable, "")
        if not value.startswith(BENCH_NAME_PREFIX):
            raise BenchStackRefusedError(
                variable,
                f"{variable}={value!r} does not start with {BENCH_NAME_PREFIX!r}: "
                "the bench only runs on the stack scripts/oi-poll-capture-bench.sh creates",
            )
    backend = environ.get(INGEST_RECORD_BACKEND_VAR, "")
    if backend != _POSTGRES_BACKEND:
        raise BenchStackRefusedError(
            INGEST_RECORD_BACKEND_VAR,
            f"{INGEST_RECORD_BACKEND_VAR}={backend!r} must be {_POSTGRES_BACKEND!r} on the bench",
        )


class PollCallJsonLog(logging.Handler):
    """Write every `open_interest_poll_call` record as one JSON line, flushed at once.

    `logged_at_ms` is the record's own creation instant: the fallback minute of a call that read
    nothing, and therefore carries no `event_time_ms`/`lag_ms` to rebuild `sent_at` from.
    """

    def __init__(self, stream: TextIO) -> None:
        """Bind to an already-open text stream; the caller owns opening and closing it."""
        super().__init__(level=logging.INFO)
        self._stream = stream

    def emit(self, record: logging.LogRecord) -> None:
        """Serialise the call's `extra` fields; every other record is ignored."""
        if record.getMessage() != _CALL_EVENT:
            return
        entry: dict[str, object] = {"logged_at_ms": int(record.created * 1000)}
        for field in _CALL_FIELDS:
            entry[field] = getattr(record, field, None)
        self._stream.write(json.dumps(entry, sort_keys=True) + "\n")
        self._stream.flush()


@dataclass(frozen=True)
class PollCall:
    """One call of the collector, as the audit needs it."""

    symbol: str
    sent_at_ms: int
    used_weight_1m: int | None
    lag_ms: int | None = None
    """`sent_at - time` when the call read a snapshot; `None` when it read nothing."""


def _optional_int(entry: Mapping[str, object], field: str) -> int | None:
    value = entry.get(field)
    return value if isinstance(value, int) else None


def parse_poll_calls(lines: Iterable[str]) -> tuple[PollCall, ...]:
    """Read the call log back. `sent_at = event_time + lag` when read, else `logged_at`."""
    calls: list[PollCall] = []
    for line in lines:
        if not line.strip():
            continue
        entry = json.loads(line)
        event_time_ms = _optional_int(entry, "event_time_ms")
        lag_ms = _optional_int(entry, "lag_ms")
        logged_at_ms = _optional_int(entry, "logged_at_ms")
        if event_time_ms is not None and lag_ms is not None:
            sent_at_ms = event_time_ms + lag_ms
        elif logged_at_ms is not None:
            sent_at_ms = logged_at_ms
        else:
            raise ValueError(f"call log line has no instant to place it in a minute: {line!r}")
        calls.append(
            PollCall(
                symbol=str(entry["symbol"]),
                sent_at_ms=sent_at_ms,
                used_weight_1m=_optional_int(entry, "used_weight_1m"),
                lag_ms=lag_ms,
            )
        )
    return tuple(calls)


class Verdict(Enum):
    """The closed outcome of each check; only `PASS` on all three passes the bench."""

    PASS = "PASS"  # noqa: S105 - a verdict name, not a secret
    FAIL = "FAIL"
    INCONCLUSIVE = "INCONCLUSIVE"


@dataclass(frozen=True)
class MinuteQuota:
    """The collector's calls inside one wall-clock minute, and what the header said of them."""

    minute_start_ms: int
    n_calls: int
    header_span: int | None
    """`max - min + 1` of `x-mbx-used-weight-1m` over OUR calls in the minute.

    The header counts the whole IP, so a foreign call landing between two of ours can only WIDEN
    this span: it is an upper bound of this collector's share, never an underestimate.
    """


def minute_quotas(calls: Sequence[PollCall]) -> tuple[MinuteQuota, ...]:
    """Group the calls by wall-clock minute, the window `x-mbx-used-weight-1m` reports on."""
    by_minute: dict[int, list[PollCall]] = {}
    for call in calls:
        start = call.sent_at_ms - call.sent_at_ms % OPEN_INTEREST_GRID_MS
        by_minute.setdefault(start, []).append(call)
    quotas: list[MinuteQuota] = []
    for start in sorted(by_minute):
        weights = [c.used_weight_1m for c in by_minute[start] if c.used_weight_1m is not None]
        span = max(weights) - min(weights) + 1 if weights else None
        quotas.append(
            MinuteQuota(minute_start_ms=start, n_calls=len(by_minute[start]), header_span=span)
        )
    return tuple(quotas)


def judge_quota(quotas: Sequence[MinuteQuota]) -> tuple[Verdict, dict[str, object]]:
    """`PASS` iff every minute has `<= 4` calls and header span `<= 4`; no header: inconclusive."""
    spans = [q.header_span for q in quotas if q.header_span is not None]
    evidence: dict[str, object] = {
        "ceiling_per_minute": QUOTA_CEILING_PER_MINUTE,
        "minutes": len(quotas),
        "calls": sum(q.n_calls for q in quotas),
        "max_calls_in_a_minute": max((q.n_calls for q in quotas), default=0),
        "max_header_span_in_a_minute": max(spans, default=None),
        "minutes_without_header": sum(1 for q in quotas if q.header_span is None),
        "minutes_over_ceiling": [
            asdict(q)
            for q in quotas
            if q.n_calls > QUOTA_CEILING_PER_MINUTE
            or (q.header_span is not None and q.header_span > QUOTA_CEILING_PER_MINUTE)
        ],
    }
    if evidence["minutes_over_ceiling"]:
        return Verdict.FAIL, evidence
    if not spans:
        return Verdict.INCONCLUSIVE, evidence
    return Verdict.PASS, evidence


@dataclass(frozen=True)
class LagEnvelope:
    """The extremes of `lag_ms = sent_at - time` over every call of the run that read a snapshot.

    MEASURED from the run itself, never assumed: `[Q-STAMP-1]` §3 measured a tail of 9.75 s, and
    the first bench run of this task measured 14.7 s — a constant margin would have been wrong.
    """

    min_lag_ms: int
    max_lag_ms: int


def lag_envelope(calls: Sequence[PollCall]) -> LagEnvelope | None:
    """Return the run's lag extremes, or `None` when no call read anything."""
    lags = [call.lag_ms for call in calls if call.lag_ms is not None]
    if not lags:
        return None
    return LagEnvelope(min_lag_ms=min(lags), max_lag_ms=max(lags))


def expected_absent_minutes(
    stopped_from_ms: int, stopped_until_ms: int, envelope: LagEnvelope
) -> tuple[int, ...]:
    """Every grid `T` no reading could be admitted to while the collector was down.

    A reading sent at `s` carries `time = s - lag`. Before the stop `s <= stopped_from`, so
    `time <= stopped_from + max(0, -min_lag)`, and it reaches `T` only if `T - time <= 20 s`.
    After the restart `s >= stopped_until`, so `time >= stopped_until - max(0, max_lag)`, and it
    reaches only `T >= time`. `T` is therefore expected absent iff
    `stopped_from + 20 s + max(0, -min_lag) < T < stopped_until - max(0, max_lag)`.
    """
    low = stopped_from_ms + OPEN_INTEREST_ADMISSION_WINDOW_MS + max(0, -envelope.min_lag_ms)
    high = stopped_until_ms - max(0, envelope.max_lag_ms)
    first = low - low % OPEN_INTEREST_GRID_MS + OPEN_INTEREST_GRID_MS
    return tuple(range(first, high, OPEN_INTEREST_GRID_MS))


class BenchStore(Protocol):
    """What the audit reads from the bench's own Postgres."""

    def rows_by_series(self, series_ids: Sequence[str]) -> dict[str, int]:
        """`md.series` row count per `series_key_id` (absent id = 0 rows)."""
        ...

    def grid_instants_by_series(self, series_ids: Sequence[str]) -> dict[str, tuple[int, ...]]:
        """Every stored `T` per `series_key_id`, ascending."""
        ...

    def poll_runs(self) -> tuple[IngestRun, ...]:
        """Every `md.ingest_run` of the poll collector."""
        ...


def polled_series_ids() -> dict[str, str]:
    """`{symbol: series_key_id}` of the four polled series — the identity the writer used."""
    return {
        symbol: binance_open_interest_poll_key(instrument_id=symbol).series_key_id()
        for symbol in sorted(INITIAL_SYMBOLS)
    }


def count_new_data(store: BenchStore) -> dict[str, object]:
    """Rows per symbol and `n_written` credited to the poll runs — `DoD-1`'s two numbers."""
    ids = polled_series_ids()
    counts = store.rows_by_series(list(ids.values()))
    runs = store.poll_runs()
    return {
        "rows_by_symbol": {symbol: counts.get(sid, 0) for symbol, sid in ids.items()},
        "rows_total": sum(counts.get(sid, 0) for sid in ids.values()),
        "poll_runs": len(runs),
        "n_written_total": sum(run.n_written for run in runs),
    }


def judge_new_data(counted: Mapping[str, Any]) -> Verdict:
    """`PASS` iff every symbol has `> 0` rows and the writer credited `n_written > 0`."""
    rows_by_symbol: Mapping[str, int] = counted["rows_by_symbol"]
    if all(n > 0 for n in rows_by_symbol.values()) and counted["n_written_total"] > 0:
        return Verdict.PASS
    return Verdict.FAIL


def judge_absence(
    instants_by_symbol: Mapping[str, Sequence[int]],
    stopped_from_ms: int,
    stopped_until_ms: int,
    envelope: LagEnvelope | None,
) -> tuple[Verdict, dict[str, object]]:
    """`FAIL` if any series holds a row at an expected-absent `T`.

    `INCONCLUSIVE` when there is no expected-absent minute, or when a symbol has no row on
    BOTH sides of the stop — "no row in the gap" proves nothing about a collector that never
    wrote at all.
    """
    absent = (
        ()
        if envelope is None
        else expected_absent_minutes(stopped_from_ms, stopped_until_ms, envelope)
    )
    absent_set = set(absent)
    carried = sorted(
        (symbol, t) for symbol, ts in instants_by_symbol.items() for t in ts if t in absent_set
    )
    no_row_before = sorted(
        s for s, ts in instants_by_symbol.items() if not any(t < stopped_from_ms for t in ts)
    )
    no_row_after = sorted(
        s for s, ts in instants_by_symbol.items() if not any(t > stopped_until_ms for t in ts)
    )
    evidence: dict[str, object] = {
        "stopped_from_ms": stopped_from_ms,
        "stopped_until_ms": stopped_until_ms,
        "lag_envelope_ms": None if envelope is None else asdict(envelope),
        "expected_absent_minutes": list(absent),
        "rows_in_absent_minutes": [list(pair) for pair in carried],
        "symbols_without_row_before_stop": no_row_before,
        "symbols_without_row_after_restart": no_row_after,
    }
    if carried:
        return Verdict.FAIL, evidence
    if not absent or no_row_before or no_row_after:
        return Verdict.INCONCLUSIVE, evidence
    return Verdict.PASS, evidence


def audit(
    store: BenchStore,
    calls: Sequence[PollCall],
    stopped_from_ms: int,
    stopped_until_ms: int,
) -> dict[str, object]:
    """Judge `DoD-03a` items 1 (count), 2 and 4, and return the three verdicts plus the overall."""
    counted = count_new_data(store)
    new_data = judge_new_data(counted)
    quota, quota_evidence = judge_quota(minute_quotas(calls))
    ids = polled_series_ids()
    instants = store.grid_instants_by_series(list(ids.values()))
    absence, absence_evidence = judge_absence(
        {symbol: instants.get(sid, ()) for symbol, sid in ids.items()},
        stopped_from_ms,
        stopped_until_ms,
        lag_envelope(calls),
    )
    verdicts = (new_data, quota, absence)
    overall = Verdict.PASS if all(v is Verdict.PASS for v in verdicts) else Verdict.FAIL
    return {
        "dod_1_new_data": {"verdict": new_data.value, **counted},
        "dod_2_quota": {"verdict": quota.value, **quota_evidence},
        "dod_4_absent_not_carried": {"verdict": absence.value, **absence_evidence},
        "verdict": overall.value,
    }


_ROWS_BY_SERIES_SQL: Final[str] = (
    "SELECT series_key_id, count(*) FROM md.series WHERE series_key_id = ANY(%s) GROUP BY 1"
)
_INSTANTS_BY_SERIES_SQL: Final[str] = (
    "SELECT series_key_id, bucket_end FROM md.series WHERE series_key_id = ANY(%s) "
    "ORDER BY series_key_id, bucket_end"
)


class PostgresBenchStore:
    """`BenchStore` over the bench's own Postgres — reached only after `require_bench_stack`."""

    def __init__(self, connection: psycopg.Connection[Any], runs: tuple[IngestRun, ...]) -> None:
        """Wrap an open connection and the runs the record store already read."""
        self._connection = connection
        self._runs = runs

    def rows_by_series(self, series_ids: Sequence[str]) -> dict[str, int]:
        """`md.series` row count per `series_key_id`."""
        with self._connection.cursor() as cursor:
            cursor.execute(_ROWS_BY_SERIES_SQL, (list(series_ids),))
            return {str(sid): int(n) for sid, n in cursor.fetchall()}

    def grid_instants_by_series(self, series_ids: Sequence[str]) -> dict[str, tuple[int, ...]]:
        """Every stored `T` per `series_key_id`, ascending."""
        grouped: dict[str, list[int]] = {}
        with self._connection.cursor() as cursor:
            cursor.execute(_INSTANTS_BY_SERIES_SQL, (list(series_ids),))
            for sid, t in cursor.fetchall():
                grouped.setdefault(str(sid), []).append(int(t))
        return {sid: tuple(ts) for sid, ts in grouped.items()}

    def poll_runs(self) -> tuple[IngestRun, ...]:
        """Return the poll collector's runs, filtered by endpoint and observer."""
        return tuple(
            run
            for run in self._runs
            if run.endpoint == OPEN_INTEREST_POLL_ENDPOINT
            and run.observer_id == OPEN_INTEREST_POLL_OBSERVER_ID
        )


def _open_bench_store(environ: Mapping[str, str]) -> PostgresBenchStore:  # pragma: no cover - net
    record_store = compose_ingest_record_store(environ)
    runs = record_store.runs()
    connection = psycopg.connect(
        host=environ.get(POSTGRES_HOST_VAR, ""),
        port=environ.get(POSTGRES_PORT_VAR, ""),
        dbname=environ.get(POSTGRES_DB_VAR, ""),
        user=environ.get(POSTGRES_USER_VAR, ""),
        password=environ.get(POSTGRES_PASSWORD_VAR, ""),
    )
    return PostgresBenchStore(connection, runs)


def _collect(environ: Mapping[str, str], calls_log: Path) -> int:  # pragma: no cover - network
    config = collectors_cli.resolve_boot_config(environ)
    connection = collectors_cli.connect_redis(config)
    store = compose_ingest_record_store(environ)
    store.initialise()
    stop = threading.Event()

    def _stop(_signum: int, _frame: FrameType | None) -> None:
        stop.set()

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    exit_code = [0]
    with calls_log.open("a", encoding="utf-8") as stream:
        handler = PollCallJsonLog(stream)
        collectors_cli.logger.addHandler(handler)
        collectors_cli.logger.setLevel(logging.INFO)
        try:
            collectors_cli._run_open_interest_poll_collector(  # noqa: SLF001 - see module header
                stop_event=stop,
                failure_event=threading.Event(),
                exit_code=exit_code,
                client_factory=BinanceOpenInterestClient,
                sink=RedisStreamSeriesSink(
                    connection, config.redis_stream, config.redis_stream_maxlen
                ),
                to_rows=build_open_interest_poll_to_rows(),
                record_run=store.record_run,
                symbols=sorted(INITIAL_SYMBOLS),
                interval_s=config.open_interest_poll_cycle_interval_s,
            )
        finally:
            collectors_cli.logger.removeHandler(handler)
    return exit_code[0]


def _argument(argv: Sequence[str], flag: str) -> str:
    try:
        return argv[list(argv).index(flag) + 1]
    except (ValueError, IndexError) as error:
        raise ValueError(f"missing {flag} <value>") from error


def _emit(stdout: TextIO, record: Mapping[str, object]) -> None:
    """Write the ONE JSON object of this invocation — the record, not a diagnostic."""
    stdout.write(json.dumps(record, sort_keys=True) + "\n")
    stdout.flush()


def main(
    argv: Sequence[str],
    environ: Mapping[str, str] | None = None,
    out: TextIO | None = None,
) -> int:
    """Dispatch `collect`/`counts`/`audit`, refusing before any socket if the stack is not ours."""
    env = os.environ if environ is None else environ
    stdout = sys.stdout if out is None else out
    command = argv[0] if argv else ""
    if command not in ("collect", "counts", "audit"):
        logger.error(
            "bench_usage: collect --calls-log PATH | counts | audit --calls-log PATH "
            "--stopped-from-ms MS --stopped-until-ms MS"
        )
        return _EXIT_REFUSED
    try:
        require_bench_stack(env)
    except BenchStackRefusedError as error:
        logger.error(
            "bench_refused %s: %s", error.variable, error, extra={"variable": error.variable}
        )
        _emit(stdout, {"refused": error.variable, "reason": str(error)})
        return _EXIT_REFUSED
    return _run_command(command, argv, env, stdout)


def _run_command(  # pragma: no cover - reaches Binance and the bench's own Postgres
    command: str, argv: Sequence[str], env: Mapping[str, str], stdout: TextIO
) -> int:
    if command == "collect":
        return _collect(env, Path(_argument(argv, "--calls-log")))
    store = _open_bench_store(env)
    if command == "counts":
        _emit(stdout, count_new_data(store))
        return 0
    calls = parse_poll_calls(
        Path(_argument(argv, "--calls-log")).read_text(encoding="utf-8").splitlines()
    )
    report = audit(
        store,
        calls,
        int(_argument(argv, "--stopped-from-ms")),
        int(_argument(argv, "--stopped-until-ms")),
    )
    _emit(stdout, report)
    return 0 if report["verdict"] == Verdict.PASS.value else 1


if __name__ == "__main__":  # pragma: no cover - composition root, run by the bench script
    logging.basicConfig(stream=sys.stderr, level=logging.INFO)
    raise SystemExit(main(sys.argv[1:]))
