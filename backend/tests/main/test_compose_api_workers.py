"""`API_WORKERS`, `API_LIMIT_MAX_REQUESTS` and `mem_limit` reach the API ALONE — `T-06.3`.

`handoff/T-06.3-desenho.md` §2: the worker count and the recycling limit are pinned in
`services.api.environment`, never in `.env` — `.env` is also the `env_file` of `writer` and
`collector` (the same reason `test_compose_api_idle_transaction_timeout.py` pins `PGOPTIONS`).
`mem_limit` bounds the two workers so an outlier page OOM-kills one worker (respawned by
uvicorn's supervisor) instead of pushing the VPS into swap. Static checks, no Docker.
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
_API_ONLY_KEYS: Final[tuple[str, ...]] = ("API_WORKERS", "API_LIMIT_MAX_REQUESTS")


def _environment(service: dict[str, Any]) -> dict[str, str]:
    """Normalise a compose `environment:` (mapping or `KEY=VALUE` list) to a mapping."""
    raw = service.get("environment") or {}
    if isinstance(raw, dict):
        return {str(key): str(value) for key, value in raw.items()}
    pairs = (str(item).split("=", 1) for item in raw)
    return {pair[0]: (pair[1] if len(pair) > 1 else "") for pair in pairs}


def _worker_violations(compose: dict[str, Any]) -> list[str]:
    """Name every way `compose` breaks "workers, recycling and memory bound on the API only"."""
    services: dict[str, dict[str, Any]] = compose["services"]
    api = services[_API_SERVICE]
    api_environment = _environment(api)
    violations = [f"api lacks {key}" for key in _API_ONLY_KEYS if key not in api_environment]
    if "mem_limit" not in api:
        violations.append("api lacks mem_limit")
    for name, service in services.items():
        if name == _API_SERVICE:
            continue
        violations.extend(
            f"{name} carries {key}" for key in _API_ONLY_KEYS if key in _environment(service)
        )
    return violations


def _load_compose() -> dict[str, Any]:
    loaded: dict[str, Any] = yaml.safe_load(_COMPOSE_PATH.read_text(encoding="utf-8"))
    return loaded


def test_real_compose_runs_two_recycled_workers_bounded_on_the_api_alone() -> None:
    """The versioned `deploy/compose.yml` passes, with the design's numbers."""
    compose = _load_compose()
    assert _worker_violations(compose) == []
    api = compose["services"][_API_SERVICE]
    assert _environment(api)["API_WORKERS"] == "2"
    assert _environment(api)["API_LIMIT_MAX_REQUESTS"] == "2000"
    assert api["mem_limit"] == "1536m"
    # `ADR-027/D1`: the workers are children of the same process, not a new container/command.
    assert api["command"] == "python -m src.main"


def test_env_example_never_carries_the_worker_settings() -> None:
    """`.env` is every service's `env_file`: the keys there would reach writer and collector."""
    text = _ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
    for key in _API_ONLY_KEYS:
        assert key not in text


def test_checker_rejects_workers_on_the_writer() -> None:
    """Rejected case: the worker count leaking to the writer is reported by name."""
    compose = copy.deepcopy(_load_compose())
    writer = compose["services"]["writer"]
    writer["environment"] = {**_environment(writer), "API_WORKERS": "2"}
    assert _worker_violations(compose) == ["writer carries API_WORKERS"]


def test_checker_rejects_an_api_without_mem_limit_or_workers() -> None:
    """Rejected case: an `api` that lost its bound and its worker count is reported."""
    compose = copy.deepcopy(_load_compose())
    api = compose["services"][_API_SERVICE]
    del api["mem_limit"]
    api_environment = _environment(api)
    del api_environment["API_WORKERS"]
    api["environment"] = api_environment
    assert _worker_violations(compose) == ["api lacks API_WORKERS", "api lacks mem_limit"]


def test_checker_reads_list_form_environment() -> None:
    """A list-form `API_LIMIT_MAX_REQUESTS` on `collector` still bites."""
    compose = copy.deepcopy(_load_compose())
    compose["services"]["collector"]["environment"] = ["API_LIMIT_MAX_REQUESTS=2000"]
    assert _worker_violations(compose) == ["collector carries API_LIMIT_MAX_REQUESTS"]
