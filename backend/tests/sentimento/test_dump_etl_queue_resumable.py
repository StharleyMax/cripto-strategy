"""`D3.1` / `CA-F0-5`: kill the dump queue halfway and resume — never duplicates, never loses.

THE UNIVERSE IS THE ONE `D3.1` DECLARES: **>= 100 arquivos**. 120 days of depth is the smallest
round window above that floor, and it is a REAL window enumerated by the depth parameter rather
than a bag of files, so what is under test is the queue this task ships.

── O QUE ESTA SUITE MEDE, E O QUE ELA EXPLICITAMENTE NAO MEDE ────────────────────────────────

The predecessor suite (`test_etl_backlog_retomavel.py`) put a caveat on the record that applies
here too, and it is repeated rather than quietly dropped: **the real risk window of "never
duplicates" is "published (`os.replace` already ran) but NOT YET recorded"**, and a `SIGKILL`
timed by polling a file almost certainly lands outside it. In this worker the per-item cost is
spent hashing and writing lines — all of it BEFORE `os.replace` — so the death falls in the same
place, and no assertion below claims otherwise.

What is different here: that window is proven DIRECTLY and deterministically, by
`test_an_item_published_but_not_recorded_is_redone_without_duplicating`, which reproduces the
exact interleaving instead of racing for it. The predecessor CLAIMED it in one test and PROVED it
in another; here the proof is named after the thing it proves.

THE COST PER ITEM IS REAL WORK, NOT A `time.sleep`. Each object carries 10.000 lines, so the
delay that makes the kill land mid-window comes from hashing and streaming actual bytes
`[MEDIDO 2026-08-29: 5,5 ms/arquivo a 10.000 linhas, n=10, backend/.venv/bin/python -B]`. That
is still NOT the scale `D3.1` declares — **0,86 s/arquivo (n=11)** over a real dump `[DOC:
tasks_review.md]` — and nothing here measures cost per file `[NAO MEDIDO]`. The INVARIANT is the
same; the SCALE is not.

**Nada de `data/`.** Every object and every `.CHECKSUM` below is fabricated by these tests.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

from src.modules.sentimento.domain.dump_window import AGG_TRADES, backlog_of, enumerate_window
from src.modules.sentimento.infra.dump_etl_cli import (
    CHECKPOINT_FILE,
    MIRROR_DIR,
    OUTPUT_DIR,
    run,
)
from src.modules.sentimento.infra.dump_ingest_worker import DumpIngestWorker
from src.modules.sentimento.infra.file_etl_worker import OUTPUT_SUFFIX, PARTIAL_SUFFIX
from src.modules.sentimento.infra.jsonl_checkpoint import JsonlCheckpoint
from src.modules.sentimento.use_cases.drain_etl_backlog import drain

# `D3.1` declares the floor: >= 100 files. 120 is the smallest round multiple above it.
UNIVERSE = 120
LINES_PER_OBJECT = 10_000
KILL_AFTER = 20

SYMBOL = "BTCUSDT"
DATASET = AGG_TRADES.name
END = date(2026, 8, 29)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "dump_queue_driver.py"


def _body(seed: int, lines: int = LINES_PER_OBJECT) -> bytes:
    """Build a CSV body shaped like an `aggTrades` dump, deterministic in `seed`."""
    return b"".join(
        f"17000000000{seed:02d},42.5,0.0{seed},{seed}11,{seed}22,false\n".encode("ascii")
        for _ in range(lines)
    )


def _seed_mirror(
    workdir: Path, depth: int = UNIVERSE, lines: int = LINES_PER_OBJECT
) -> tuple[str, ...]:
    """Fabricate the local bucket mirror: every object plus the `.CHECKSUM` beside it.

    The sidecar is written in the GNU `sha256sum` form the vendor publishes — 64 hex, one space,
    the mode character, the subject name — because that is what `ChecksumManifest.parse` reads.
    """
    partitions = enumerate_window(AGG_TRADES, SYMBOL, END, depth, "daily")
    mirror = workdir / MIRROR_DIR
    for index, partition in enumerate(partitions):
        target = mirror / partition.object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = _body(index, lines)
        target.write_bytes(payload)
        digest = hashlib.sha256(payload).hexdigest()
        target.with_name(target.name + ".CHECKSUM").write_text(
            f"{digest}  {target.name}\n", encoding="utf-8"
        )
    return tuple(p.object_key for p in partitions)


def _assert_published_intact(workdir: Path, keys: tuple[str, ...]) -> None:
    """Every key published exactly once, byte-identical to its source, and NO partial residue."""
    mirror, out = workdir / MIRROR_DIR, workdir / OUTPUT_DIR
    published = sorted(str(p.relative_to(out)) for p in out.rglob(f"*{OUTPUT_SUFFIX}"))
    assert published == sorted(f"{key}{OUTPUT_SUFFIX}" for key in keys)
    # `rglob("*.out")` does NOT match `k.zip.out.partial`, so without this the check would be
    # BLIND to exactly the residue an interrupted write leaves behind.
    residue = sorted(str(p.relative_to(out)) for p in out.rglob(f"*{PARTIAL_SUFFIX}"))
    assert residue == [], f"a partial survived publication: {residue}"
    for key in keys:
        assert (out / f"{key}{OUTPUT_SUFFIX}").read_bytes() == (mirror / key).read_bytes()


class CountingWorker:
    """Wrap the real worker and record HOW MANY times each key was actually processed."""

    def __init__(self, target: DumpIngestWorker) -> None:
        """Wrap `target` and start the call log empty."""
        self._target = target
        self.calls: list[str] = []

    def process(self, key: str) -> None:
        """Log the call and delegate to the wrapped worker."""
        self.calls.append(key)
        self._target.process(key)


def test_a_full_drain_publishes_every_object_in_the_window_exactly_once(tmp_path: Path) -> None:
    """Drain a 30-day window end to end: every object verified, published and recorded once."""
    keys = _seed_mirror(tmp_path, depth=30, lines=200)

    processed = run(tmp_path, SYMBOL, DATASET, END, 30, "daily")

    assert processed == keys
    assert JsonlCheckpoint(tmp_path / CHECKPOINT_FILE).entries() == keys
    _assert_published_intact(tmp_path, keys)


def test_a_second_drain_with_no_failure_redoes_nothing(tmp_path: Path) -> None:
    """The checkpoint is consulted, not decorative: a finished window drains to nothing."""
    _seed_mirror(tmp_path, depth=10, lines=200)
    run(tmp_path, SYMBOL, DATASET, END, 10, "daily")

    assert run(tmp_path, SYMBOL, DATASET, END, 10, "daily") == ()


def test_extending_the_depth_drains_only_what_the_deeper_window_added(tmp_path: Path) -> None:
    """`Q18`(d) made executable: *"comecar por 30 dias e estender depois nao e retrabalho"*.

    This is the owner's own justification for `Q18` not being a gate, and it is the reason the
    task carries no block. Asserting it means the claim is now a property of the code rather than
    a sentence in a decision document.
    """
    _seed_mirror(tmp_path, depth=20, lines=200)
    shallow = run(tmp_path, SYMBOL, DATASET, END, 10, "daily")

    deeper = run(tmp_path, SYMBOL, DATASET, END, 20, "daily")

    assert len(shallow) == 10
    assert len(deeper) == 10
    assert set(shallow).isdisjoint(set(deeper))
    assert len(JsonlCheckpoint(tmp_path / CHECKPOINT_FILE).entries()) == 20


def test_killing_the_process_halfway_and_resuming_neither_duplicates_nor_loses(
    tmp_path: Path,
) -> None:
    """`D3.1` with a REAL `SIGKILL`, over a 120-object window enumerated by the depth parameter."""
    keys = _seed_mirror(tmp_path)
    ledger = tmp_path / CHECKPOINT_FILE
    checkpoint = JsonlCheckpoint(ledger)

    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    process = subprocess.Popen(  # noqa: S603 - literal argv, no shell
        [
            sys.executable,
            str(DRIVER),
            str(tmp_path),
            SYMBOL,
            DATASET,
            END.isoformat(),
            str(UNIVERSE),
            "daily",
        ],
        cwd=str(BACKEND_ROOT),
        env=environment,
    )
    try:
        deadline = time.monotonic() + 60.0
        while len(checkpoint.entries()) < KILL_AFTER:
            assert process.poll() is None, "the driver finished before the death was possible"
            assert time.monotonic() < deadline, "the driver made no progress in 60 s"
            time.sleep(0.005)
        process.kill()
    finally:
        process.wait(timeout=30)

    assert process.returncode != 0, "the SIGKILL has to show up in the exit code"
    died_with = len(checkpoint.entries())
    assert 0 < died_with < UNIVERSE, f"the death missed the middle: {died_with}/{UNIVERSE}"

    counting = CountingWorker(DumpIngestWorker(tmp_path / MIRROR_DIR, tmp_path / OUTPUT_DIR))
    resumed = drain(
        backlog_of(enumerate_window(AGG_TRADES, SYMBOL, END, UNIVERSE, "daily")),
        counting,
        checkpoint,
    )

    # NEVER LOSES: the union of the two runs covers the whole enumerated window.
    assert len(resumed) == UNIVERSE - died_with
    assert sorted(checkpoint.entries()) == sorted(keys)
    # NEVER DUPLICATES: no repetition in the ledger, and exactly one published object per key.
    assert len(checkpoint.entries()) == len(set(checkpoint.entries())) == UNIVERSE
    assert set(counting.calls).isdisjoint(set(checkpoint.entries()[:died_with]))
    _assert_published_intact(tmp_path, keys)


def test_an_item_published_but_not_recorded_is_redone_without_duplicating(
    tmp_path: Path,
) -> None:
    """THE REAL RISK WINDOW, reproduced deterministically instead of raced for.

    The only interleaving that can duplicate work is: `os.replace` already ran, and the process died
    before `checkpoint.record`. `drain` chose that order on purpose — the alternative loses
    items instead. This test recreates it exactly: publish an object, do NOT record it, then
    resume.

    What must hold is that redoing is HARMLESS, which is the idempotence half of the
    `ItemWorker` contract. The `SIGKILL` test above cannot assert this, because it cannot say
    where the death landed.
    """
    keys = _seed_mirror(tmp_path, depth=3, lines=200)
    worker = DumpIngestWorker(tmp_path / MIRROR_DIR, tmp_path / OUTPUT_DIR)
    checkpoint = JsonlCheckpoint(tmp_path / CHECKPOINT_FILE)

    # The death: published, never recorded.
    worker.process(keys[0])
    published_before = (tmp_path / OUTPUT_DIR / f"{keys[0]}{OUTPUT_SUFFIX}").read_bytes()
    assert checkpoint.entries() == ()

    processed = run(tmp_path, SYMBOL, DATASET, END, 3, "daily")

    assert processed == keys, "the unrecorded item has to be redone, not skipped"
    assert (tmp_path / OUTPUT_DIR / f"{keys[0]}{OUTPUT_SUFFIX}").read_bytes() == published_before
    assert len(checkpoint.entries()) == len(set(checkpoint.entries())) == 3
    _assert_published_intact(tmp_path, keys)
