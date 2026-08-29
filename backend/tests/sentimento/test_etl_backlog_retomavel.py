"""`CA-F0-5` / `D3.1`: kill the process halfway and resume — it never duplicates, never loses."""

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
    """Wrap a worker and count HOW MANY times each key was actually processed."""

    def __init__(self, alvo: FileEtlWorker) -> None:
        """Wrap `alvo` and start the call log empty."""
        self._alvo = alvo
        self.chamadas: list[str] = []

    def process(self, key: str) -> None:
        """Log the call and delegate to the wrapped worker."""
        self.chamadas.append(key)
        self._alvo.process(key)


class CheckpointVolatil:
    """Checkpoint held in MEMORY — the counter-example, not a substitute."""

    def __init__(self) -> None:
        """Start with nothing recorded as done."""
        self._done: set[str] = set()

    def done(self) -> frozenset[str]:
        """Return what this in-memory checkpoint believes is done."""
        return frozenset(self._done)

    def record(self, key: str) -> None:
        """Record `key` in memory only — it does not survive a restart, and that is the point."""
        self._done.add(key)


def test_janela_declarada_recusa_chave_repetida() -> None:
    """Reject a window that declares the same key twice."""
    with pytest.raises(InvalidBacklogError):
        EtlBacklog.of(["a.csv", "b.csv", "a.csv"])


def test_janela_declarada_recusa_chave_vazia() -> None:
    """Reject a window that declares an empty key."""
    with pytest.raises(InvalidBacklogError):
        EtlBacklog.of(["a.csv", ""])


def test_pendente_preserva_a_ordem_declarada() -> None:
    """Keep the declared order in what is still pending, not the sorted order."""
    backlog = EtlBacklog.of(["c", "a", "b"])
    assert backlog.pending(done=["a"]) == ("c", "b")
    assert len(backlog) == 3


def test_checkpoint_fora_da_janela_e_erro_e_nao_ruido() -> None:
    """Raise when the checkpoint claims a key the declared window does not contain."""
    backlog = EtlBacklog.of(["a", "b"])
    with pytest.raises(CheckpointOutsideWindowError):
        backlog.pending(done=["a", "z"])


def test_drenagem_completa_processa_cada_arquivo_uma_unica_vez(tmp_path: Path) -> None:
    """Process each of the 120 files exactly once, and publish every one of them intact."""
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
    """Redo nothing on a second drain when the first one finished without failing."""
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _semear(source_dir, quantos=10)
    checkpoint = JsonlCheckpoint(tmp_path / "checkpoint.jsonl")
    worker = FileEtlWorker(source_dir, output_dir, _transform)
    drain(EtlBacklog.of(keys), worker, checkpoint)

    contador = ContadorDeTrabalho(worker)
    assert drain(EtlBacklog.of(keys), contador, checkpoint) == ()
    assert contador.chamadas == []


def test_matar_o_processo_no_meio_e_retomar_nao_duplica_nem_perde(tmp_path: Path) -> None:
    """`D3.1`, with a real SIGKILL: 120 files, death halfway, resume in-process.

    TWO CAVEATS PUT ON THE RECORD, because a test that passes without them written down turns
    into a rediscovered defect. Neither is fixed in this task — they belong to phase `03`
    (`T-03.10`).

    1. THE REAL RISK WINDOW OF "NEVER DUPLICATES" IS NOT GUARANTEED BY THIS TEST. That window
       is "item published (`os.replace` already ran) but NOT YET recorded", and it only exists
       between `worker.process` and `checkpoint.record`. Here the driver's clock is dominated
       by the `time.sleep(0.02 s)` living INSIDE `transform`, that is, BEFORE the `os.replace`
       — so the death almost certainly falls outside the window. And this test does NOT claim
       where the death fell: there is no assertion about it on any of its lines. What actually
       proves that reprocessing is harmless is the idempotence test at the end of this file
       (`test_reprocessar_o_mesmo_item_...`). Today "never duplicates" is CLAIMED here and
       PROVEN there.
    2. SCALE: `D3.1` declares a cost of **0.86 s/file (n=11)** `[DOC: tasks_review.md:274]`,
       measured over a real dump. Here the files are **8 to 10 bytes (mean 9.08 B, n=120)**
       `[MEDIDO 2026-08-28]` and the cost per item is an ARTIFICIAL `time.sleep` of 0.02 s. The
       INVARIANT under test (never duplicates / never loses) is the same; the SCALE is not, and
       nothing here measures the cost per file `[NAO MEDIDO]`.
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
    """Falsify the durability claim: swap the `fsync` for memory and `D3.1` FAILS."""
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _semear(source_dir, quantos=10)
    worker = FileEtlWorker(source_dir, output_dir, _transform)

    drain(EtlBacklog.of(keys), worker, CheckpointVolatil())

    contador = ContadorDeTrabalho(worker)
    reinicio = CheckpointVolatil()  # o "restart": a memoria do processo morto nao volta
    drain(EtlBacklog.of(keys), contador, reinicio)

    assert contador.chamadas == list(keys), "sem checkpoint duravel, a retomada refaz TUDO"


def test_cauda_truncada_e_descartada_e_o_resto_sobrevive(tmp_path: Path) -> None:
    """Discard a tail written without a newline, and keep every complete line before it."""
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
    """Treat a COMPLETE unreadable line as corruption, never as tolerable noise."""
    ledger = tmp_path / "checkpoint.jsonl"
    checkpoint = JsonlCheckpoint(ledger)
    checkpoint.record("a.csv")
    with ledger.open("a", encoding="utf-8") as handle:
        handle.write("nao-e-json\n")

    with pytest.raises(CorruptedCheckpointError):
        checkpoint.entries()


def test_checkpoint_ausente_ou_vazio_devolve_janela_inteira(tmp_path: Path) -> None:
    """Return no entry at all when the ledger is missing, empty, or only blank lines."""
    ausente = JsonlCheckpoint(tmp_path / "nao-existe.jsonl")
    assert ausente.entries() == ()

    vazio_path = tmp_path / "vazio.jsonl"
    vazio_path.write_bytes(b"")
    assert JsonlCheckpoint(vazio_path).entries() == ()

    so_linha_em_branco = tmp_path / "branco.jsonl"
    so_linha_em_branco.write_bytes(b"\n")
    assert JsonlCheckpoint(so_linha_em_branco).entries() == ()


def test_reprocessar_o_mesmo_item_nao_muda_o_resultado_nem_deixa_parcial(tmp_path: Path) -> None:
    """IDEMPOTENCE on the happy path — not atomicity: there is NO interruption here at all.

    The previous name (`..._e_atomica_...`) promised more than the body measures, and a test
    name is the documentation most people read. The atomicity of `os.replace` is NOT tested by
    this suite `[NAO MEDIDO]`: exercising it for real would mean interrupting BETWEEN the
    `fsync` and the `rename` and observing the directory from outside. What this suite does
    measure about publication is the ORDER of the calls
    (`tests/sentimento/test_durabilidade_da_infra.py`) and the absence of residue here.
    """
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _semear(source_dir, quantos=3)
    worker = FileEtlWorker(source_dir, output_dir, _transform)
    for key in keys:
        worker.process(key)
        worker.process(key)  # refazer nao muda o resultado

    _conferir_saida_integra(source_dir, output_dir, keys)
