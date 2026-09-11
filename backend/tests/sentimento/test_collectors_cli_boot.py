"""`T-01.5` / `D1.4` (half): boot resolves config, fails fast, and always names the variable."""

from __future__ import annotations

import math
import os
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import cast

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.force_order_natural_key import ForceOrderNaturalKey
from src.modules.sentimento.domain.premium_index_batch import PremiumIndexReading
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.redis_resp_client import SocketLike
from src.modules.sentimento.use_cases.collector_series_mapping import (
    ForceOrderObservationToRows,
    PremiumIndexReadingToRows,
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
CLI_MODULE = "src.modules.sentimento.infra.collectors_cli"
# `D1.4`'s falsifier window — the boot has to fail well inside it, not merely eventually.
BOOT_DEADLINE_S = 5.0


# ── `resolve_boot_config` — every variable, parsed or defaulted, never silently coerced ──────


def test_defaults_apply_when_every_variable_is_absent() -> None:
    """An empty environment resolves to the documented defaults, not to a crash."""
    config = collectors_cli.resolve_boot_config({})
    assert config.redis_host == "localhost"
    assert config.redis_port == 6379
    assert config.redis_stream == "md.series.write"
    assert config.redis_stream_maxlen == 100_000
    assert config.ingest_record_backend == "sqlite"
    assert config.premium_index_cycle_interval_s == 60.0
    assert config.klines_cycle_interval_s == 60.0
    assert config.klines_cycle_offset_s == 2.0
    assert config.klines_backfill_days == 7


def test_every_variable_is_read_when_present(tmp_path: Path) -> None:
    """Every one of the six variables `SPEC-004` §3.1 names actually reaches `BootConfig`."""
    store_path = tmp_path / "custom-store.sqlite3"
    config = collectors_cli.resolve_boot_config(
        {
            "REDIS_HOST": "redis.internal",
            "REDIS_PORT": "6380",
            "REDIS_STREAM": "md.series.custom",
            "REDIS_STREAM_MAXLEN": "42",
            "INGEST_RECORD_BACKEND": "sqlite",
            "INGEST_HEALTH_STORE_PATH": str(store_path),
            "PREMIUM_INDEX_CYCLE_INTERVAL_S": "12.5",
            "KLINES_CYCLE_INTERVAL_S": "300",
            "KLINES_CYCLE_OFFSET_S": "4.5",
            "KLINES_BACKFILL_DAYS": "3",
        }
    )
    assert config.redis_host == "redis.internal"
    assert config.redis_port == 6380
    assert config.redis_stream == "md.series.custom"
    assert config.redis_stream_maxlen == 42
    assert config.ingest_health_store_path == store_path
    assert config.premium_index_cycle_interval_s == 12.5
    # `RS-3.5`: the klines cadence and backfill depth are CONFIGURATION. Morde: hardcode
    # either one and adjusting the only variable that pays quota becomes a release.
    assert config.klines_cycle_interval_s == 300.0
    assert config.klines_cycle_offset_s == 4.5
    assert config.klines_backfill_days == 3


@pytest.mark.parametrize(
    ("variable", "raw"),
    [
        ("REDIS_PORT", "not-a-port"),
        ("REDIS_STREAM_MAXLEN", "many"),
        ("PREMIUM_INDEX_CYCLE_INTERVAL_S", "soon"),
        ("KLINES_CYCLE_INTERVAL_S", "often"),
        ("KLINES_BACKFILL_DAYS", "a week"),
    ],
)
def test_an_unparseable_numeric_variable_names_itself_in_the_error(variable: str, raw: str) -> None:
    """A malformed number is refused, and the message names WHICH variable — never a guess."""
    with pytest.raises(collectors_cli.CollectorBootConfigurationError) as excinfo:
        collectors_cli.resolve_boot_config({variable: raw})
    assert excinfo.value.variable == variable
    assert variable in str(excinfo.value)


def test_postgres_backend_is_now_accepted_t02_4() -> None:
    """`T-02.4`: the shared composition arrived — `postgres` parses, it is no longer refused."""
    config = collectors_cli.resolve_boot_config({"INGEST_RECORD_BACKEND": "postgres"})
    assert config.ingest_record_backend == "postgres"


def test_an_unknown_backend_refuses_to_boot_naming_the_variable() -> None:
    """A value outside `{sqlite, postgres}` is still refused, always naming the variable."""
    with pytest.raises(collectors_cli.CollectorBootConfigurationError) as excinfo:
        collectors_cli.resolve_boot_config({"INGEST_RECORD_BACKEND": "foo"})
    assert excinfo.value.variable == "INGEST_RECORD_BACKEND"
    assert "INGEST_RECORD_BACKEND" in str(excinfo.value)


def test_postgres_with_ingest_health_store_path_set_is_not_an_error() -> None:
    """`ADR-031` consequences: `postgres` + a present `INGEST_HEALTH_STORE_PATH` is NOT refused.

    The var is inherited unconditionally from `.env.example` (`SPEC-003`); every compose target
    sets `INGEST_RECORD_BACKEND=postgres` without deleting it first, so the boot config parse
    (the half this module owns) must resolve cleanly with both present at once.
    """
    config = collectors_cli.resolve_boot_config(
        {"INGEST_RECORD_BACKEND": "postgres", "INGEST_HEALTH_STORE_PATH": "/some/sqlite/path"}
    )
    assert config.ingest_record_backend == "postgres"


# ── `connect_redis` — the falsifier morde: refuses fast, and always names `REDIS_HOST` ──────


class _RefusingSocket:
    """A `SocketLike` fake standing in for "nobody is listening at this address"."""

    def sendall(self, data: bytes) -> None:  # noqa: ARG002 - protocol requires the parameter
        raise ConnectionRefusedError("nobody is listening")

    def recv(self, bufsize: int) -> bytes:  # noqa: ARG002 - protocol requires the parameter
        raise ConnectionRefusedError("nobody is listening")

    def settimeout(self, value: float | None) -> None:  # noqa: ARG002
        return None

    def close(self) -> None:
        return None


def test_a_refused_connection_raises_naming_redis_host() -> None:
    """A refused connection raises `CollectorBootConnectionError` naming `REDIS_HOST`."""
    config = collectors_cli.resolve_boot_config({"REDIS_HOST": "nowhere", "REDIS_PORT": "1"})

    def _open_socket(_host: str, _port: int) -> SocketLike:
        return _RefusingSocket()

    with pytest.raises(collectors_cli.CollectorBootConnectionError) as excinfo:
        collectors_cli.connect_redis(config, open_socket=_open_socket)
    assert excinfo.value.variable == "REDIS_HOST"
    assert "REDIS_HOST" in str(excinfo.value)
    assert "nowhere" in str(excinfo.value)


class _OSErrorFactory:
    """A socket factory standing in for DNS resolution failing outright."""

    def __call__(self, host: str, port: int) -> SocketLike:
        raise OSError(f"[Errno -2] Name or service not known: {host}:{port}")


def test_a_dns_failure_at_connect_raises_naming_redis_host() -> None:
    """The socket factory itself raising (DNS lookup failure) is caught and named too."""
    config = collectors_cli.resolve_boot_config({"REDIS_HOST": "nao-existe"})
    with pytest.raises(collectors_cli.CollectorBootConnectionError) as excinfo:
        collectors_cli.connect_redis(config, open_socket=_OSErrorFactory())
    assert excinfo.value.variable == "REDIS_HOST"
    assert "REDIS_HOST" in str(excinfo.value)


class _WrongTypeSocket:
    """A `SocketLike` fake whose peer answers `HELLO`/`PING` with a RESP error reply."""

    def __init__(self) -> None:
        self._reply = b"-ERR unknown command\r\n"

    def sendall(self, data: bytes) -> None:  # noqa: ARG002
        return None

    def recv(self, bufsize: int) -> bytes:  # noqa: ARG002
        reply, self._reply = self._reply, b""
        return reply

    def settimeout(self, value: float | None) -> None:  # noqa: ARG002
        return None

    def close(self) -> None:
        return None


def test_a_redis_error_reply_at_ping_raises_naming_redis_host() -> None:
    """The peer answering with a RESP error (never `PONG`) is `CollectorBootConnectionError` too."""
    config = collectors_cli.resolve_boot_config({"REDIS_HOST": "somewhere"})
    with pytest.raises(collectors_cli.CollectorBootConnectionError) as excinfo:
        collectors_cli.connect_redis(config, open_socket=lambda _h, _p: _WrongTypeSocket())
    assert excinfo.value.variable == "REDIS_HOST"


# ── THE REAL FALSIFIER: a live subprocess, a bad `REDIS_HOST`, `rc != 0` inside 5 s ─────────


def test_process_refuses_to_boot_against_an_unreachable_redis_host_within_5s() -> None:
    """`D1.4`: `REDIS_HOST=nao-existe python -m ... collectors_cli` -> `rc != 0` in <= 5 s.

    Morde: were this to hang or retry forever, the falsifier IS "subiu sem Redis" — `SPEC-004`
    §3.1's "nenhum retry infinito no boot" made executable, timed against a real subprocess and
    a real (nonexistent) hostname, not a fake transport.
    """
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT), REDIS_HOST="nao-existe")
    started = time.monotonic()
    completed = subprocess.run(
        [sys.executable, "-m", CLI_MODULE],
        cwd=str(BACKEND_ROOT),
        env=environment,
        capture_output=True,
        text=True,
        timeout=BOOT_DEADLINE_S,
    )
    elapsed = time.monotonic() - started
    assert elapsed <= BOOT_DEADLINE_S, f"boot took {elapsed:.2f}s, over the {BOOT_DEADLINE_S}s cap"
    assert completed.returncode != 0, "an unreachable REDIS_HOST must not boot successfully"
    output = completed.stdout + completed.stderr
    assert "REDIS_HOST" in output, f"the failure must name the variable; got: {output!r}"


def test_process_refuses_to_boot_with_an_unknown_backend_within_5s() -> None:
    """`T-02.4`/`D2.5` (metade coletor): `INGEST_RECORD_BACKEND=foo` -> `rc != 0` in <= 5 s.

    This value is refused by `resolve_boot_config` BEFORE `connect_redis` opens a socket
    (module docstring), so the failure names `INGEST_RECORD_BACKEND` regardless of whether
    Redis is reachable in the environment running this test — the ordering itself is what the
    unit-level `resolve_boot_config` tests above cannot prove, only a real subprocess can.
    Morde: an implementation that validated the backend AFTER dialling Redis would report
    `REDIS_HOST` instead whenever Redis is absent — exactly the drift this ordering prevents.
    """
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT), INGEST_RECORD_BACKEND="foo")
    started = time.monotonic()
    completed = subprocess.run(
        [sys.executable, "-m", CLI_MODULE],
        cwd=str(BACKEND_ROOT),
        env=environment,
        capture_output=True,
        text=True,
        timeout=BOOT_DEADLINE_S,
    )
    elapsed = time.monotonic() - started
    assert elapsed <= BOOT_DEADLINE_S, f"boot took {elapsed:.2f}s, over the {BOOT_DEADLINE_S}s cap"
    assert completed.returncode != 0, "INGEST_RECORD_BACKEND=foo must not boot successfully"
    output = completed.stdout + completed.stderr
    assert "INGEST_RECORD_BACKEND" in output, f"failure must name the variable; got: {output!r}"


# ── `T-02.4`: a real subprocess reaching `compose_ingest_record_store`, `postgres` refused ──


@pytest.fixture
def _fake_redis_address() -> Iterator[tuple[str, int]]:
    """Start a real, loopback-only `fakeredis` server so boot clears the Redis stage.

    `compose_ingest_record_store` (`T-02.4`) is only ever reached AFTER `connect_redis`
    succeeds — this real `fakeredis.TcpFakeServer` (same convention
    `test_redis_stream_series_sink.py` and `collectors_cli_driver.py` already use) is what lets
    the subprocess below get there without a live, unreachable Redis on the wire.
    """
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.socket.getsockname()
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


def _closed_loopback_port() -> int:
    """Return a `127.0.0.1` port nothing listens on — bind, then close without `listen()`.

    A closed port refuses a connection immediately (`ECONNREFUSED`), never blocking for a
    timeout — which is what keeps this falsifier fast instead of racing `BOOT_DEADLINE_S`.
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.bind(("127.0.0.1", 0))
    port = int(probe.getsockname()[1])
    probe.close()
    return port


def test_process_refuses_to_boot_against_an_unreachable_postgres_within_5s(
    _fake_redis_address: tuple[str, int],
) -> None:
    """`T-02.4`/`D2.5`: `INGEST_RECORD_BACKEND=postgres` + unreachable `POSTGRES_HOST` -> `rc != 0`.

    Mirrors the two falsifiers above, one stage deeper: Redis is real (the fixture) so boot
    clears `connect_redis` and actually reaches `compose_ingest_record_store` — the ONLY way to
    exercise the `try`/`except` this test exists to protect
    (`collectors_cli.py`, `store = compose_ingest_record_store(os.environ)`).

    Morde, and this IS the mutant the reviewer produced: erasing that `try`/`except` still
    exits `rc != 0` (an uncaught `IngestRecordStoreConnectionError` crashes the process the same
    way) AND the crash traceback still happens to print `POSTGRES_HOST` (it is inside the
    exception's own message) — so `rc != 0` plus "names the variable" alone does NOT kill it,
    exactly what let the mutant pass all 25 tests of this scope. What the `try`/`except` alone
    produces is the STRUCTURED refusal line `collector_boot_refused POSTGRES_HOST: ...` on
    `stdout` (`main()`'s `logger.error("collector_boot_refused %s: %s", ...)`) — a bare Python
    traceback never contains that event name. Asserting it is what actually distinguishes "boot
    refused cleanly" from "boot crashed uncaught".
    """
    redis_host, redis_port = _fake_redis_address
    environment = {
        **os.environ,
        "PYTHONPATH": str(BACKEND_ROOT),
        "REDIS_HOST": redis_host,
        "REDIS_PORT": str(redis_port),
        "INGEST_RECORD_BACKEND": "postgres",
        "POSTGRES_HOST": "127.0.0.1",
        "POSTGRES_PORT": str(_closed_loopback_port()),
        "POSTGRES_DB": "test",
        "POSTGRES_USER": "test",
        "POSTGRES_PASSWORD": "test",
    }
    started = time.monotonic()
    completed = subprocess.run(
        [sys.executable, "-m", CLI_MODULE],
        cwd=str(BACKEND_ROOT),
        env=environment,
        capture_output=True,
        text=True,
        timeout=BOOT_DEADLINE_S,
    )
    elapsed = time.monotonic() - started
    assert elapsed <= BOOT_DEADLINE_S, f"boot took {elapsed:.2f}s, over the {BOOT_DEADLINE_S}s cap"
    assert completed.returncode != 0, "an unreachable POSTGRES_HOST must not boot successfully"
    output = completed.stdout + completed.stderr
    assert "POSTGRES_HOST" in output, f"the failure must name the variable; got: {output!r}"
    assert "Traceback" not in output, (
        f"boot must refuse cleanly (logged, rc != 0), never crash uncaught; got: {output!r}"
    )
    assert "collector_boot_refused" in completed.stdout, (
        "the refusal must be the SAME structured log event every other boot failure in this "
        f"module uses, not a bare exception surfacing by accident; got stdout: {completed.stdout!r}"
    )


# ── `T-05.3`: `main()` wires the REAL `SeriesKey` mapping, never the raising placeholder ──────


def test_main_wires_the_real_series_mapping(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Regression for the crash loop `[MEDIDO 2026-09-08]`: 55 restarts/10min.

    `main()` called `run()` with NEITHER `premium_index_to_rows` NOR `force_order_to_rows`
    supplied, so every non-empty read fell through to `_mapping_not_decided_yet`
    (`docs/context/captura-em-producao/medicoes/CA-F3-8-pegada.md` §1.1).

    `run()` is monkeypatched to a fake that only RECORDS the kwargs it received — no thread ever
    starts, no network is touched, and `main()` still runs its real boot (a real loopback
    `fakeredis` server, a real `sqlite` store under `tmp_path`) up to the point it calls `run()`.
    Checking the two callables are merely non-`None` would NOT catch the regression:
    `_mapping_not_decided_yet` is itself a non-`None` callable. This test actually CALLS both
    with the same fixtures `test_collector_series_mapping.py` pins, so a revert back to the
    unsupplied default fails here by raising `SeriesRowMappingNotDecidedError`, not by a
    silent `None`.
    """
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.socket.getsockname()
    recorded: dict[str, object] = {}

    def _fake_run(**kwargs: object) -> int:
        recorded.update(kwargs)
        return 0

    monkeypatch.setattr(collectors_cli, "run", _fake_run)
    monkeypatch.setenv("REDIS_HOST", host)
    monkeypatch.setenv("REDIS_PORT", str(port))
    monkeypatch.setenv("INGEST_HEALTH_STORE_PATH", str(tmp_path / "store.sqlite3"))

    try:
        return_code = collectors_cli.main([])
    finally:
        server.shutdown()
        thread.join(timeout=2.0)

    assert return_code == 0

    premium_index_to_rows = cast(PremiumIndexReadingToRows, recorded["premium_index_to_rows"])
    force_order_to_rows = cast(ForceOrderObservationToRows, recorded["force_order_to_rows"])

    btcusdt_reading = PremiumIndexReading(
        symbol="BTCUSDT",
        mark_price_raw="78249.60000000",
        index_price_raw="78274.40021739",
        estimated_settle_price_raw="78379.99641129",
        last_funding_rate_raw="0.00009992",
        interest_rate_raw="0.00010000",
        next_funding_time=1_788_883_200_000,
        source_time=1_788_869_519_000,
    )
    dogeusdt_reading = PremiumIndexReading(
        symbol="DOGEUSDT",
        mark_price_raw="0.40000000",
        index_price_raw="0.40010000",
        estimated_settle_price_raw="0.40005000",
        last_funding_rate_raw="0.00010000",
        interest_rate_raw="0.00010000",
        next_funding_time=1_788_883_200_000,
        source_time=1_788_869_519_000,
    )
    btcusdt_liquidation = ForceOrderKeyObservation(
        key=ForceOrderNaturalKey(
            symbol="BTCUSDT",
            side="SELL",
            price="78000.00",
            orig_qty="0.010",
            trade_time=1_788_869_519_500,
        ),
        day="2026-09-08",
    )

    assert len(premium_index_to_rows(1_788_869_520_000, btcusdt_reading)) == 2, (
        "a BTCUSDT (in-universe) premiumIndex reading must yield real rows, never raise"
    )
    assert premium_index_to_rows(1_788_869_520_000, dogeusdt_reading) == (), (
        "a non-universe symbol must yield zero rows, never raise"
    )
    assert len(force_order_to_rows(1_788_869_520_000, btcusdt_liquidation)) == 1, (
        "a BTCUSDT (in-universe) liquidation must yield a real row, never raise"
    )


@pytest.mark.parametrize(
    ("variable", "raw"),
    [
        ("KLINES_CYCLE_INTERVAL_S", "0"),
        ("KLINES_CYCLE_INTERVAL_S", "-1"),
        ("KLINES_CYCLE_INTERVAL_S", "nan"),
        ("KLINES_BACKFILL_DAYS", "0"),
        ("KLINES_BACKFILL_DAYS", "-7"),
        ("KLINES_CYCLE_OFFSET_S", "-0.5"),
        ("KLINES_CYCLE_OFFSET_S", "60"),
        ("KLINES_CYCLE_OFFSET_S", "600"),
    ],
)
def test_a_non_positive_klines_cadence_is_refused_at_boot(variable: str, raw: str) -> None:
    """`RN-4` fail-fast: a cadence of zero is a typo, and it is refused in the first seconds.

    Morde: accept `0` and `stop_event.wait(0)` returns instantly, so the collector calls
    `/fapi/v1/klines` in a tight loop until Binance bans the IP — a failure that surfaces
    minutes later, as an HTTP `418`, far from the character that caused it. Accept `0` for
    `KLINES_BACKFILL_DAYS` and the boot backfill silently does nothing, which `DoD-1`
    (`>= 10.000` rows) would fail hours later with no line naming the cause.

    `KLINES_CYCLE_OFFSET_S` joins the same fail-fast because it has the same shape of silent
    failure, in both directions. A NEGATIVE offset polls before `bucket_end`, and the
    anti-lookahead cut (`is_closed_bucket`) then drops the bar — a collector that looks healthy
    and publishes nothing. An offset of a whole cadence or more moves the poll onto a DIFFERENT
    bucket while every log line still reads "aligned". `60` is refused and `59,9` is not,
    because the interval is exclusive: `[0, interval_s)`.
    """
    with pytest.raises(collectors_cli.CollectorBootConfigurationError) as excinfo:
        collectors_cli.resolve_boot_config({variable: raw})
    assert excinfo.value.variable == variable
    assert variable in str(excinfo.value)


@pytest.mark.parametrize("raw", ["0", "0.0", "-1", "-0.5", "nan", "NaN", "-nan"])
def test_a_non_positive_premium_index_cadence_is_refused_at_boot(raw: str) -> None:
    """`PREMIUM_INDEX_CYCLE_INTERVAL_S` joins the same `RN-4` fail-fast as the klines cadence.

    It did NOT until this commit: `resolve_boot_config` parsed it with `_parse_float`, with no
    positivity guard at all, so `PREMIUM_INDEX_CYCLE_INTERVAL_S=0` BOOTED and
    `_run_premium_index_collector` closed its cycle with `stop_event.wait(0.0)` — the tight loop
    against `/fapi/v1/premiumIndex` that `_positive_float` was written to forbid, reaching the
    operator only as an HTTP `418` minutes later.

    `nan` is in this list because the OBVIOUS spelling of the guard does not catch it: `nan <= 0`
    is `False`, so `if value <= 0` would accept `nan`, and `threading.Event().wait(nan)` returns
    immediately (measured: `1,0e-5` s) — the same tight loop, reached through the one comparison
    that silently answers `False` to everything. The guard is spelled `not value > 0` for this.
    """
    with pytest.raises(collectors_cli.CollectorBootConfigurationError) as excinfo:
        collectors_cli.resolve_boot_config({"PREMIUM_INDEX_CYCLE_INTERVAL_S": raw})
    assert excinfo.value.variable == "PREMIUM_INDEX_CYCLE_INTERVAL_S"
    assert "PREMIUM_INDEX_CYCLE_INTERVAL_S" in str(excinfo.value)


def test_a_positive_premium_index_cadence_still_boots() -> None:
    """The guard must refuse the typo without narrowing what a real operator may configure."""
    assert (
        collectors_cli.resolve_boot_config(
            {"PREMIUM_INDEX_CYCLE_INTERVAL_S": "0.5"}
        ).premium_index_cycle_interval_s
        == 0.5
    )
    assert collectors_cli.resolve_boot_config({}).premium_index_cycle_interval_s == 60.0


@pytest.mark.parametrize(
    "variable", ["KLINES_CYCLE_INTERVAL_S", "PREMIUM_INDEX_CYCLE_INTERVAL_S"]
)
@pytest.mark.parametrize("raw", ["inf", "Infinity", "1e400", "-inf"])
def test_a_non_finite_cadence_is_refused_at_boot(variable: str, raw: str) -> None:
    """A cadence of `inf` is refused at BOOT, on BOTH cycles — it is not a "safe" failure.

    Morde: before the `math.isfinite` half of the guard, `inf`, `Infinity` and `1e400` (which
    `float()` widens to `inf`) all BOOTED on both variables — measured, both spellings:
    `resolve_boot_config({'KLINES_CYCLE_INTERVAL_S': 'inf'}) -> BOOTOU -> inf`. `not inf > 0` is
    `False`, so the positivity guard alone lets every non-finite POSITIVE value through; only
    `-inf` was already refused by it, and it is in this list to keep that direction covered.

    Why "it would just block forever, which is safe" is FALSE, and it was measured, not assumed:
    `threading.Event().wait(inf)` does not block — on CPython/Linux it raises
    `OverflowError: timestamp out of range for platform time_t` in `2,1e-05` s. That raise
    happens at the `stop_event.wait(interval_s)` that CLOSES each cycle, which sits OUTSIDE the
    `try` that guards the publish, and `OverflowError` is not in `_PUBLISH_FAILURE_EXCEPTIONS`.
    So the collector thread dies at the end of its FIRST cycle without `failure_event.set()` and
    without `exit_code[0] = 1`; the supervisor waits on `stop|failure` and never learns. Process
    alive, `rc=0`, collector dead — the ambiguous `rc=0` of `ADR-012`, with a `threading`
    excepthook traceback as the only notice. Refusing at boot is the only place that speaks.
    """
    with pytest.raises(collectors_cli.CollectorBootConfigurationError) as excinfo:
        collectors_cli.resolve_boot_config({variable: raw})
    assert excinfo.value.variable == variable
    assert variable in str(excinfo.value)


def test_the_sink_of_a_non_finite_cadence_dies_uncaught() -> None:
    """The boot guard above is the ONLY guard: the cycle-closing wait raises, and nobody catches.

    This is the falsifier of the claim the guard rests on, and it asserts the two halves that
    make the failure silent rather than loud:

    1. `Event().wait(inf)` RAISES instead of blocking — so "it would hang harmlessly" is false;
    2. `OverflowError` is not caught by `_PUBLISH_FAILURE_EXCEPTIONS`, the only `except` in the
       collector loop — so the raise is not converted into `verdict=REJECTED` +
       `failure_event.set()` + `exit_code[0] = 1` the way a real publish failure is.

    If a later commit ADDS `OverflowError` to `_PUBLISH_FAILURE_EXCEPTIONS`, this assertion
    fails on purpose: the boot guard's docstring claims to be the only line standing between an
    operator typo and a silently dead thread, and that claim would have stopped being true.
    """
    with pytest.raises(OverflowError):
        threading.Event().wait(math.inf)
    assert not issubclass(OverflowError, collectors_cli._PUBLISH_FAILURE_EXCEPTIONS), (
        "the cycle-closing wait's OverflowError must stay OUTSIDE the caught set for the boot "
        "guard to be load-bearing; if it is added here, re-measure the boot guard's rationale"
    )
