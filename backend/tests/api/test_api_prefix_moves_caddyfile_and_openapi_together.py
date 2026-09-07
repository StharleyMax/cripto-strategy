"""`API_PREFIX` moves `openapi.json`'s paths AND `deploy/Caddyfile`'s routed prefix TOGETHER.

`T-02.7`'s literal DoD (plano `02`, item 2.9 / `D2.7`, arquivo
`docs/plans/SPEC-003-camada-de-leitura-do-painel/02_api_alcancavel_e_honesta.md`): "teste:
API_PREFIX=/x => openapi.json paths /x/* E Caddyfile renderizado roteia /x/* (um mudar sem o
outro => duas constantes)". `test_api_prefix.py` only proves the
`openapi.json` half; nothing in this tree renders `deploy/Caddyfile` through `caddy adapt` and
compares it against `_api_prefix_from_environment`'s value. This file is that missing half.

`caddy adapt` is run through `docker run --rm caddy:2-alpine` (same idiom `SPEC-003`'s DoD
names, and the same image `deploy/compose.yml`'s `caddy` service pins) — never a locally
installed `caddy` binary, matching `deploy/Caddyfile`'s own header ("NEVER deployed from
here"). Skipped, not failed, when `docker` is absent from `PATH`: an environment without a
container runtime cannot render Caddy's config at all, and CALA on a missing tool is not the
same claim as CALA on a correct one.

The last test is the mutation control this file exists to justify: a Caddyfile that ignores
`API_PREFIX` (hardcodes `/api/v1`) is fed through the exact same comparison, and the assertion
is required to FAIL against it — proving the comparison actually discriminates "moved
together" from "moved alone", rather than passing vacuously.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from src.main import _api_prefix_from_environment

pytestmark = pytest.mark.skipif(
    shutil.which("docker") is None,
    reason="no docker on PATH: cannot render deploy/Caddyfile through caddy adapt",
)

_CADDYFILE = Path(__file__).resolve().parents[3] / "deploy" / "Caddyfile"
_CADDY_IMAGE = "caddy:2-alpine"


def _caddy_routed_prefix(caddyfile_text: str, *, api_prefix_env: str | None) -> str:
    """Render `caddyfile_text` via `caddy adapt` (dockerized) and return the API route's path.

    Returns the routed prefix without its trailing `/*` (e.g. `/api/v1`), read from the ONE
    route whose upstream is `api:{APP_PORT}` — the other route (`web:3000`) is unconditional
    and carries no `path` matcher at all, so there is no ambiguity about which route this is.
    """
    env_args = [] if api_prefix_env is None else ["-e", f"API_PREFIX={api_prefix_env}"]
    result = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "-i",
            *env_args,
            _CADDY_IMAGE,
            "caddy",
            "adapt",
            "--adapter",
            "caddyfile",
            "--config",
            "-",
        ],
        input=caddyfile_text,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, f"caddy adapt failed: {result.stderr}"
    config = json.loads(result.stdout)
    routes = config["apps"]["http"]["servers"]["srv0"]["routes"][0]["handle"][0]["routes"]

    def _upstreams(node: object) -> list[str]:
        """Walk `node` (arbitrarily nested `subroute`s) collecting every `reverse_proxy` dial."""
        found: list[str] = []
        if isinstance(node, dict):
            if node.get("handler") == "reverse_proxy":
                found.extend(u["dial"] for u in node.get("upstreams", []))
            for value in node.values():
                found.extend(_upstreams(value))
        elif isinstance(node, list):
            for item in node:
                found.extend(_upstreams(item))
        return found

    api_route = next(route for route in routes if any("api:" in u for u in _upstreams(route)))
    (path_match,) = api_route["match"][0]["path"]
    assert isinstance(path_match, str)
    assert path_match.endswith("/*")
    return path_match[: -len("/*")]


def test_default_prefix_agrees_between_caddyfile_and_openapi() -> None:
    """Absent `API_PREFIX`, both sides land on the SAME default — `/api/v1`."""
    openapi_prefix = _api_prefix_from_environment()
    caddy_prefix = _caddy_routed_prefix(_CADDYFILE.read_text(), api_prefix_env=None)

    assert openapi_prefix == "/api/v1"
    assert caddy_prefix == openapi_prefix


def test_api_prefix_moves_caddyfile_and_openapi_together(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`API_PREFIX=/x` moves the Caddyfile's routed path AND `openapi.json`'s paths together.

    `test_api_prefix.py::test_api_prefix_env_var_moves_every_openapi_path` already proves the
    `openapi.json` half through `_api_prefix_from_environment`; this test re-derives that same
    half here (so a single assertion below compares the two) and adds the Caddyfile half no
    other test in this tree exercises.
    """
    monkeypatch.setenv("API_PREFIX", "/x")
    openapi_prefix = _api_prefix_from_environment()

    caddy_prefix = _caddy_routed_prefix(_CADDYFILE.read_text(), api_prefix_env="/x")

    assert openapi_prefix == "/x"
    assert caddy_prefix == "/x"
    assert caddy_prefix == openapi_prefix


def test_a_caddyfile_that_ignores_api_prefix_is_caught_as_a_divergence() -> None:
    """Mutation control: hardcode `/api/v1` in the Caddyfile, ignoring `API_PREFIX` entirely.

    This is the exact failure mode `T-02.7`'s DoD names in parentheses: "um mudar sem o outro
    => duas constantes". It never touches `deploy/Caddyfile` on disk — the mutant lives only as
    a string in this test — and it must make the SAME comparison the two tests above make
    FAIL, or those two tests are vacuous (comparing a number with itself, `ADR-005/D6`'s
    falsifier, restated for this DoD).
    """
    mutated_caddyfile = """
    {$PUBLIC_HOST:localhost} {
        handle /api/v1/* {
            reverse_proxy api:{$APP_PORT:8000}
        }
        handle {
            reverse_proxy web:3000
        }
    }
    """

    openapi_prefix_with_x = "/x"  # what `_api_prefix_from_environment` returns under API_PREFIX=/x
    caddy_prefix = _caddy_routed_prefix(mutated_caddyfile, api_prefix_env="/x")

    assert caddy_prefix == "/api/v1"  # ignored API_PREFIX, stayed on the hardcoded default
    assert caddy_prefix != openapi_prefix_with_x
