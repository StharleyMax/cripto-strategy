"""`D2.9` / `CA-F0-6`: kill the recorder and reread — the record is PERSISTED, never a log."""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query
from tests.helpers.ingest_record_driver import build_run

# `D2.9` does not declare a size, so this file declares its own and says why: 60 runs at the
# driver's 0.02 s pause is ~1.2 s of wall clock, which is long enough for the kill to land in
# the middle with room on both sides, and short enough not to dominate the suite.
UNIVERSE = 60
BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "ingest_record_driver.py"
CLI_MODULE = "src.modules.sentimento.infra.ingest_health_cli"


class VolatileIngestRecordStore:
    """The COUNTER-EXAMPLE: the record kept in MEMORY, which is what `D2.9` forbids."""

    def __init__(self) -> None:
        """Start with nothing recorded."""
        self._runs: list[IngestRun] = []
        self._gaps: list[IngestGap] = []

    def record_run(self, run: IngestRun) -> None:
        """Record the run in memory only — it dies with the process, and that is the point."""
        self._runs.append(run)

    def record_gap(self, gap: IngestGap) -> None:
        """Record the gap in memory only."""
        self._gaps.append(gap)

    def runs(self) -> tuple[IngestRun, ...]:
        """Return what this in-memory store believes was recorded."""
        return tuple(self._runs)

    def gaps(self) -> tuple[IngestGap, ...]:
        """Return the gaps this in-memory store believes were recorded."""
        return tuple(self._gaps)


def _sample_gap(index: int) -> IngestGap:
    return IngestGap(
        source="coinalyze",
        symbol="BTCUSDT",
        series_key_id=f"oi-1m-{index}",
        from_ts="2026-08-12T11:45:00Z",
        to_ts="2026-08-12T12:05:00Z",
        n_missing=3,
        gap_class="SOURCE_GAP",
        detected_at=f"2026-08-29T01:00:{index:02d}Z",
    )


def test_killing_the_recorder_mid_run_keeps_every_committed_record(tmp_path: Path) -> None:
    """`D2.9` with a real `SIGKILL`: kill the process, reread from a store that never shared it.

    THE REREAD IS THE POINT, AND IT IS DONE FROM A NEW OBJECT ON A NEW CONNECTION. Asserting
    against the same store instance the test polled would prove nothing about persistence —
    an in-memory list would pass that. What is checked here is that a reader which never
    touched the dead process's memory sees the rows, field by field.
    """
    store_path = tmp_path / "record.sqlite3"
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    process = subprocess.Popen(
        [sys.executable, str(DRIVER), str(store_path), str(UNIVERSE), "0.02"],
        cwd=str(BACKEND_ROOT),
        env=environment,
    )
    observer = SqliteIngestRecordStore(store_path)
    try:
        deadline = time.monotonic() + 30.0
        while len(observer.runs()) < 10:
            assert process.poll() is None, "o driver terminou antes de a morte ser possivel"
            assert time.monotonic() < deadline, "o driver nao progrediu em 30 s"
            time.sleep(0.01)
        process.kill()
    finally:
        process.wait(timeout=30)

    assert process.returncode != 0, "SIGKILL tem de aparecer no codigo de saida"

    survivors = SqliteIngestRecordStore(store_path).runs()
    assert 0 < len(survivors) < UNIVERSE, f"morte fora do meio: {len(survivors)}/{UNIVERSE}"
    # NAO PERDE E NAO INVENTA: os sobreviventes sao exatamente o prefixo que o driver gravou,
    # campo a campo, e nao apenas "a mesma quantidade".
    assert list(survivors) == [build_run(index) for index in range(len(survivors))]
    # E ELES CHEGAM PELA CONSULTA NOMEADA, que e o que o item 2.6 do plano de fato pede.
    assert ingest_health_query(SqliteIngestRecordStore(store_path)).runs == survivors


def test_an_in_memory_record_store_loses_everything_on_restart() -> None:
    """FALSIFIER of `D2.9`: swap the durable store for memory and the restart comes back EMPTY.

    Without this, "it survived a restart" would be a claim about a green test rather than a
    measurement — a suite where the durable and the volatile store give the SAME answer is a
    suite that is not measuring durability at all.
    """
    volatile = VolatileIngestRecordStore()
    for index in range(5):
        volatile.record_run(build_run(index))
    assert len(volatile.runs()) == 5

    restarted = VolatileIngestRecordStore()  # o "restart": a memoria do processo morto nao volta
    assert restarted.runs() == ()
    assert ingest_health_query(restarted).runs == ()


def test_the_record_survives_a_reread_by_a_brand_new_store_object(tmp_path: Path) -> None:
    """Persist runs AND gaps, drop every object, and read both back through the named query."""
    store_path = tmp_path / "record.sqlite3"
    writer = SqliteIngestRecordStore(store_path)
    writer.initialise()
    writer.record_run(build_run(0))
    writer.record_gap(_sample_gap(0))
    assert writer.path == store_path

    health = ingest_health_query(SqliteIngestRecordStore(store_path))
    assert health.runs == (build_run(0),)
    assert health.gaps == (_sample_gap(0),)


def test_an_absent_store_reads_as_an_empty_record_instead_of_blowing_up(tmp_path: Path) -> None:
    """A collector that never ran reads as zero rows — the record must not hide its own state."""
    health = ingest_health_query(SqliteIngestRecordStore(tmp_path / "never-created.sqlite3"))
    assert health.runs == ()
    assert health.gaps == ()


def test_recording_the_same_run_twice_does_not_duplicate_it(tmp_path: Path) -> None:
    """A retried recording converges: `run_id` is the identity, so the row is replaced."""
    store = SqliteIngestRecordStore(tmp_path / "record.sqlite3")
    store.initialise()
    store.record_run(build_run(7))
    store.record_run(build_run(7))
    store.record_gap(_sample_gap(1))
    store.record_gap(_sample_gap(1))

    assert store.runs() == (build_run(7),)
    assert store.gaps() == (_sample_gap(1),)


@pytest.mark.parametrize("locale", ["pt_BR.UTF-8", "C"])
def test_the_cli_projection_is_byte_identical_under_pt_br_and_c_locales(
    tmp_path: Path, locale: str
) -> None:
    """`SPEC-001` §3.8, run literally: export under two locales and compare `sha256`.

    The reference hash is computed IN-PROCESS from the report object, so the two subprocess
    runs are compared against a third, independent computation rather than against each
    other — two subprocesses that were both wrong in the same way would agree.

    THE UNIVERSE IS REAL, AND IT WAS CHECKED BEFORE THIS TEST WAS TRUSTED: `pt_BR.UTF-8` is
    installed on this machine and reaches the subprocess as an EFFECTIVE locale
    `[MEDIDO 2026-08-29: LANG=pt_BR.UTF-8 ... locale.setlocale(locale.LC_ALL, "") ->
     ("pt_BR", "UTF-8"), and locale.format_string("%.2f", 1234.5, grouping=True) -> "1.234,50"]`.
    A locale that does not exist would fall back in silence and this test would compare two
    identical `C` runs while claiming to compare two locales.

    WHAT IT DOES NOT COVER, and it is one line rather than a surprise later: every column of
    the record today is `int`, `str` or `null`, and none of those has ever been
    locale-sensitive in JSON. The day a FLOAT column enters the projection, this test is the
    place that has to be re-read — it will still pass, and it will be proving less
    `[NAO MEDIDO: nenhuma coluna de ponto flutuante existe hoje na projecao]`.
    """
    store_path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    for index in range(3):
        store.record_run(build_run(index))
    store.record_gap(_sample_gap(0))
    expected = ingest_health_query(SqliteIngestRecordStore(store_path)).fingerprint()

    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT), LANG=locale, LC_ALL=locale)
    completed = subprocess.run(
        [sys.executable, "-m", CLI_MODULE, str(store_path)],
        cwd=str(BACKEND_ROOT),
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )
    emitted = completed.stdout.rstrip("\n")
    assert hashlib.sha256(emitted.encode("utf-8")).hexdigest() == expected
