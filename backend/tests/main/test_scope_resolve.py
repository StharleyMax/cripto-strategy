"""`scripts/scope-resolve.sh` (`T-06.2`): the diff decides what `make verify-scope` runs.

The resolver is the only thing standing between a builder's diff and the e2e specs that diff can
break; `verify.sh --scope` trusts its `e2e=`/`pytest=` lines blindly. Until this file it had no
automated test: every falsifier of `gates/T-06.2-build.md` §1 was run by hand, once.

These tests run the REAL `scope-resolve.sh` and `scope-graph.mjs`, copied into a throwaway git
repository whose `frontend/` is a miniature of the real one (two routes, a root layout, a lazy
import, an e2e helper, a map with two refining rows). A miniature, and not the real tree, because
each check needs a diff it controls and a map whose rows it knows — and because the real map moves
with every wave.

WHAT EACH CHECK ANSWERS (the rule in the script header: "a path no rule recognizes widens the
selection to COMPLETE; it never narrows it"):

* an unknown path widens BOTH sides (e2e and pytest) — the hole `T-06.2-build.md` §3 closed;
* a new Next entry, a root-layout dependency and a deleted e2e helper widen e2e to COMPLETE;
* a refining row narrows a `/symbol`-only file to its specs plus `e2e/11`; a lazy `import()` is
  an edge; a file no page imports runs only `e2e/11`;
* `E2E_EXTRA` naming no spec, a map citing a deleted spec and a rotten prefix REFUSE (rc=3), and
  so do a malformed token and an inverted range in a row (`gates/W8-CODE-REVIEW.md`, M-3);
* a diff that EDITS THE MAP cannot use the edit to drop, from its own selection, a spec the
  base map selected for the same source change (`gates/W8-QA-INFRA.md`, finding F-1);
* a `.md` under `frontend/public` is SERVED, so it widens e2e like any front file without a row,
  while a `.md` anywhere else stays "only `e2e/11`" (`gates/W8-QA-INFRA.md`, warning W-2).
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Final

import pytest

_REPO: Final = Path(__file__).resolve().parents[3]
_RESOLVE: Final = _REPO / "scripts/scope-resolve.sh"
_GRAPH: Final = _REPO / "scripts/scope-graph.mjs"

_MAP: Final = (
    "@rota:console\t01\tfixture\n"
    "@rota:symbol\t08+\tfixture\n"
    "src/app/symbol/liquidation-\t12 13\tfixture\n"
    "src/app/symbol/oi-\t10\tfixture\n"
)

_FILES: Final = {
    "frontend/src/app/layout.tsx": (
        'import "./globals.css";\nexport default function L() { return null; }\n'
    ),
    "frontend/src/app/globals.css": "body {}\n",
    "frontend/src/app/console/page.tsx": (
        'import { c } from "../../features/console-thing";\nexport default c;\n'
    ),
    "frontend/src/features/console-thing.ts": "export const c = 1;\n",
    "frontend/src/app/symbol/page.tsx": 'import { s } from "./SymbolClient";\nexport default s;\n',
    "frontend/src/app/symbol/SymbolClient.tsx": (
        'import { l } from "./liquidation-swatch";\n'
        'import { o } from "./oi-pane";\n'
        'export const s = () => [l, o, import("./lazy-thing")];\n'
    ),
    "frontend/src/app/symbol/liquidation-swatch.ts": "export const l = 1;\n",
    "frontend/src/app/symbol/oi-pane.ts": "export const o = 1;\n",
    "frontend/src/app/symbol/lazy-thing.ts": "export const z = 1;\n",
    "frontend/e2e/helpers.ts": "export const h = 1;\n",
    "frontend/e2e/01-console.spec.ts": "//\n",
    "frontend/e2e/08-symbol.spec.ts": "//\n",
    "frontend/e2e/09-volume.spec.ts": "//\n",
    "frontend/e2e/10-oi.spec.ts": "//\n",
    "frontend/e2e/11-canvas-fundo.spec.ts": "//\n",
    "frontend/e2e/12-liquidation-legend.spec.ts": 'import { h } from "./helpers";\n',
    "frontend/e2e/13-liquidation-pixel.spec.ts": "//\n",
    "frontend/e2e/scope-map.tsv": _MAP,
    "docs/note.md": "# note\n",
}

_ENV: Final = {
    "GIT_AUTHOR_NAME": "qa",
    "GIT_AUTHOR_EMAIL": "qa@example.invalid",
    "GIT_COMMITTER_NAME": "qa",
    "GIT_COMMITTER_EMAIL": "qa@example.invalid",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_NOSYSTEM": "1",
}

_SYMBOL_ROUTE: Final = {"08", "09", "10", "11", "12", "13"}


def _git(repo: Path, *args: str) -> None:
    env = {**os.environ, **_ENV}
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, env=env)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Build a committed miniature of `frontend/` plus the two real scope scripts."""
    if shutil.which("node") is None:
        pytest.fail("node is not on PATH: scope-graph.mjs cannot run (a skipped test is no test)")
    for rel, text in _FILES.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    (tmp_path / "scripts").mkdir()
    shutil.copy(_RESOLVE, tmp_path / "scripts/scope-resolve.sh")
    shutil.copy(_GRAPH, tmp_path / "scripts/scope-graph.mjs")
    _git(tmp_path, "init", "-q", "-b", "main")
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-q", "-m", "base")
    return tmp_path


def _resolve(repo: Path, **env: str) -> tuple[int, dict[str, str]]:
    result = subprocess.run(
        ["bash", "scripts/scope-resolve.sh"],
        cwd=repo,
        capture_output=True,
        text=True,
        env={**os.environ, **_ENV, "VERIFY_BASE": "HEAD", **env},
        check=False,
    )
    keys = {}
    for line in result.stdout.splitlines():
        if "=" in line and not line.startswith("#"):
            key, _, value = line.partition("=")
            keys[key] = value
    return result.returncode, keys


def _specs(keys: dict[str, str]) -> set[str]:
    return {Path(spec).name[:2] for spec in keys["e2e_specs"].split()}


def _append(repo: Path, rel: str, text: str = "// changed\n") -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(text)


def test_empty_diff_runs_only_the_pixel_spec(repo: Path) -> None:
    """No change: `e2e/11` always, nothing else, and no pytest."""
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "ESCOPO"
    assert _specs(keys) == {"11"}
    assert keys["pytest"] == "PULADO"


def test_unknown_path_widens_e2e_and_pytest(repo: Path) -> None:
    """Fail-closed on BOTH sides: a path no rule knows cannot shrink either selection."""
    _append(repo, "tools/x.sh", "echo\n")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "COMPLETO"
    assert keys["pytest"] == "COMPLETO"
    assert "tools/x.sh" in keys["e2e_reason"]


def test_new_next_entry_widens_e2e(repo: Path) -> None:
    """A new `page.tsx` outside the two known routes is a root: every spec."""
    _append(repo, "frontend/src/app/other/page.tsx", "export default () => null;\n")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "COMPLETO"


def test_root_layout_dependency_widens_e2e(repo: Path) -> None:
    """What `app/layout.tsx` imports is painted on every route."""
    _append(repo, "frontend/src/app/globals.css", "a {}\n")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "COMPLETO"


def test_deleted_e2e_helper_widens_e2e(repo: Path) -> None:
    """A deleted helper's importers are no longer visible: every spec."""
    _git(repo, "rm", "-q", "frontend/e2e/helpers.ts")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "COMPLETO"


def test_changed_e2e_helper_runs_its_importers(repo: Path) -> None:
    """A changed helper runs the specs that import it."""
    _append(repo, "frontend/e2e/helpers.ts")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert _specs(keys) == {"11", "12"}


def test_map_row_narrows_a_symbol_only_file(repo: Path) -> None:
    """A `/symbol`-only file with a row runs that row plus `e2e/11`, and a front diff no pytest."""
    _append(repo, "frontend/src/app/symbol/liquidation-swatch.ts")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "ESCOPO"
    assert _specs(keys) == {"11", "12", "13"}
    assert keys["pytest"] == "PULADO"


def test_lazy_import_is_an_edge(repo: Path) -> None:
    """`import("./x")` reaches the page; without a row the whole `/symbol` route runs."""
    _append(repo, "frontend/src/app/symbol/lazy-thing.ts")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert _specs(keys) == _SYMBOL_ROUTE


def test_console_reachable_file_runs_the_console_route(repo: Path) -> None:
    """A file reached only by the console page runs `@rota:console`."""
    _append(repo, "frontend/src/features/console-thing.ts")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert _specs(keys) == {"01", "11"}


def test_unimported_file_runs_only_the_pixel_spec(repo: Path) -> None:
    """A file no page imports cannot change what is painted."""
    _append(repo, "frontend/src/app/symbol/orphan.ts", "export const q = 1;\n")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert _specs(keys) == {"11"}


def test_new_spec_in_the_diff_is_selected(repo: Path) -> None:
    """A spec the diff adds runs, with or without a map line."""
    _append(repo, "frontend/e2e/14-new.spec.ts")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert "14" in _specs(keys)


def test_e2e_extra_naming_no_spec_refuses(repo: Path) -> None:
    """A typo in `E2E_EXTRA` must not become "no spec"."""
    rc, _ = _resolve(repo, E2E_EXTRA="99")
    assert rc == 3


def test_e2e_extra_only_adds(repo: Path) -> None:
    """`E2E_EXTRA` adds to the union and never replaces `e2e/11`."""
    rc, keys = _resolve(repo, E2E_EXTRA="13")
    assert rc == 0
    assert _specs(keys) == {"11", "13"}


def test_map_citing_a_deleted_spec_refuses(repo: Path) -> None:
    """A rotten map refuses instead of silently shrinking the selection."""
    _git(repo, "rm", "-q", "frontend/e2e/13-liquidation-pixel.spec.ts")
    rc, _ = _resolve(repo)
    assert rc == 3


def test_map_prefix_matching_no_file_refuses(repo: Path) -> None:
    """A row whose prefix matches no tracked file is rotten: refuse."""
    _append(repo, "frontend/e2e/scope-map.tsv", "src/app/symbol/gone-\t13\tfixture\n")
    rc, _ = _resolve(repo)
    assert rc == 3


def test_editing_the_map_cannot_drop_a_spec_from_its_own_diff(repo: Path) -> None:
    """F-1: the map edit in a diff must not narrow the selection of that same diff.

    The map is the scope's DATA: a diff that narrows a row and changes a file of that row in the
    same commit must still run what the BASE map selected — otherwise the task that breaks
    `e2e/12` removes `12` from the row and its own `make verify-scope` answers VERDE-ESCOPO.
    `scope-resolve.sh` and `scope-graph.mjs` already widen to COMPLETE when they change; the map,
    which decides as much as they do, answers "só 11".
    """
    map_path = repo / "frontend/e2e/scope-map.tsv"
    map_path.write_text(_MAP.replace("\t12 13\t", "\t13\t"), encoding="utf-8")
    _append(repo, "frontend/src/app/symbol/liquidation-swatch.ts")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "COMPLETO" or "12" in _specs(keys), (
        f"the map edit dropped e2e/12 from its own diff's selection: {sorted(_specs(keys))}"
    )


def test_editing_a_route_row_cannot_drop_its_spec_from_its_own_diff(repo: Path) -> None:
    """F-1, the route rows: the map edit may narrow `@rota:console`, not only a prefix row.

    A diff that rewrites `@rota:console` from `01` to `13` and touches a console-only file must
    still run `e2e/01`, which the BASE map selected. A "fix" that re-reads only the symbol route's
    rows on a map edit keeps `12` (under `08+`), passes the prefix-row test above, yet drops `01`.
    """
    narrowed = _MAP.replace("@rota:console\t01\t", "@rota:console\t13\t")
    (repo / "frontend/e2e/scope-map.tsv").write_text(narrowed, encoding="utf-8")
    _append(repo, "frontend/src/features/console-thing.ts")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "COMPLETO" or "01" in _specs(keys), (
        f"the map edit dropped e2e/01 from its own diff's selection: {sorted(_specs(keys))}"
    )


def test_served_markdown_widens_e2e(repo: Path) -> None:
    """W-2: Next serves `frontend/public/*.md`: not documentation, so never "only 11"."""
    _append(repo, "frontend/public/notes.md", "# served\n")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "COMPLETO"
    assert "frontend/public/notes.md" in keys["e2e_reason"]


def test_documentation_markdown_runs_only_the_pixel_spec(repo: Path) -> None:
    """The contrast of W-2: a `.md` outside `frontend/public` is never compiled nor served."""
    _append(repo, "docs/note.md", "more\n")
    rc, keys = _resolve(repo)
    assert rc == 0
    assert keys["e2e"] == "ESCOPO"
    assert _specs(keys) == {"11"}


@pytest.mark.parametrize("token", ["ab+", "8-9", "13-12", "14+", "99+", "10 99+ 12"])
def test_map_token_expand_cannot_read_refuses(repo: Path, token: str) -> None:
    """M-3 / N-2: an unreadable token, an inverted range or a base past the last spec vanished.

    `expand` prints nothing for an `NN+` whose `NN` is past the last spec: `'13 99+ 29'` became
    `13 29`, and the row lost its open range in silence.
    """
    map_path = repo / "frontend/e2e/scope-map.tsv"
    map_path.write_text(_MAP.replace("\t10\t", f"\t{token}\t"), encoding="utf-8")
    rc, _ = _resolve(repo)
    assert rc == 3


def test_map_open_range_from_the_last_spec_is_accepted(repo: Path) -> None:
    """The N-2 refusal stops at the boundary: `13+` with `13` the last spec is exactly `13`."""
    map_path = repo / "frontend/e2e/scope-map.tsv"
    map_path.write_text(_MAP.replace("\t10\t", "\t13+\t"), encoding="utf-8")
    rc, _ = _resolve(repo)
    assert rc == 0
