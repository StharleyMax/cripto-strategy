"""A durabilidade OBSERVADA: `os.fsync` acontece, e acontece na ordem que a torna util.

Por que este arquivo existe separado do teste de `D3.1`: sem ele, apagar `flush()`+`os.fsync()`
dos DOIS modulos de `infra` deixava a suite VERDE em `12 passed` com cobertura **100%**
`[MEDIDO 2026-08-28]`. Quatro statements totalmente cobertos e nenhuma assercao sobre o que eles
fazem — cobertura media execucao, nao comportamento.

A tecnica: espiar `os.fsync` por `monkeypatch` e conferir, **no instante da chamada**, (a) que o
conteudo JA esta no arquivo — o que mata a remocao do `flush` — e (b) que o `rename` ainda NAO
ocorreu — o que mata a inversao da ordem.

FRONTEIRA DO QUE ISTO MEDE: que o `fsync` e chamado com o dado ja flushado, antes da publicacao.
Que o `fsync` de fato leve o bloco ao disco e sobreviva a QUEDA DE ENERGIA e `[NAO MEDIDO]` —
nenhum teste desta suite corta energia nem derruba o kernel. Ver `infra/jsonl_checkpoint.py`.
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
    """`flush` ANTES, `fsync` DEPOIS. Falsificador: apague os dois de `record` e isto REPROVA."""
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
    """Ordem: escreve -> `flush` -> `fsync` -> `os.replace`. Publicar antes do `fsync` REPROVA."""
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
