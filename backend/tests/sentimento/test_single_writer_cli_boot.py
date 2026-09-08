"""`T-02.5` / `D2.5`: boot resolves config, fails fast, and always names the variable.

Mirrors `test_collectors_cli_boot.py`'s own structure for the same `SPEC-004` §3.1-shaped
contract, one stage deeper: this writer ALWAYS needs Postgres (no `sqlite` fallback, `[Q10]`
decided this process never composes an `IngestRecordStore`), so every unit test below supplies
every required Postgres variable explicitly rather than relying on a default.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.infra import single_writer_cli
from src.modules.sentimento.infra.redis_resp_client import SocketLike

BACKEND_ROOT = Path(__file__).resolve().parents[2]
CLI_MODULE = "src.modules.sentimento.infra.single_writer_cli"
# `D2.5`'s falsifier window — the boot has to fail well inside it, not merely eventually.
BOOT_DEADLINE_S = 5.0

_REQUIRED_POSTGRES_ENV = {
    "POSTGRES_DB": "test",
    "POSTGRES_USER": "test",
    "POSTGRES_PASSWORD": "test",
}


# ── `resolve_boot_config` — every variable, parsed or defaulted, never silently coerced ──────


def test_defaults_apply_when_every_variable_is_absent_except_the_required_postgres_three() -> None:
    """An otherwise-empty environment resolves to the documented defaults, not to a crash."""
    config = single_writer_cli.resolve_boot_config(dict(_REQUIRED_POSTGRES_ENV))
    assert config.redis_host == "localhost"
    assert config.redis_port == 6379
    assert config.redis_stream == "md.series.write"
    assert config.redis_stream_group == "single_writer"
    assert config.redis_stream_consumer == "writer-1"
    assert config.postgres_host == "postgres"
    assert config.postgres_port == 5432
    assert config.writer_batch_size == 100
    assert config.writer_poll_interval_ms == 500


def test_every_variable_is_read_when_present() -> None:
    """Every one of the variables `SPEC-004` §3.4/§3.2 names actually reaches `BootConfig`."""
    config = single_writer_cli.resolve_boot_config(
        {
            "REDIS_HOST": "redis.internal",
            "REDIS_PORT": "6380",
            "REDIS_STREAM": "md.series.custom",
            "REDIS_STREAM_GROUP": "custom-group",
            "REDIS_STREAM_CONSUMER": "writer-2",
            "POSTGRES_HOST": "pg.internal",
            "POSTGRES_PORT": "5433",
            "POSTGRES_DB": "md",
            "POSTGRES_USER": "writer",
            "POSTGRES_PASSWORD": "secret",
            "WRITER_BATCH_SIZE": "50",
            "WRITER_POLL_INTERVAL_MS": "250",
        }
    )
    assert config.redis_host == "redis.internal"
    assert config.redis_port == 6380
    assert config.redis_stream == "md.series.custom"
    assert config.redis_stream_group == "custom-group"
    assert config.redis_stream_consumer == "writer-2"
    assert config.postgres_host == "pg.internal"
    assert config.postgres_port == 5433
    assert config.postgres_db == "md"
    assert config.postgres_user == "writer"
    assert config.postgres_password == "secret"  # noqa: S105 - a dummy test value, not a real credential
    assert config.writer_batch_size == 50
    assert config.writer_poll_interval_ms == 250


@pytest.mark.parametrize(
    ("variable", "raw"),
    [
        ("REDIS_PORT", "not-a-port"),
        ("POSTGRES_PORT", "not-a-port"),
        ("WRITER_BATCH_SIZE", "many"),
        ("WRITER_POLL_INTERVAL_MS", "soon"),
    ],
)
def test_an_unparseable_numeric_variable_names_itself_in_the_error(variable: str, raw: str) -> None:
    """A malformed number is refused, and the message names WHICH variable — never a guess."""
    environ = {**_REQUIRED_POSTGRES_ENV, variable: raw}
    with pytest.raises(single_writer_cli.WriterBootConfigurationError) as excinfo:
        single_writer_cli.resolve_boot_config(environ)
    assert excinfo.value.variable == variable
    assert variable in str(excinfo.value)


@pytest.mark.parametrize("missing", ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"])
def test_a_missing_required_postgres_variable_names_itself(missing: str) -> None:
    """`[Q10]`: this writer always needs Postgres — no default can stand in for a credential."""
    environ = {key: value for key, value in _REQUIRED_POSTGRES_ENV.items() if key != missing}
    with pytest.raises(single_writer_cli.WriterBootConfigurationError) as excinfo:
        single_writer_cli.resolve_boot_config(environ)
    assert excinfo.value.variable == missing
    assert missing in str(excinfo.value)


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


def test_a_refused_redis_connection_raises_naming_redis_host() -> None:
    """A refused connection raises `WriterBootConnectionError` naming `REDIS_HOST`."""
    config = single_writer_cli.resolve_boot_config(
        {**_REQUIRED_POSTGRES_ENV, "REDIS_HOST": "nowhere", "REDIS_PORT": "1"}
    )

    def _open_socket(_host: str, _port: int) -> SocketLike:
        return _RefusingSocket()

    with pytest.raises(single_writer_cli.WriterBootConnectionError) as excinfo:
        single_writer_cli.connect_redis(config, open_socket=_open_socket)
    assert excinfo.value.variable == "REDIS_HOST"
    assert "REDIS_HOST" in str(excinfo.value)
    assert "nowhere" in str(excinfo.value)


# ── `connect_postgres` — same falsifier shape, naming `POSTGRES_HOST` ────────────────────────


def test_a_refused_postgres_connection_raises_naming_postgres_host() -> None:
    """A `psycopg.OperationalError` at connect raises `WriterBootConnectionError`."""
    config = single_writer_cli.resolve_boot_config(
        {**_REQUIRED_POSTGRES_ENV, "POSTGRES_HOST": "nowhere", "POSTGRES_PORT": "1"}
    )

    def _connect(_conninfo: str) -> psycopg.Connection[object]:
        raise psycopg.OperationalError("could not connect to server")

    with pytest.raises(single_writer_cli.WriterBootConnectionError) as excinfo:
        single_writer_cli.connect_postgres(config, connect=_connect)
    assert excinfo.value.variable == "POSTGRES_HOST"
    assert "POSTGRES_HOST" in str(excinfo.value)
    assert "nowhere" in str(excinfo.value)


# ── THE REAL FALSIFIER: a live subprocess, a bad host, `rc != 0` inside 5 s ─────────────────


@pytest.fixture
def _fake_redis_address() -> Iterator[tuple[str, int]]:
    """Start a real, loopback-only `fakeredis` server so boot clears the Redis stage."""
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.socket.getsockname()
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


def _closed_loopback_port() -> int:
    """Return a `127.0.0.1` port nothing listens on — refuses immediately, never times out."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.bind(("127.0.0.1", 0))
    port = int(probe.getsockname()[1])
    probe.close()
    return port


def test_process_refuses_to_boot_against_an_unreachable_redis_host_within_5s() -> None:
    """`D2.5`: `REDIS_HOST=nao-existe python -m ... single_writer_cli` -> `rc != 0` in <= 5 s."""
    environment = {
        **os.environ,
        "PYTHONPATH": str(BACKEND_ROOT),
        "REDIS_HOST": "nao-existe",
        **_REQUIRED_POSTGRES_ENV,
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
    assert completed.returncode != 0, "an unreachable REDIS_HOST must not boot successfully"
    output = completed.stdout + completed.stderr
    assert "REDIS_HOST" in output, f"the failure must name the variable; got: {output!r}"
    assert "Traceback" not in output, (
        f"boot must refuse cleanly, never crash uncaught; got: {output!r}"
    )
    assert "writer_boot_refused" in completed.stdout, (
        f"the refusal must be the structured log event; got stdout: {completed.stdout!r}"
    )


def test_process_refuses_to_boot_with_a_missing_postgres_variable_within_5s() -> None:
    """`D2.5`: no Postgres variable set at all -> `rc != 0` in <= 5 s, naming `POSTGRES_DB`.

    This has to fail BEFORE Redis is ever dialled — the assertion below is what proves the
    ordering: no `REDIS_HOST` override is given, so if Redis were dialled first against the
    default `localhost:6379` (almost certainly nothing listening in the test sandbox), the
    failure would name `REDIS_HOST` instead. `resolve_boot_config` runs entirely before either
    connect, so it names `POSTGRES_DB` regardless.
    """
    environment = {**os.environ, "PYTHONPATH": str(BACKEND_ROOT)}
    for variable in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"):
        environment.pop(variable, None)
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
    assert completed.returncode != 0, "a missing POSTGRES_DB must not boot successfully"
    output = completed.stdout + completed.stderr
    assert "POSTGRES_DB" in output, f"the failure must name the variable; got: {output!r}"


def test_process_refuses_to_boot_against_an_unreachable_postgres_within_5s(
    _fake_redis_address: tuple[str, int],
) -> None:
    """`D2.5`: `POSTGRES_HOST=nao-existe` -> `rc != 0` in <= 5 s, ONLY after Redis clears.

    Mirrors `test_collectors_cli_boot.py`'s own Postgres falsifier one stage deeper: Redis is
    real (the fixture) so boot clears `connect_redis` and actually reaches `connect_postgres`.
    """
    redis_host, redis_port = _fake_redis_address
    environment = {
        **os.environ,
        "PYTHONPATH": str(BACKEND_ROOT),
        "REDIS_HOST": redis_host,
        "REDIS_PORT": str(redis_port),
        **_REQUIRED_POSTGRES_ENV,
        "POSTGRES_HOST": "127.0.0.1",
        "POSTGRES_PORT": str(_closed_loopback_port()),
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
    assert "writer_boot_refused" in completed.stdout, (
        f"the refusal must be the structured log event; got stdout: {completed.stdout!r}"
    )


def test_single_writer_cli_py_exists_exactly_once() -> None:
    """`D2.1`: `find backend/src -iname 'single_writer_cli.py' | wc -l` -> **1**."""
    matches = list((BACKEND_ROOT / "src").rglob("single_writer_cli.py"))
    assert len(matches) == 1, matches
