"""`create_app` refuses to build when the QUARANTINE store's parent directory is absent.

`T-03.4`, `SPEC-003` s3.5, "mesma regra de boot" as `ADR-029/D3` already gives the ingest
store (`T-02.1`): a `QUARANTINE_STORE_PATH` whose parent nobody prepared must not boot and
silently serve `200 {"n_rows": 0, ...}` on `GET /series-quarantine` — it must refuse at `rc !=
0`, before `uvicorn` ever binds a socket. Three falsifiers, same shape as
`test_create_app_refuses_missing_store_parent.py`:

- `test_create_app_raises_when_the_quarantine_store_parent_directory_does_not_exist` —
  CALA/MORDE at the Python level, isolating the QUARANTINE check from the ingest one by
  pointing `store_path` at a store whose parent DOES exist.
- `test_create_app_accepts_a_quarantine_store_whose_parent_exists_even_if_the_file_is_absent`
  — the negative control: an existing parent with an absent LEAF file must NOT raise.
- `test_running_the_process_exits_non_zero_and_names_the_quarantine_path_when_missing`
  — the DoD's literal command, `QUARANTINE_STORE_PATH=<x>/nao-existe/q.sqlite3 python -m
  src.main`, with `INGEST_HEALTH_STORE_PATH` ALSO pointed at a valid parent so the failure
  this test proves is unambiguously the quarantine check, not the ingest one running first.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from src.main import StoreParentDirectoryMissingError, create_app


def test_create_app_raises_when_the_quarantine_store_parent_directory_does_not_exist(
    tmp_path: Path,
) -> None:
    """CALA/MORDE at the Python level: `store_path`'s parent is fine, only quarantine's is not."""
    good_ingest_store = tmp_path / "ih.sqlite3"
    missing_parent_quarantine_store = tmp_path / "nao-existe" / "q.sqlite3"

    with pytest.raises(StoreParentDirectoryMissingError) as excinfo:
        create_app(good_ingest_store, quarantine_store_path=missing_parent_quarantine_store)

    assert str(missing_parent_quarantine_store.parent) in str(excinfo.value)


def test_create_app_accepts_a_quarantine_store_whose_parent_exists_even_if_the_file_is_absent(
    tmp_path: Path,
) -> None:
    """Control: an existing parent with an absent LEAF file is untouched (`ADR-005/D6.1`).

    Without this, a `create_app` that refused on ANY absent path (parent or leaf) would also
    pass the test above while breaking `GET /series-quarantine`'s `200 {"n_rows": 0}` contract
    for a quarantine store that simply never ran yet.
    """
    good_ingest_store = tmp_path / "ih.sqlite3"
    quarantine_store_with_absent_file = tmp_path / "q.sqlite3"

    create_app(  # must not raise
        good_ingest_store, quarantine_store_path=quarantine_store_with_absent_file
    )


def test_running_the_process_exits_non_zero_and_names_the_quarantine_path_when_missing(
    tmp_path: Path,
) -> None:
    """The DoD's literal command: `QUARANTINE_STORE_PATH` with an absent parent, `rc != 0`.

    `INGEST_HEALTH_STORE_PATH` is set to a path with a REAL parent here specifically so this
    subprocess's failure is unambiguously about the quarantine check — the ingest store's own
    default (`data/md/...`) has no parent in this checkout either, which would otherwise raise
    first and prove nothing about the code this task adds.
    """
    good_ingest_store = tmp_path / "ih.sqlite3"
    missing_parent_quarantine_store = tmp_path / "nao-existe" / "q.sqlite3"
    backend_root = Path(__file__).resolve().parents[2]

    result = subprocess.run(
        [sys.executable, "-m", "src.main"],
        cwd=backend_root,
        env={
            **os.environ,
            "INGEST_HEALTH_STORE_PATH": str(good_ingest_store),
            "QUARANTINE_STORE_PATH": str(missing_parent_quarantine_store),
        },
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert result.returncode != 0
    assert str(missing_parent_quarantine_store.parent) in result.stderr
