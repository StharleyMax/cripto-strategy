"""Two assertions the suite NAMED and did not make. Found by mutation, not by reading.

The bench of the `/qa` of 2026-08-29 ran **32 mutants** against a suite at **100 % of lines in
the three layers**, and three survived. Two of them are closed here; the third
(`logger.info(key)` removed from `run`) is closed by `test_dump_etl_cli_streams.py`.

    mutante                                                        antes    agora
    `DATASETS_BY_NAME` ganha `exchangeInfo` (fonte REST)            rc=0     rc=1
    `BinaryFileLineSink.accept` para de contar (`accepted`)         rc=0     rc=1

Both are the same defect family, and it is the one this repository keeps naming: **a claim written
in a docstring with no assertion under it.** `DumpIngestWorker` says REST sources are kept out
*"by a TYPE rather than by a policy line someone could delete"*, and `BinaryFileLineSink` says its
count exists because *"a test compares them"*. Measured, the barrier IS a line
(`DATASETS_BY_NAME`, a `dict` literal) and no test compared anything.
"""

from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path

from src.modules.sentimento.domain.dump_window import (
    AGG_TRADES,
    BOOK_DEPTH,
    BUCKET_ROOT,
    DATASETS_BY_NAME,
    enumerate_window,
)
from src.modules.sentimento.infra.checksummed_file_payload import ChecksummedFilePayload
from src.modules.sentimento.infra.dump_ingest_worker import BinaryFileLineSink
from src.modules.sentimento.use_cases.ingest_verified_payload import ingest_verified

LINES = 5
BODY = b"".join(b"1700000000000,42.5,0.01,111,222,false\n" for _ in range(LINES))


def test_the_dataset_vocabulary_is_exactly_the_two_the_dump_publishes() -> None:
    """THE BARRIER, PINNED. `T-02.1`/`T-02.2` stay out of this edge because of this dict.

    `mypy --strict` does NOT stop a REST source from reaching the worker — measured by the `/qa`
    on 2026-08-29 with a module planted in `infra` that calls
    `DumpIngestWorker(...).process("api/v3/exchangeInfo.json")`: `ruff`, `mypy --strict` and
    `import-linter` all pass `[MEDIDO: 3 portoes, 0 achado]`, and the refusal that does happen is
    `ChecksumMissingError` at runtime, not a type error.

    What actually keeps REST traffic out of the composition root is that `dataset_by_name` only
    resolves the two names below, so every key `run` can build comes from a `DumpPartition`. That
    is a line of code someone can extend, so it is asserted here rather than described.
    """
    assert set(DATASETS_BY_NAME) == {AGG_TRADES.name, BOOK_DEPTH.name}
    assert [d.has_monthly for d in (AGG_TRADES, BOOK_DEPTH)] == [True, False]


def test_every_key_the_queue_can_build_is_a_bucket_key_under_the_dump_prefix() -> None:
    """The second half of the same barrier: the SHAPE of what the window can produce.

    A REST snapshot has no bucket prefix, so a key that does not start with `data/futures/um`
    could not have come from this enumerator.
    """
    for dataset in (AGG_TRADES, BOOK_DEPTH):
        window = enumerate_window(dataset, "BTCUSDT", date(2026, 8, 29), 3, "daily")
        assert all(
            partition.object_key.startswith(f"{BUCKET_ROOT}/daily/{dataset.name}/")
            for partition in window
        )


def test_the_sink_count_and_what_the_edge_delivered_are_compared(tmp_path: Path) -> None:
    """`BinaryFileLineSink.accepted` becomes a witness only when something reads it.

    The neighbouring `test_the_published_object_is_byte_identical_to_the_verified_source` (renamed
    from `test_the_sink_counts_exactly_what_the_edge_says_it_delivered` in ciclo 2) asserts the
    published bytes and a newline count — it never touches `accepted`, so deleting
    `self.accepted += 1` left the whole suite green `[MEDIDO 2026-08-29: mutante `M25`, rc=0]`.
    Two independent observations of the same number only disagree in a test that compares them.
    """
    source = tmp_path / "BTCUSDT-aggTrades-2026-08-29.zip"
    source.write_bytes(BODY)
    source.with_name(source.name + ".CHECKSUM").write_text(
        f"{hashlib.sha256(BODY).hexdigest()}  {source.name}\n", encoding="utf-8"
    )
    destination = tmp_path / "published.out"
    sink = BinaryFileLineSink()

    with destination.open("wb") as handle:
        sink.bind(handle)
        delivered = ingest_verified(ChecksummedFilePayload(source), sink)

    assert delivered == LINES
    assert sink.accepted == delivered, "the edge and the sink disagree about what was delivered"
