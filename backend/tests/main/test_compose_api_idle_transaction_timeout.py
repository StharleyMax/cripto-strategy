"""`idle_in_transaction_session_timeout` reaches the API ALONE — WI, `D-2` (2026-09-27).

`D-2` bought the timeout for the API's Postgres access only. `api`, `writer` and `collector`
share ONE Postgres role and ONE `env_file` (`../.env`), so the only place that reaches the API
alone is `services.api.environment` in `deploy/compose.yml` (`PGOPTIONS`, read by libpq). This
file pins both sides of that, statically (no Docker, no network):

- the `api` service carries `idle_in_transaction_session_timeout=30s` in `PGOPTIONS`;
- NO other service carries `PGOPTIONS`, and `.env.example` never mentions the timeout — either
  would hand it to the writer and the collector, which `D-2` excludes.

The rejected case lives here too: a synthetic compose with `PGOPTIONS` on `writer`, or without
it on `api`, must be reported by the same checker the real file passes.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Final

import yaml

_REPO_ROOT: Final[Path] = Path(__file__).resolve().parents[3]
_COMPOSE_PATH: Final[Path] = _REPO_ROOT / "deploy" / "compose.yml"
_ENV_EXAMPLE_PATH: Final[Path] = _REPO_ROOT / ".env.example"

_API_SERVICE: Final[str] = "api"
_TIMEOUT_SETTING: Final[str] = "idle_in_transaction_session_timeout"
_EXPECTED_TIMEOUT: Final[str] = f"{_TIMEOUT_SETTING}=30s"


def _environment(service: dict[str, Any]) -> dict[str, str]:
    """Normalise a compose `environment:` (mapping or `KEY=VALUE` list) to a mapping."""
    raw = service.get("environment") or {}
    if isinstance(raw, dict):
        return {str(key): str(value) for key, value in raw.items()}
    pairs = (str(item).split("=", 1) for item in raw)
    return {pair[0]: (pair[1] if len(pair) > 1 else "") for pair in pairs}


def _timeout_violations(compose: dict[str, Any]) -> list[str]:
    """Name every way `compose` breaks "the timeout reaches the API, and only the API"."""
    services: dict[str, dict[str, Any]] = compose["services"]
    violations: list[str] = []
    api_options = _environment(services[_API_SERVICE]).get("PGOPTIONS", "")
    if _EXPECTED_TIMEOUT not in api_options:
        violations.append(f"api PGOPTIONS={api_options!r} lacks {_EXPECTED_TIMEOUT!r}")
    for name, service in services.items():
        if name != _API_SERVICE and "PGOPTIONS" in _environment(service):
            violations.append(f"{name} carries PGOPTIONS (the timeout must reach the api alone)")
    return violations


def _load_compose() -> dict[str, Any]:
    loaded: dict[str, Any] = yaml.safe_load(_COMPOSE_PATH.read_text(encoding="utf-8"))
    return loaded


def test_real_compose_pins_the_timeout_on_the_api_alone() -> None:
    """The versioned `deploy/compose.yml` passes the checker with zero violations."""
    compose = _load_compose()
    assert _timeout_violations(compose) == []
    # The stable `pg_stat_activity` key the post-deploy reading filters on (the IP is not one).
    assert _environment(compose["services"][_API_SERVICE]).get("PGAPPNAME") == "cripto-api"


def test_env_example_never_carries_the_timeout() -> None:
    """`.env` is every service's `env_file`: the setting there would reach writer and collector."""
    text = _ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
    assert _TIMEOUT_SETTING not in text
    assert "PGOPTIONS" not in text


def test_checker_rejects_pgoptions_on_the_writer() -> None:
    """Rejected case: the timeout leaking to the writer is reported by name."""
    compose = copy.deepcopy(_load_compose())
    writer = compose["services"]["writer"]
    writer["environment"] = {**_environment(writer), "PGOPTIONS": f"-c {_EXPECTED_TIMEOUT}"}
    assert _timeout_violations(compose) == [
        "writer carries PGOPTIONS (the timeout must reach the api alone)"
    ]


def test_checker_rejects_an_api_without_the_timeout() -> None:
    """Rejected case: an `api` service that lost `PGOPTIONS` is reported."""
    compose = copy.deepcopy(_load_compose())
    api_environment = _environment(compose["services"][_API_SERVICE])
    del api_environment["PGOPTIONS"]
    compose["services"][_API_SERVICE]["environment"] = api_environment
    assert _timeout_violations(compose) == [f"api PGOPTIONS='' lacks {_EXPECTED_TIMEOUT!r}"]


def test_checker_reads_list_form_environment() -> None:
    """Compose also accepts `- KEY=VALUE`; a list-form `PGOPTIONS` on `collector` still bites."""
    compose = copy.deepcopy(_load_compose())
    compose["services"]["collector"]["environment"] = [f"PGOPTIONS=-c {_EXPECTED_TIMEOUT}"]
    assert _timeout_violations(compose) == [
        "collector carries PGOPTIONS (the timeout must reach the api alone)"
    ]
