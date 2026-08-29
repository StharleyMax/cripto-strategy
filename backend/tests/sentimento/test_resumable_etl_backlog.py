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
UNIVERSE = 120
BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "drain_driver.py"


def _transform(payload: bytes) -> bytes:
    return hashlib.sha256(payload).hexdigest().encode("ascii")


def _seed(source_dir: Path, how_many: int = UNIVERSE) -> tuple[str, ...]:
    source_dir.mkdir(parents=True, exist_ok=True)
    keys = tuple(f"dump-{n:04d}.csv" for n in range(how_many))
    for n, key in enumerate(keys):
        (source_dir / key).write_bytes(f"linha,{n}\n".encode("ascii"))
    return keys


def _assert_output_intact(source_dir: Path, output_dir: Path, keys: tuple[str, ...]) -> None:
    published = sorted(p.name for p in output_dir.glob(f"*{OUTPUT_SUFFIX}"))
    assert published == sorted(f"{k}{OUTPUT_SUFFIX}" for k in keys)
    # `glob("*.out")` NAO casa `k.csv.out.partial` — sem a linha abaixo este helper era CEGO a
    # residuo de escrita interrompida, que e exatamente o que o `SIGKILL` do `D3.1` pode deixar.
    leftovers = sorted(p.name for p in output_dir.glob(f"*{PARTIAL_SUFFIX}"))
    assert leftovers == [], f"parcial sobreviveu a publicacao: {leftovers}"
    for key in keys:
        expected = _transform((source_dir / key).read_bytes())
        assert (output_dir / f"{key}{OUTPUT_SUFFIX}").read_bytes() == expected


class WorkCounter:
    """Wrap a worker and count HOW MANY times each key was actually processed."""

    def __init__(self, target: FileEtlWorker) -> None:
        """Wrap `target` and start the call log empty."""
        self._target = target
        self.calls: list[str] = []

    def process(self, key: str) -> None:
        """Log the call and delegate to the wrapped worker."""
        self.calls.append(key)
        self._target.process(key)


class VolatileCheckpoint:
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


def test_a_declared_window_refuses_a_repeated_key() -> None:
    """Reject a window that declares the same key twice."""
    with pytest.raises(InvalidBacklogError):
        EtlBacklog.of(["a.csv", "b.csv", "a.csv"])


def test_a_declared_window_refuses_an_empty_key() -> None:
    """Reject a window that declares an empty key."""
    with pytest.raises(InvalidBacklogError):
        EtlBacklog.of(["a.csv", ""])


def test_pending_preserves_the_declared_order() -> None:
    """Keep the declared order in what is still pending, not the sorted order."""
    backlog = EtlBacklog.of(["c", "a", "b"])
    assert backlog.pending(done=["a"]) == ("c", "b")
    assert len(backlog) == 3


def test_a_checkpoint_outside_the_window_is_an_error_not_noise() -> None:
    """Raise when the checkpoint claims a key the declared window does not contain."""
    backlog = EtlBacklog.of(["a", "b"])
    with pytest.raises(CheckpointOutsideWindowError):
        backlog.pending(done=["a", "z"])


def test_a_complete_drain_processes_each_file_exactly_once(tmp_path: Path) -> None:
    """Process each of the 120 files exactly once, and publish every one of them intact."""
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _seed(source_dir)
    checkpoint = JsonlCheckpoint(tmp_path / "checkpoint.jsonl")
    counter = WorkCounter(FileEtlWorker(source_dir, output_dir, _transform))

    processed = drain(EtlBacklog.of(keys), counter, checkpoint)

    assert len(processed) == UNIVERSE
    assert counter.calls == list(keys)
    assert checkpoint.entries() == keys
    _assert_output_intact(source_dir, output_dir, keys)


def test_a_second_drain_without_failure_redoes_nothing(tmp_path: Path) -> None:
    """Redo nothing on a second drain when the first one finished without failing."""
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _seed(source_dir, how_many=10)
    checkpoint = JsonlCheckpoint(tmp_path / "checkpoint.jsonl")
    worker = FileEtlWorker(source_dir, output_dir, _transform)
    drain(EtlBacklog.of(keys), worker, checkpoint)

    counter = WorkCounter(worker)
    assert drain(EtlBacklog.of(keys), counter, checkpoint) == ()
    assert counter.calls == []


def test_killing_the_process_midway_and_resuming_neither_duplicates_nor_loses(
    tmp_path: Path,
) -> None:
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
       (`test_reprocessing_the_same_item_...`). Today "never duplicates" is CLAIMED here and
       PROVEN there.
    2. SCALE: `D3.1` declares a cost of **0.86 s/file (n=11)** `[DOC: tasks_review.md:274]`,
       measured over a real dump. Here the files are **8 to 10 bytes (mean 9.08 B, n=120)**
       `[MEDIDO 2026-08-28]` and the cost per item is an ARTIFICIAL `time.sleep` of 0.02 s. The
       INVARIANT under test (never duplicates / never loses) is the same; the SCALE is not, and
       nothing here measures the cost per file `[NAO MEDIDO]`.
    """
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _seed(source_dir)
    ledger = tmp_path / "checkpoint.jsonl"
    checkpoint = JsonlCheckpoint(ledger)

    env = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    process = subprocess.Popen(  # noqa: S603 - argv literal, sem shell
        [sys.executable, str(DRIVER), str(source_dir), str(output_dir), str(ledger), "0.02"],
        cwd=str(BACKEND_ROOT),
        env=env,
    )
    try:
        limit = time.monotonic() + 30.0
        while len(checkpoint.entries()) < 25:
            assert process.poll() is None, "o driver terminou antes de a morte ser possivel"
            assert time.monotonic() < limit, "o driver nao progrediu em 30 s"
            time.sleep(0.01)
        process.kill()
    finally:
        process.wait(timeout=30)

    assert process.returncode != 0, "SIGKILL tem de aparecer no codigo de saida"
    killed_at = len(checkpoint.entries())
    assert 0 < killed_at < UNIVERSE, f"morte fora do meio: {killed_at}/{UNIVERSE}"

    counter = WorkCounter(FileEtlWorker(source_dir, output_dir, _transform))
    resumed = drain(EtlBacklog.of(keys), counter, checkpoint)

    # NAO PERDE: a uniao das duas execucoes cobre a janela inteira.
    assert len(resumed) == UNIVERSE - killed_at
    assert sorted(checkpoint.entries()) == sorted(keys)
    # NAO DUPLICA: o registro nao tem repeticao, e a saida publicada tem exatamente 1 por chave.
    assert len(checkpoint.entries()) == len(set(checkpoint.entries())) == UNIVERSE
    assert set(counter.calls).isdisjoint(set(checkpoint.entries()[:killed_at]))
    _assert_output_intact(source_dir, output_dir, keys)


def test_a_volatile_checkpoint_reprocesses_the_whole_window(tmp_path: Path) -> None:
    """Falsify the durability claim: swap the `fsync` for memory and `D3.1` FAILS."""
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _seed(source_dir, how_many=10)
    worker = FileEtlWorker(source_dir, output_dir, _transform)

    drain(EtlBacklog.of(keys), worker, VolatileCheckpoint())

    counter = WorkCounter(worker)
    restart = VolatileCheckpoint()  # o "restart": a memoria do processo morto nao volta
    drain(EtlBacklog.of(keys), counter, restart)

    assert counter.calls == list(keys), "sem checkpoint duravel, a retomada refaz TUDO"


def test_a_truncated_tail_is_discarded_and_the_rest_survives(tmp_path: Path) -> None:
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


def test_an_unreadable_complete_line_is_corruption_and_is_not_tolerated(tmp_path: Path) -> None:
    """Treat a COMPLETE unreadable line as corruption, never as tolerable noise."""
    ledger = tmp_path / "checkpoint.jsonl"
    checkpoint = JsonlCheckpoint(ledger)
    checkpoint.record("a.csv")
    with ledger.open("a", encoding="utf-8") as handle:
        handle.write("nao-e-json\n")

    with pytest.raises(CorruptedCheckpointError):
        checkpoint.entries()


def test_a_missing_or_empty_checkpoint_returns_the_whole_window(tmp_path: Path) -> None:
    """Return no entry at all when the ledger is missing, empty, or only blank lines."""
    missing = JsonlCheckpoint(tmp_path / "nao-existe.jsonl")
    assert missing.entries() == ()

    empty_path = tmp_path / "vazio.jsonl"
    empty_path.write_bytes(b"")
    assert JsonlCheckpoint(empty_path).entries() == ()

    blank_line_only = tmp_path / "branco.jsonl"
    blank_line_only.write_bytes(b"\n")
    assert JsonlCheckpoint(blank_line_only).entries() == ()


def test_reprocessing_the_same_item_changes_nothing_and_leaves_no_partial(tmp_path: Path) -> None:
    """IDEMPOTENCE on the happy path — not atomicity: there is NO interruption here at all.

    The previous name (`..._e_atomica_...`) promised more than the body measures, and a test
    name is the documentation most people read. The atomicity of `os.replace` is NOT tested by
    this suite `[NAO MEDIDO]`: exercising it for real would mean interrupting BETWEEN the
    `fsync` and the `rename` and observing the directory from outside. What this suite does
    measure about publication is the ORDER of the calls
    (`tests/sentimento/test_infrastructure_durability.py`) and the absence of residue here.
    """
    source_dir, output_dir = tmp_path / "dump", tmp_path / "out"
    keys = _seed(source_dir, how_many=3)
    worker = FileEtlWorker(source_dir, output_dir, _transform)
    for key in keys:
        worker.process(key)
        worker.process(key)  # refazer nao muda o resultado

    _assert_output_intact(source_dir, output_dir, keys)
