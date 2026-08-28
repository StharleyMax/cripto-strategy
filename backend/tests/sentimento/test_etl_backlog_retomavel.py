"""`CA-F0-5` / `D3.1`: matar o processo no meio e retomar — nao duplica e nao perde."""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from src.modules.sentimento.domain.etl_backlog import (
    CheckpointOutsideWindowError,
    EtlBacklog,
    InvalidBacklogError,
)
from src.modules.sentimento.infra.file_etl_worker import (
    OUTPUT_SUFFIX,
    PARTIAL_SUFFIX,
    FileEtlWorker,
)
from src.modules.sentimento.infra.jsonl_checkpoint import CorruptedCheckpointError, JsonlCheckpoint
from src.modules.sentimento.use_cases.drain_etl_backlog import drain

# `D3.1` declara o universo: >= 100 arquivos. 120 e o menor multiplo redondo acima do piso.
UNIVERSO = 120
BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "drain_driver.py"


def _transform(payload: bytes) -> bytes:
    return hashlib.sha256(payload).hexdigest().encode("ascii")


def _semear(source_dir: Path, quantos: int = UNIVERSO) -> tuple[str, ...]:
    source_dir.mkdir(parents=True, exist_ok=True)
    keys = tuple(f"dump-{n:04d}.csv" for n in range(quantos))
    for n, key in enumerate(keys):
        (source_dir / key).write_bytes(f"linha,{n}\n".encode("ascii"))
    return keys


def _conferir_saida_integra(source_dir: Path, output_dir: Path, keys: tuple[str, ...]) -> None:
    publicados = sorted(p.name for p in output_dir.glob(f"*{OUTPUT_SUFFIX}"))
    assert publicados == sorted(f"{k}{OUTPUT_SUFFIX}" for k in keys)
    # `glob("*.out")` NAO casa `k.csv.out.partial` — sem a linha abaixo este helper era CEGO a
    # residuo de escrita interrompida, que e exatamente o que o `SIGKILL` do `D3.1` pode deixar.
    residuos = sorted(p.name for p in output_dir.glob(f"*{PARTIAL_SUFFIX}"))
    assert residuos == [], f"parcial sobreviveu a publicacao: {residuos}"
    for key in keys:
        esperado = _transform((source_dir / key).read_bytes())
        assert (output_dir / f"{key}{OUTPUT_SUFFIX}").read_bytes() == esperado


class ContadorDeTrabalho:
    """Envolve um worker e conta QUANTAS vezes cada chave foi realmente processada."""

    def __init__(self, alvo: FileEtlWorker) -> None:
        self._alvo = alvo
        self.chamadas: list[str] = []

    def process(self, key: str) -> None:
        self.chamadas.append(key)
        self._alvo.process(key)


class CheckpointVolatil:
    """Checkpoint em MEMORIA — o contra-exemplo, nao um substituto."""

    def __init__(self) -> None:
        self._done: set[str] = set()

    def done(self) -> frozenset[str]:
        return frozenset(self._done)

    def record(self, key: str) -> None:
        self._done.add(key)


def test_janela_declarada_recusa_chave_repetida() -> None:
    with pytest.raises(InvalidBacklogError):
        EtlBacklog.of(["a.csv", "b.csv", "a.csv"])


def test_janela_declarada_recusa_chave_vazia() -> None:
    with pytest.raises(InvalidBacklogError):
        EtlBacklog.of(["a.csv", ""])


def test_pendente_preserva_a_ordem_declarada() -> None:
    backlog = EtlBacklog.of(["c", "a", "b"])
    assert backlog.pending(done=["a"]) == ("c", "b")
    assert len(backlog) == 3


def test_checkpoint_fora_da_janela_e_erro_e_nao_ruido() -> None:
    backlog = EtlBacklog.of(["a", "b"])
    with pytest.raises(CheckpointOutsideWindowError):
        backlog.pending(done=["a", "z"])


def test_drenagem_completa_processa_cada_arquivo_uma_unica_vez(tmp_path: Path) -> None:
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _semear(source_dir)
    checkpoint = JsonlCheckpoint(tmp_path / "checkpoint.jsonl")
    contador = ContadorDeTrabalho(FileEtlWorker(source_dir, output_dir, _transform))

    processados = drain(EtlBacklog.of(keys), contador, checkpoint)

    assert len(processados) == UNIVERSO
    assert contador.chamadas == list(keys)
    assert checkpoint.entries() == keys
    _conferir_saida_integra(source_dir, output_dir, keys)


def test_segunda_drenagem_sem_falha_nao_refaz_nada(tmp_path: Path) -> None:
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _semear(source_dir, quantos=10)
    checkpoint = JsonlCheckpoint(tmp_path / "checkpoint.jsonl")
    worker = FileEtlWorker(source_dir, output_dir, _transform)
    drain(EtlBacklog.of(keys), worker, checkpoint)

    contador = ContadorDeTrabalho(worker)
    assert drain(EtlBacklog.of(keys), contador, checkpoint) == ()
    assert contador.chamadas == []


def test_matar_o_processo_no_meio_e_retomar_nao_duplica_nem_perde(tmp_path: Path) -> None:
    """`D3.1`, com SIGKILL de verdade: 120 arquivos, morte no meio, retomada em processo.

    DOIS CAVEATS REGISTRADOS, porque um teste que passa sem eles escritos vira defeito
    redescoberto. Nenhum dos dois e consertado nesta task — pertencem a fase `03` (`T-03.10`).

    1. A JANELA DE RISCO REAL DE "NAO DUPLICA" NAO E GARANTIDA POR ESTE TESTE. Essa janela e
       "item publicado (`os.replace` ja correu) mas AINDA NAO registrado", e ela so existe
       entre `worker.process` e `checkpoint.record`. Aqui o relogio do driver e dominado pelo
       `time.sleep(0,02 s)` que vive DENTRO de `transform`, isto e, ANTES do `os.replace` —
       logo a morte quase certamente cai fora da janela. E este teste NAO afirma onde a morte
       caiu: nao ha assercao sobre isso em nenhuma das suas linhas. Quem prova de fato que
       reprocessar e inocuo e o teste de idempotencia no fim deste arquivo
       (`test_reprocessar_o_mesmo_item_...`). Hoje "nao duplica" e REIVINDICADA aqui e PROVADA la.
    2. ESCALA: `D3.1` declara custo de **0,86 s/arquivo (n=11)** `[DOC: tasks_review.md:274]`,
       medido sobre dump real. Aqui os arquivos tem **8 a 10 bytes (media 9,08 B, n=120)**
       `[MEDIDO 2026-08-28]` e o custo por item e um `time.sleep` ARTIFICIAL de 0,02 s. A
       INVARIANTE testada (nao duplica / nao perde) e a mesma; a ESCALA nao e, e nada aqui
       mede o custo por arquivo `[NAO MEDIDO]`.
    """
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _semear(source_dir)
    ledger = tmp_path / "checkpoint.jsonl"
    checkpoint = JsonlCheckpoint(ledger)

    ambiente = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    processo = subprocess.Popen(  # noqa: S603 - argv literal, sem shell
        [sys.executable, str(DRIVER), str(source_dir), str(output_dir), str(ledger), "0.02"],
        cwd=str(BACKEND_ROOT),
        env=ambiente,
    )
    try:
        limite = time.monotonic() + 30.0
        while len(checkpoint.entries()) < 25:
            assert processo.poll() is None, "o driver terminou antes de a morte ser possivel"
            assert time.monotonic() < limite, "o driver nao progrediu em 30 s"
            time.sleep(0.01)
        processo.kill()
    finally:
        processo.wait(timeout=30)

    assert processo.returncode != 0, "SIGKILL tem de aparecer no codigo de saida"
    mortos_com = len(checkpoint.entries())
    assert 0 < mortos_com < UNIVERSO, f"morte fora do meio: {mortos_com}/{UNIVERSO}"

    contador = ContadorDeTrabalho(FileEtlWorker(source_dir, output_dir, _transform))
    retomada = drain(EtlBacklog.of(keys), contador, checkpoint)

    # NAO PERDE: a uniao das duas execucoes cobre a janela inteira.
    assert len(retomada) == UNIVERSO - mortos_com
    assert sorted(checkpoint.entries()) == sorted(keys)
    # NAO DUPLICA: o registro nao tem repeticao, e a saida publicada tem exatamente 1 por chave.
    assert len(checkpoint.entries()) == len(set(checkpoint.entries())) == UNIVERSO
    assert set(contador.chamadas).isdisjoint(set(checkpoint.entries()[:mortos_com]))
    _conferir_saida_integra(source_dir, output_dir, keys)


def test_checkpoint_volatil_reprocessa_a_janela_inteira(tmp_path: Path) -> None:
    """O falsificador da durabilidade: troque o `fsync` por memoria e o `D3.1` REPROVA."""
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _semear(source_dir, quantos=10)
    worker = FileEtlWorker(source_dir, output_dir, _transform)

    drain(EtlBacklog.of(keys), worker, CheckpointVolatil())

    contador = ContadorDeTrabalho(worker)
    reinicio = CheckpointVolatil()  # o "restart": a memoria do processo morto nao volta
    drain(EtlBacklog.of(keys), contador, reinicio)

    assert contador.chamadas == list(keys), "sem checkpoint duravel, a retomada refaz TUDO"


def test_cauda_truncada_e_descartada_e_o_resto_sobrevive(tmp_path: Path) -> None:
    ledger = tmp_path / "checkpoint.jsonl"
    checkpoint = JsonlCheckpoint(ledger)
    checkpoint.record("a.csv")
    checkpoint.record("b.csv")
    with ledger.open("a", encoding="utf-8") as handle:
        handle.write('{"key": "c.c')  # morte no meio da escrita: linha sem `\n`

    assert checkpoint.entries() == ("a.csv", "b.csv")
    assert checkpoint.done() == frozenset({"a.csv", "b.csv"})
    assert checkpoint.path == ledger


def test_linha_completa_ilegivel_e_corrupcao_e_nao_e_tolerada(tmp_path: Path) -> None:
    ledger = tmp_path / "checkpoint.jsonl"
    checkpoint = JsonlCheckpoint(ledger)
    checkpoint.record("a.csv")
    with ledger.open("a", encoding="utf-8") as handle:
        handle.write("nao-e-json\n")

    with pytest.raises(CorruptedCheckpointError):
        checkpoint.entries()


def test_checkpoint_ausente_ou_vazio_devolve_janela_inteira(tmp_path: Path) -> None:
    ausente = JsonlCheckpoint(tmp_path / "nao-existe.jsonl")
    assert ausente.entries() == ()

    vazio_path = tmp_path / "vazio.jsonl"
    vazio_path.write_bytes(b"")
    assert JsonlCheckpoint(vazio_path).entries() == ()

    so_linha_em_branco = tmp_path / "branco.jsonl"
    so_linha_em_branco.write_bytes(b"\n")
    assert JsonlCheckpoint(so_linha_em_branco).entries() == ()


def test_reprocessar_o_mesmo_item_nao_muda_o_resultado_nem_deixa_parcial(tmp_path: Path) -> None:
    """IDEMPOTENCIA no caminho feliz — nao atomicidade: aqui NAO ha interrupcao nenhuma.

    O nome anterior (`..._e_atomica_...`) prometia mais do que o corpo mede, e nome de teste e
    a documentacao que mais gente le. A atomicidade do `os.replace` NAO e testada nesta suite
    `[NAO MEDIDO]`: exercitar de verdade exigiria interromper ENTRE o `fsync` e o `rename` e
    observar o diretorio de fora. O que esta suite mede sobre a publicacao e a ORDEM das
    chamadas (`tests/sentimento/test_durabilidade_da_infra.py`) e a ausencia de residuo aqui.
    """
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _semear(source_dir, quantos=3)
    worker = FileEtlWorker(source_dir, output_dir, _transform)
    for key in keys:
        worker.process(key)
        worker.process(key)  # refazer nao muda o resultado

    _conferir_saida_integra(source_dir, output_dir, keys)
