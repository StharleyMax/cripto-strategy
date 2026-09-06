"""`create_app` refuses to build when `store_path`'s parent directory is absent.

`ADR-029/D3`: misconfiguration must never present as "zero runs" — before this task, pointing
the process at a store whose parent nobody created still booted and served
`200 {"n_runs": 0, ...}` (`[MEDIDO: FB-infra §2]`, `T-02.1`'s `refs`). Two falsifiers:

- `test_create_app_raises_when_the_store_parent_directory_does_not_exist` — CALA/MORDE at the
  Python level: `create_app` itself, no process boundary.
- `test_running_the_process_exits_non_zero_and_names_the_path_when_the_parent_is_missing` —
  the DoD's literal command, `python -m src.main` with `INGEST_HEALTH_STORE_PATH` pointed at a
  path whose parent is absent: `rc != 0`, stderr names the path. This is the check at the
  COMPOSITION ROOT, not inside the store (`SPEC-003` §3.4, plan `02` item 2.1) — the module
  level `app = create_app(...)` in `src.main` means the raise happens at IMPORT time, before
  `uvicorn` ever binds a socket.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from src.main import StoreParentDirectoryMissingError, create_app


def test_create_app_raises_when_the_store_parent_directory_does_not_exist(
    tmp_path: Path,
) -> None:
    """CALA/MORDE at the Python level, no subprocess: the exact failure mode `D3` names."""
    missing_parent_store = tmp_path / "nao-existe" / "ih.sqlite3"

    with pytest.raises(StoreParentDirectoryMissingError) as excinfo:
        create_app(missing_parent_store)

    assert str(missing_parent_store.parent) in str(excinfo.value)


def test_create_app_accepts_a_store_whose_parent_exists_even_if_the_file_is_absent(
    tmp_path: Path,
) -> None:
    """Control: an existing parent with an absent LEAF file is untouched (`ADR-005/D6.1`).

    This is the negative control the phase's falsifier demands (plan `02`, "Falsificador da
    fase") — without it, a `create_app` that refused on ANY absent path (parent or leaf) would
    also pass the test above while breaking the `200 {"n_runs": 0}` contract this task must
    NOT touch.
    """
    store_with_absent_file = tmp_path / "ih.sqlite3"

    create_app(store_with_absent_file)  # must not raise


def test_running_the_process_exits_non_zero_and_names_the_path_when_the_parent_is_missing(
    tmp_path: Path,
) -> None:
    """The DoD's literal command: `python -m src.main` with a store whose parent is absent.

    Runs the REAL interpreter of this venv (`sys.executable`, inside `.venv` when the gate
    calls it) against the REAL module, from `backend/` as `cwd` so `src` resolves — the same
    shape `test.sh`/`lint.sh` already assume. The module-level `app = create_app(...)` raises
    during `from src.main import app` inside `__main__.py`, so the process never reaches
    `uvicorn.run` and exits with Python's default non-zero code for an uncaught exception.
    """
    missing_parent_store = tmp_path / "nao-existe" / "ih.sqlite3"
    backend_root = Path(__file__).resolve().parents[2]

    result = subprocess.run(
        [sys.executable, "-m", "src.main"],
        cwd=backend_root,
        env={**os.environ, "INGEST_HEALTH_STORE_PATH": str(missing_parent_store)},
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert result.returncode != 0
    assert str(missing_parent_store.parent) in result.stderr
