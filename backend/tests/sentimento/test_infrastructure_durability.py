"""Durability OBSERVED: `os.fsync` happens, and it happens in the order that makes it useful.

Why this file exists apart from the `D3.1` test: without it, deleting `flush()`+`os.fsync()`
from BOTH `infra` modules left the suite GREEN at `12 passed` with **100%** coverage
`[MEDIDO 2026-08-28]`. Four fully covered statements and not one assertion about what they do —
coverage measures execution, not behavior.

The technique: spy on `os.fsync` via `monkeypatch` and check, **at the moment of the call**, (a)
that the content is ALREADY in the file — which kills the removal of the `flush` — and (b) that
the `rename` has NOT happened yet — which kills the inversion of the order.

THE BOUNDARY OF WHAT THIS MEASURES: that `fsync` is called with the data already flushed, before
publication. That the `fsync` actually carries the block to the disk and survives POWER LOSS is
`[NAO MEDIDO]` — no test in this suite cuts power or brings the kernel down. See
`infra/jsonl_checkpoint.py`.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from src.modules.sentimento.infra.file_etl_worker import (
    OUTPUT_SUFFIX,
    PARTIAL_SUFFIX,
    FileEtlWorker,
)
from src.modules.sentimento.infra.jsonl_checkpoint import JsonlCheckpoint


def test_checkpoint_fsyncs_and_the_line_is_already_in_the_file_when_it_happens(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`flush` BEFORE, `fsync` AFTER. Falsifier: delete both from `record` and this FAILS."""
    ledger = tmp_path / "checkpoint.jsonl"
    calls: list[int] = []
    seen: list[bytes] = []
    original = os.fsync

    def spy(fd: int) -> None:
        calls.append(fd)
        seen.append(ledger.read_bytes())
        original(fd)

    monkeypatch.setattr(os, "fsync", spy)
    JsonlCheckpoint(ledger).record("a.csv")

    assert len(calls) == 1, "record() tem de chamar os.fsync UMA vez por linha"
    assert seen == [b'{"key": "a.csv"}\n'], "o flush tem de preceder o fsync"


def test_worker_fsyncs_the_partial_before_the_atomic_rename(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Order: write -> `flush` -> `fsync` -> `os.replace`. Publishing before the `fsync` FAILS."""
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    source_dir.mkdir()
    (source_dir / "k.csv").write_bytes(b"conteudo")
    partial = output_dir / f"k.csv{OUTPUT_SUFFIX}{PARTIAL_SUFFIX}"
    destination = output_dir / f"k.csv{OUTPUT_SUFFIX}"
    seen: list[tuple[bytes, bool]] = []
    original = os.fsync

    def spy(fd: int) -> None:
        seen.append((partial.read_bytes(), destination.exists()))
        original(fd)

    monkeypatch.setattr(os, "fsync", spy)
    FileEtlWorker(source_dir, output_dir, lambda payload: payload.upper()).process("k.csv")

    assert seen == [(b"CONTEUDO", False)], "fsync do parcial JA flushado e ANTES do rename"
    assert destination.read_bytes() == b"CONTEUDO", "e o rename publica o que foi sincronizado"
