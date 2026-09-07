"""`T-01.5` / `D1.4` (half): boot resolves config, fails fast, and always names the variable."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.redis_resp_client import SocketLike

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
        }
    )
    assert config.redis_host == "redis.internal"
    assert config.redis_port == 6380
    assert config.redis_stream == "md.series.custom"
    assert config.redis_stream_maxlen == 42
    assert config.ingest_health_store_path == store_path
    assert config.premium_index_cycle_interval_s == 12.5


@pytest.mark.parametrize(
    ("variable", "raw"),
    [
        ("REDIS_PORT", "not-a-port"),
        ("REDIS_STREAM_MAXLEN", "many"),
        ("PREMIUM_INDEX_CYCLE_INTERVAL_S", "soon"),
    ],
)
def test_an_unparseable_numeric_variable_names_itself_in_the_error(variable: str, raw: str) -> None:
    """A malformed number is refused, and the message names WHICH variable — never a guess."""
    with pytest.raises(collectors_cli.CollectorBootConfigurationError) as excinfo:
        collectors_cli.resolve_boot_config({variable: raw})
    assert excinfo.value.variable == variable
    assert variable in str(excinfo.value)


def test_an_unsupported_backend_refuses_to_boot_naming_the_variable() -> None:
    """`INGEST_RECORD_BACKEND=postgres` is refused in F1 — the composition arrives in `T-02.4`."""
    with pytest.raises(collectors_cli.CollectorBootConfigurationError) as excinfo:
        collectors_cli.resolve_boot_config({"INGEST_RECORD_BACKEND": "postgres"})
    assert excinfo.value.variable == "INGEST_RECORD_BACKEND"
    assert "INGEST_RECORD_BACKEND" in str(excinfo.value)


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
