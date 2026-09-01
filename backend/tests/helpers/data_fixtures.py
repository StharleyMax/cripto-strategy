"""Locate the on-disk `data/` root: catalogued in `data/MANIFEST.md`, never versioned by git.

`CLAUDE.md`, "Dado bruto não é versionado": `data/` (~850 MB) is gitignored, so a `git
worktree` does NOT get its own copy — only the one checkout that actually holds the ~850 MB
does. Hardcoding that checkout's absolute path would break on any other machine; walking up
from `__file__` would break the day this file moves. `git rev-parse --git-common-dir` names
the ONE `.git` every worktree of this repository shares, which is what makes a fixture test
portable across worktrees on the same clone instead of guessing.
"""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path


def repo_data_root() -> Path:
    """Return `<main working tree>/data`, regardless of which worktree this process runs from."""
    common_dir = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        capture_output=True,
        check=True,
        text=True,
    ).stdout.strip()
    return Path(common_dir).parent / "data"


def require_fixture(relative_path: str, *, expected_md5: str) -> Path:
    """Return the absolute path of a cataloged fixture, pinned by the `md5` the plan declares.

    FAILS LOUDLY rather than skipping: `backend/scripts/test.sh` declares "ZERO REDE" and every
    fixture this task's DoD depends on is checked out already (`data/MANIFEST.md`) — a silent
    skip would let the exact rows `D4.1`/`D4.2`/`D4.3`/`D4.10` measure go unexercised on a host
    that has the fixture, and pass for the wrong reason on a host that renamed it.
    """
    path = repo_data_root() / relative_path
    if not path.is_file():
        raise FileNotFoundError(
            f"fixture ausente: {path}. Catalogada em data/MANIFEST.md — este pacote de testes "
            f"exige o dado real, não uma versão sintética."
        )
    digest = hashlib.md5(path.read_bytes()).hexdigest()  # noqa: S324 — fixture identity, not crypto
    if digest != expected_md5:
        raise ValueError(
            f"{path}: md5 {digest} não bate com o declarado pelo plano ({expected_md5}) — "
            f"a fixture mudou de conteúdo sem que o número que a cita fosse revisto."
        )
    return path
