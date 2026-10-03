"""`src.main.__main__.main` reads `API_WORKERS`/`API_LIMIT_MAX_REQUESTS` — `T-06.3`.

`handoff/T-06.3-desenho.md` §2: one API process serializes the screen's 10 parallel series, so
`deploy/compose.yml` asks for 2 worker processes. uvicorn only spawns workers from an IMPORT
STRING, never from an app object, so the launcher must switch shape when `API_WORKERS > 1` and
keep today's exact call (app object, no `workers`) otherwise.

Same technique as `test_main_reads_app_host_from_environment.py`: `main()` runs for real with
`uvicorn.run` replaced by a recorder, because the behavior is fully decided by environment reads.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.main import app as expected_app
from src.main.__main__ import InvalidWorkerCountError, main


@pytest.fixture
def recorded(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Record the arguments `main()` hands to `uvicorn.run`, with no socket opened."""
    calls: dict[str, Any] = {}

    def _fake_run(served_app: object, **kwargs: object) -> None:
        calls["app"] = served_app
        calls.update(kwargs)

    monkeypatch.setattr("src.main.__main__.uvicorn.run", _fake_run)
    monkeypatch.delenv("API_WORKERS", raising=False)
    monkeypatch.delenv("API_LIMIT_MAX_REQUESTS", raising=False)
    return calls


def test_without_api_workers_the_call_is_the_single_in_process_server(
    recorded: dict[str, Any],
) -> None:
    """CALA: unset ⇒ the app OBJECT and no worker/recycling argument at all (pre-`T-06.3`)."""
    main()

    assert recorded["app"] is expected_app
    assert "workers" not in recorded
    assert "limit_max_requests" not in recorded


def test_api_workers_one_keeps_the_single_server_even_with_a_recycling_limit(
    monkeypatch: pytest.MonkeyPatch, recorded: dict[str, Any]
) -> None:
    """CALA: `1` is the default spelled out; a lone server never recycles (it would just exit)."""
    monkeypatch.setenv("API_WORKERS", "1")
    monkeypatch.setenv("API_LIMIT_MAX_REQUESTS", "2000")

    main()

    assert recorded["app"] is expected_app
    assert "workers" not in recorded
    assert "limit_max_requests" not in recorded


def test_api_workers_two_hands_uvicorn_the_import_string_and_the_recycling_limit(
    monkeypatch: pytest.MonkeyPatch, recorded: dict[str, Any]
) -> None:
    """MORDE: the values `deploy/compose.yml` sets reach `uvicorn.run` in worker form."""
    monkeypatch.setenv("API_WORKERS", "2")
    monkeypatch.setenv("API_LIMIT_MAX_REQUESTS", "2000")

    main()

    assert recorded["app"] == "src.main:app"
    assert recorded["workers"] == 2
    assert recorded["limit_max_requests"] == 2000
    assert recorded["limit_max_requests_jitter"] == 200


def test_api_workers_without_a_limit_never_recycles(
    monkeypatch: pytest.MonkeyPatch, recorded: dict[str, Any]
) -> None:
    """Workers without `API_LIMIT_MAX_REQUESTS` ⇒ `limit_max_requests=None` (uvicorn: never)."""
    monkeypatch.setenv("API_WORKERS", "3")

    main()

    assert recorded["workers"] == 3
    assert recorded["limit_max_requests"] is None
    assert recorded["limit_max_requests_jitter"] == 0


def test_api_workers_zero_is_refused(
    monkeypatch: pytest.MonkeyPatch, recorded: dict[str, Any]
) -> None:
    """Rejected case: `0` would mean a server with no process; refused before `uvicorn.run`."""
    monkeypatch.setenv("API_WORKERS", "0")

    with pytest.raises(InvalidWorkerCountError):
        main()

    assert recorded == {}
