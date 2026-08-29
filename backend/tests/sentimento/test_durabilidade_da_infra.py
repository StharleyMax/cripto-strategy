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


def test_checkpoint_faz_fsync_e_a_linha_ja_esta_no_arquivo_quando_ele_ocorre(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`flush` BEFORE, `fsync` AFTER. Falsifier: delete both from `record` and this FAILS."""
    ledger = tmp_path / "checkpoint.jsonl"
    chamadas: list[int] = []
    visto: list[bytes] = []
    original = os.fsync

    def espia(fd: int) -> None:
        chamadas.append(fd)
        visto.append(ledger.read_bytes())
        original(fd)

    monkeypatch.setattr(os, "fsync", espia)
    JsonlCheckpoint(ledger).record("a.csv")

    assert len(chamadas) == 1, "record() tem de chamar os.fsync UMA vez por linha"
    assert visto == [b'{"key": "a.csv"}\n'], "o flush tem de preceder o fsync"


def test_worker_faz_fsync_no_parcial_antes_do_rename_atomico(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Order: write -> `flush` -> `fsync` -> `os.replace`. Publishing before the `fsync` FAILS."""
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    source_dir.mkdir()
    (source_dir / "k.csv").write_bytes(b"conteudo")
    parcial = output_dir / f"k.csv{OUTPUT_SUFFIX}{PARTIAL_SUFFIX}"
    destino = output_dir / f"k.csv{OUTPUT_SUFFIX}"
    visto: list[tuple[bytes, bool]] = []
    original = os.fsync

    def espia(fd: int) -> None:
        visto.append((parcial.read_bytes(), destino.exists()))
        original(fd)

    monkeypatch.setattr(os, "fsync", espia)
    FileEtlWorker(source_dir, output_dir, lambda payload: payload.upper()).process("k.csv")

    assert visto == [(b"CONTEUDO", False)], "fsync do parcial JA flushado e ANTES do rename"
    assert destino.read_bytes() == b"CONTEUDO", "e o rename publica o que foi sincronizado"
