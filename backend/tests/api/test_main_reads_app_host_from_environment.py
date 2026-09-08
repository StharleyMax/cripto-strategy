"""`src.main.__main__.main` resolves the `uvicorn` bind host from `APP_HOST`.

`CA-E2E-local.md` §2, `[DECISAO-OWNER: 2026-09-08]`. Before this fix, `host="127.0.0.1"` was a
literal baked into the call — no environment read, no way for `deploy/compose.yml` to widen it
for the `api` service without patching source.
The real end-to-end proof that `web`→`api` now reaches the container by service name lives in
`docs/context/captura-em-producao/gates/` (a live `docker compose` run, torn down after); THIS
test is the fast, in-process half — it proves the resolution rule itself: default stays the
2026-09-03 loopback-only behavior, and `APP_HOST` overrides it when set, exactly the two states
`deploy/compose.yml`'s `api` service (sets it) and every non-container caller (does not) rely
on.

Technique: `main()` is called for real — no reimplementation of its env-reading logic here —
with `uvicorn.run` monkeypatched to a recorder instead of a real listener, because a unit test
has no business opening a socket for behavior fully determined by two `os.environ.get` calls;
`uvicorn.Server` over a real socket is what
`backend/tests/api/test_ingest_health_route_over_the_network.py` is for, and this file's job
is narrower.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.main import app as expected_app
from src.main.__main__ import main


@pytest.fixture(autouse=True)
def _record_uvicorn_run(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Replace `uvicorn.run` inside the module under test with a call recorder.

    Patching `src.main.__main__.uvicorn.run` (not the `uvicorn` package globally) means only
    this module's call is intercepted — nothing else in the suite that happens to import
    `uvicorn` is affected.
    """
    calls: dict[str, Any] = {}

    def _fake_run(served_app: object, **kwargs: object) -> None:
        calls["app"] = served_app
        calls.update(kwargs)

    monkeypatch.setattr("src.main.__main__.uvicorn.run", _fake_run)
    return calls


def test_default_host_stays_loopback_when_app_host_is_unset(
    monkeypatch: pytest.MonkeyPatch, _record_uvicorn_run: dict[str, Any]
) -> None:
    """CALA: no `APP_HOST` in the environment ⇒ the pre-existing loopback-only behavior."""
    monkeypatch.delenv("APP_HOST", raising=False)
    monkeypatch.delenv("APP_PORT", raising=False)

    main()

    assert _record_uvicorn_run["host"] == "127.0.0.1"
    assert _record_uvicorn_run["port"] == 8000
    assert _record_uvicorn_run["app"] is expected_app


def test_app_host_from_environment_overrides_the_default(
    monkeypatch: pytest.MonkeyPatch, _record_uvicorn_run: dict[str, Any]
) -> None:
    """MORDE: the value `deploy/compose.yml`'s `api` service sets reaches `uvicorn.run` unchanged.

    Without the fix, this env var never being read is the reported bug: the host would stay
    `"127.0.0.1"` no matter what this test sets. `noqa: S104` — the all-interfaces literal
    below is an assertion target, not a socket this test binds.
    """
    all_interfaces = "0.0.0.0"  # noqa: S104
    monkeypatch.setenv("APP_HOST", all_interfaces)
    monkeypatch.setenv("APP_PORT", "9001")

    main()

    assert _record_uvicorn_run["host"] == all_interfaces
    assert _record_uvicorn_run["port"] == 9001


def test_app_host_with_any_other_value_is_passed_through_verbatim(
    monkeypatch: pytest.MonkeyPatch, _record_uvicorn_run: dict[str, Any]
) -> None:
    """Negative control: this is a plain passthrough, not a `0.0.0.0`-only special case."""
    monkeypatch.setenv("APP_HOST", "10.0.0.5")
    monkeypatch.delenv("APP_PORT", raising=False)

    main()

    assert _record_uvicorn_run["host"] == "10.0.0.5"
    assert _record_uvicorn_run["port"] == 8000
