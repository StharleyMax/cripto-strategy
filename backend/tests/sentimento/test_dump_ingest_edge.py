"""The dump queue at the `.CHECKSUM` edge: what it refuses, warns about, and never does.

`ADR-014/D3b` decides the shape asserted here, and it is TWO gates rather than one:

| gate | when | witness | verdict when it bites |
|---|---|---|---|
| **P1** | before the first line | class **T**: `.CHECKSUM` | refuse, zero lines written |
| **P2** | at the window level | class **O**: the neighbour rule | **warn + record, NEVER refuse** |

Conflating them is the failure this task was warned about: refusing a short month would plant the
survivorship `SPEC-001` §5.6 exists to prevent, because the 6,781 h of April 2024 are REAL data.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import date
from pathlib import Path

import pytest

from src.modules.sentimento.domain.checksum_manifest import (
    ChecksumMismatchError,
    ChecksumMissingError,
    ChecksumRejectedError,
)
from src.modules.sentimento.domain.dump_window import AGG_TRADES, enumerate_window
from src.modules.sentimento.domain.retention_probe import ABSENT, SUSPECT_LAST_BEFORE_ABSENT
from src.modules.sentimento.infra.dump_etl_cli import (
    CHECKPOINT_FILE,
    FINDINGS_FILE,
    MIRROR_DIR,
    OUTPUT_DIR,
    PROBE_FILE,
    run,
)
from src.modules.sentimento.infra.dump_ingest_worker import (
    BinaryFileLineSink,
    DumpIngestWorker,
    UnboundSinkError,
)
from src.modules.sentimento.infra.file_etl_worker import OUTPUT_SUFFIX, PARTIAL_SUFFIX
from src.modules.sentimento.infra.jsonl_checkpoint import JsonlCheckpoint

SYMBOL = "BTCUSDT"
DATASET = AGG_TRADES.name
END = date(2026, 8, 29)
BODY = b"1700000000000,42.5,0.01,111,222,false\n" * 5


def _seed(workdir: Path, depth: int, *, sidecar: bool = True) -> tuple[str, ...]:
    """Fabricate `depth` objects in the mirror, each with a correct sidecar unless told not to."""
    partitions = enumerate_window(AGG_TRADES, SYMBOL, END, depth, "daily")
    for partition in partitions:
        target = workdir / MIRROR_DIR / partition.object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(BODY)
        if sidecar:
            digest = hashlib.sha256(BODY).hexdigest()
            target.with_name(target.name + ".CHECKSUM").write_text(
                f"{digest}  {target.name}\n", encoding="utf-8"
            )
    return tuple(p.object_key for p in partitions)


def _no_residue(workdir: Path) -> None:
    """Assert that no interrupted write left a `.partial` behind."""
    out = workdir / OUTPUT_DIR
    residue = sorted(str(p) for p in out.rglob(f"*{PARTIAL_SUFFIX}")) if out.exists() else []
    assert residue == [], f"a partial survived: {residue}"


def test_a_corrupted_object_is_refused_publishes_nothing_and_leaves_no_partial(
    tmp_path: Path,
) -> None:
    """P1, end to end through the composition root: one flipped byte and NOTHING enters.

    The residue assertion is the half that is easy to forget: `ingest_verified` fails closed, so
    the partial file has already been OPENED when the refusal fires. Left behind, it is
    indistinguishable from an interrupted write on the next run.
    """
    keys = _seed(tmp_path, depth=1)
    target = tmp_path / MIRROR_DIR / keys[0]
    target.write_bytes(BODY.replace(b"42.5", b"42.6", 1))

    with pytest.raises(ChecksumMismatchError):
        run(tmp_path, SYMBOL, DATASET, END, 1, "daily")

    assert not (tmp_path / OUTPUT_DIR / f"{keys[0]}{OUTPUT_SUFFIX}").exists()
    assert JsonlCheckpoint(tmp_path / CHECKPOINT_FILE).entries() == ()
    _no_residue(tmp_path)


def test_a_refused_object_is_retried_on_the_next_run_because_it_was_never_recorded(
    tmp_path: Path,
) -> None:
    """Fail-closed must not become fail-forgotten: the key stays pending until it succeeds."""
    keys = _seed(tmp_path, depth=1)
    target = tmp_path / MIRROR_DIR / keys[0]
    good = target.read_bytes()
    target.write_bytes(good.replace(b"42.5", b"42.6", 1))
    with pytest.raises(ChecksumRejectedError):
        run(tmp_path, SYMBOL, DATASET, END, 1, "daily")

    target.write_bytes(good)
    assert run(tmp_path, SYMBOL, DATASET, END, 1, "daily") == keys


def test_an_object_with_no_sidecar_is_refused_because_absence_is_not_a_passing_verdict(
    tmp_path: Path,
) -> None:
    """For the S3 dump the declared witness IS the `.CHECKSUM`, so a missing one means trouble.

    `ADR-014/D3a` reframes the general rule as *"ausencia de TESTEMUNHA DECLARADA"*, and notes
    that for this source the two formulations COINCIDE. That is why routing `T-02.1`/`T-02.2`
    here would be wrong and routing the dump here is right.
    """
    _seed(tmp_path, depth=1, sidecar=False)

    with pytest.raises(ChecksumMissingError):
        run(tmp_path, SYMBOL, DATASET, END, 1, "daily")

    _no_residue(tmp_path)


def _write_probe(workdir: Path, rows: list[dict[str, object]]) -> None:
    """Write the probe log the operator's monthly `curl -sI` job would have produced."""
    workdir.mkdir(parents=True, exist_ok=True)
    (workdir / PROBE_FILE).write_text(
        "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
    )


def test_a_period_the_probe_found_missing_is_dropped_from_the_window(tmp_path: Path) -> None:
    """An `ABSENT` period leaves the WINDOW rather than being skipped inside the worker.

    The difference is measurable, not stylistic: `EtlBacklog.pending` raises
    `CheckpointOutsideWindowError` on a checkpoint key the window does not contain, so an object
    silently skipped every run would keep the backlog permanently non-empty and the queue would
    never be able to report itself finished.
    """
    keys = _seed(tmp_path, depth=3)
    _write_probe(tmp_path, [{"object_key": keys[0], "status": 404, "content_length": None}])

    processed = run(tmp_path, SYMBOL, DATASET, END, 3, "daily")

    assert processed == keys[1:]
    assert run(tmp_path, SYMBOL, DATASET, END, 3, "daily") == ()


def test_a_suspect_period_is_ingested_with_a_warning_and_is_never_refused(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """`ADR-014/D3b`: P2 warns and records. It does NOT reject, and that is the whole decision.

    The 6,781 h inside the April 2024 object are real observations. Refusing them would delete
    real data to avoid an incomplete label, which is the generalised fail-closed that
    `SPEC-001` §5.6 names as how survivorship gets planted. **The objective is to stop the
    SILENCE, not to stop the write.**
    """
    keys = _seed(tmp_path, depth=3)
    _write_probe(
        tmp_path,
        [
            {"object_key": keys[0], "status": 200, "content_length": len(BODY)},
            {"object_key": keys[1], "status": 200, "content_length": len(BODY)},
            {"object_key": keys[2], "status": 404, "content_length": None},
        ],
    )

    with caplog.at_level(logging.WARNING):
        processed = run(tmp_path, SYMBOL, DATASET, END, 3, "daily")

    assert processed == keys[:2], "the suspect object still enters — it is data"
    assert (tmp_path / OUTPUT_DIR / f"{keys[1]}{OUTPUT_SUFFIX}").read_bytes() == BODY
    assert "dump_object_window_suspect" in caplog.text


def test_the_findings_are_written_durably_before_the_drain_starts(tmp_path: Path) -> None:
    """The window verdict survives the death the queue is designed around.

    Written AFTER the drain, a finding would die with a run killed halfway — and the resumed run
    skips every recorded key, so it would never revisit the period to re-decide it. The knowledge
    is about the WINDOW, so it is persisted when the window is decided.
    """
    keys = _seed(tmp_path, depth=3)
    _write_probe(
        tmp_path,
        [
            {"object_key": keys[1], "status": 200, "content_length": len(BODY)},
            {"object_key": keys[2], "status": 404, "content_length": None},
        ],
    )
    # Break the object so the drain RAISES: the findings must already be on disk anyway.
    (tmp_path / MIRROR_DIR / keys[0]).write_bytes(b"different\n")

    with pytest.raises(ChecksumRejectedError):
        run(tmp_path, SYMBOL, DATASET, END, 3, "daily")

    recorded = [
        json.loads(line)
        for line in (tmp_path / FINDINGS_FILE).read_text(encoding="utf-8").splitlines()
    ]
    by_key = {row["object_key"]: row["finding"] for row in recorded}
    assert by_key[keys[1]] == SUSPECT_LAST_BEFORE_ABSENT
    assert by_key[keys[2]] == ABSENT
    assert all("declared_hours" in row for row in recorded)


def test_a_window_with_no_probe_log_at_all_still_drains(tmp_path: Path) -> None:
    """Absence of a probe is not a refusal: §5.8's probe is MONTHLY and the queue is not."""
    keys = _seed(tmp_path, depth=2)

    assert run(tmp_path, SYMBOL, DATASET, END, 2, "daily") == keys
    assert not (tmp_path / FINDINGS_FILE).exists()


def test_a_window_whose_every_period_is_absent_drains_to_nothing(tmp_path: Path) -> None:
    """An empty workable window returns `()` rather than constructing an empty backlog.

    `EtlBacklog` is a CLOSED window and an empty one is meaningless; returning early says
    "nothing to do" instead of asking the domain to model a window with no members.
    """
    keys = _seed(tmp_path, depth=2)
    _write_probe(
        tmp_path, [{"object_key": key, "status": 404, "content_length": None} for key in keys]
    )

    assert run(tmp_path, SYMBOL, DATASET, END, 2, "daily") == ()


def test_the_sink_counts_exactly_what_the_edge_says_it_delivered(tmp_path: Path) -> None:
    """Two independent observations of the same number have to agree."""
    keys = _seed(tmp_path, depth=1)
    worker = DumpIngestWorker(tmp_path / MIRROR_DIR, tmp_path / OUTPUT_DIR)

    worker.process(keys[0])

    published = (tmp_path / OUTPUT_DIR / f"{keys[0]}{OUTPUT_SUFFIX}").read_bytes()
    assert published == BODY
    assert published.count(b"\n") == 5


def test_a_sink_with_no_destination_raises_instead_of_holding_lines_in_memory() -> None:
    """A buffered sink would produce a short series out of helpfulness."""
    with pytest.raises(UnboundSinkError):
        BinaryFileLineSink().accept(b"a line that has nowhere to go\n")


def test_a_rest_shaped_key_is_refused_and_the_refusal_is_the_missing_witness(
    tmp_path: Path,
) -> None:
    """The routing is STRUCTURAL: a `T-02.1`/`T-02.2` payload has no bucket key to hand over.

    `T-02.1` (`exchangeInfo` snapshot) and `T-02.2` (Coinalyze one-shot) are REST responses that
    publish no sidecar, and routing them through this edge would refuse **100 % of legitimate
    traffic** — which is why `ADR-014/D3a` reframes the rule as *"ausencia de TESTEMUNHA
    DECLARADA"*. They are kept out of this worker by a TYPE rather than by a policy line someone
    could delete: every key it sees comes from `DumpPartition.object_key`, and no REST source
    has a partition.

    WHAT THIS TEST ACTUALLY PINS, and my first version of it asserted the wrong thing. I expected
    `OSError` — *"the path you passed is not there"*. The real verdict is `ChecksumMissingError`,
    and the order of operations is why: `checksum_text()` tests the SIDECAR with `is_file()`
    first, finds nothing, and reports absence before the payload is ever opened. The documented
    `OSError` case is narrower than its wording suggests — it needs the sidecar PRESENT and the
    payload gone, which is the case `test_a_payload_file_that_vanished_delivers_nothing` covers.

    Both refusals are fail-closed, so nothing enters either way; but a batch written as
    `except ChecksumRejectedError: skip_one_file()` SKIPS this one and DIES on the other, and
    that difference is worth pinning rather than assuming.
    """
    worker = DumpIngestWorker(tmp_path / MIRROR_DIR, tmp_path / OUTPUT_DIR)

    with pytest.raises(ChecksumMissingError):
        worker.process("api/v3/exchangeInfo.json")

    _no_residue(tmp_path)


def test_a_vanished_payload_whose_sidecar_survived_raises_outside_the_integrity_family(
    tmp_path: Path,
) -> None:
    """The other half of the asymmetry, so the two refusals are told apart by a test.

    Sidecar present, object gone: the truth is *"the path you passed is not there"*, and
    reporting it as a checksum verdict would send whoever reads the log hunting a truncation
    that did not happen.
    """
    keys = _seed(tmp_path, depth=1)
    (tmp_path / MIRROR_DIR / keys[0]).unlink()
    worker = DumpIngestWorker(tmp_path / MIRROR_DIR, tmp_path / OUTPUT_DIR)

    with pytest.raises(FileNotFoundError):
        worker.process(keys[0])

    assert not isinstance(FileNotFoundError(), ChecksumRejectedError)
    _no_residue(tmp_path)
