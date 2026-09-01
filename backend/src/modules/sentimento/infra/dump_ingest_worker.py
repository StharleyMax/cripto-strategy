"""The FIRST production caller of `ingest_verified`, and the first production `LineSink`."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import BinaryIO

from src.modules.sentimento.infra.checksummed_file_payload import ChecksummedFilePayload
from src.modules.sentimento.infra.file_etl_worker import OUTPUT_SUFFIX, PARTIAL_SUFFIX
from src.modules.sentimento.use_cases.ingest_verified_payload import ingest_verified

logger = logging.getLogger(__name__)


# ── WHAT THIS PIECE CLOSES, AND WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────
#
# `backend/README.md` records two open items whose declared owner is `T-03.10`:
#
#   * *"Nao ha chamador de producao. `ingest_verified` e a borda; quem a chama ainda nao existe"*
#   * *"`LineSink` nao tem implementacao de producao. O unico sink hoje e o de teste"*
#
# This module is both. It is an `ItemWorker` — the port `drain` already declares — so the dump
# queue is the EXISTING resumable mechanism pointed at a dump window, and **not a second one**.
#
# **IT DOES NOT CALL `payload.lines()`.** That matters and it is measured: the ordering guarantee
# of `ingest_verified` is watched by an AST trigger that counts call sites of `lines()` with no
# arguments across `src/`, and it is armed to bite at 2. Routing through `ingest_verified` — which
# verifies the digest BEFORE the first line is even requested — keeps the count at 1 and gets the
# guarantee for free. Reaching for the payload's lines here would have bought nothing and would
# have moved this module outside the one function the assertion watches.
# `tests/sentimento/test_verified_edge_call_sites.py` now RUNS that trigger, instead of it living
# typed inside a comment.
#
# ── ATOMICITY AND IDEMPOTENCE ARE THE PORT'S CONTRACT, NOT A COURTESY ────────────────────────
#
# `ItemWorker` states it literally: *"`process` publishes ATOMICALLY and is IDEMPOTENT"*. That
# contract is what buys "never duplicates" — `drain` buys "never loses" by recording only AFTER
# publishing, and dying between the two redoes the item. So the shape here is the one
# `FileEtlWorker` already established: write to `<destino>.partial`, `flush` + `fsync`,
# `os.replace`. The destination is a pure function of the key, so redoing overwrites with the same
# bytes.
#
# THE PARTIAL IS REMOVED ON FAILURE, and that is not tidiness: `ingest_verified` fails CLOSED, so
# a refused object leaves an EMPTY partial behind. Left there, it is residue that the next run
# cannot distinguish from an interrupted write. The `finally` below unlinks it and **re-raises**
# — nothing is swallowed (`core.silent-except`).
#
# ── CLASS-O SUSPICION ARRIVES FROM OUTSIDE, BECAUSE IT CANNOT BE DECIDED HERE ────────────────
#
# A short month is NOT detectable from the bytes of one object: its `.CHECKSUM` matches, its zip
# is intact, its `content-length` agrees `[MEDIDO, ADR-014, n = 1 objeto]`. The only witness at
# this stage lives at the WINDOW level and comes from the `HEAD` probe, so it is computed by
# `domain/retention_probe.py` and handed in. This worker's obligation is narrower and it is the
# one it can actually keep: **it never processes a suspect key in silence.**


class UnboundSinkError(Exception):
    """A sink asked to accept a line before a destination was bound to it."""


class BinaryFileLineSink:
    """The first production `LineSink`: it appends each accepted line to an open handle.

    IT DOES NOT OWN THE HANDLE, and that is the decision that keeps it honest. Opening,
    `fsync`-ing and renaming belong to whoever publishes atomically; a sink that opened its own
    file would have to decide when to close it, and the only correct answer to that is "when the
    publisher says so". So the sink counts and writes, and nothing else.

    The count is kept here as well as returned by `ingest_verified` because the two are
    INDEPENDENT observations of the same number: `ingest_verified` counts what it handed over,
    this counts what was received. A test compares them, which is what turns the sink from
    plumbing into a witness that the edge delivered what it says it delivered.
    """

    def __init__(self, handle: BinaryIO | None = None) -> None:
        """Bind a destination handle, or none yet, and start the count at zero."""
        self._handle = handle
        self.accepted = 0

    def bind(self, handle: BinaryIO) -> None:
        """Bind the destination handle for the publication about to happen, and reset the count."""
        self._handle = handle
        self.accepted = 0

    def accept(self, line: bytes) -> None:
        """Write one verified line, and count it.

        An unbound sink RAISES instead of buffering. A sink asked to accept a line with no
        destination has nowhere to put it, and inventing a buffer would mean silently holding
        verified data that nobody will ever read — a short series produced by helpfulness.
        """
        if self._handle is None:
            raise UnboundSinkError(
                "the sink has no destination bound: verified lines would be held in memory "
                "and lost, which is a short series produced silently"
            )
        self._handle.write(line)
        self.accepted += 1


class DumpIngestWorker:
    """Verify one dump object at the `.CHECKSUM` edge, then publish it atomically.

    WHERE THE ROUTING BARRIER ACTUALLY IS — AND THE FIRST VERSION OF THIS PARAGRAPH WAS WRONG.

    It claimed the barrier was the TYPE: *"they are refused because this worker only ever builds
    keys from a `DumpPartition`, and no REST source has one"*, and therefore *"there is no policy
    line anyone could delete"*. **`/qa` refuted the load-bearing half by measurement.**
    `process(self, key: str)` takes a `str`. A REST source planted at this edge
    (`worker.process("api/v3/exchangeInfo.json")`) passes **`ruff` "All checks passed!", `mypy
    --strict` "Success: no issues found in 23 source files", and `import-linter` `2 kept`**
    `[MEDIDO 2026-08-29]`. **No static gate barred it.** What refuses is the absent `.CHECKSUM`,
    at RUNTIME, with `ChecksumMissingError` — fail-closed, which is right, but it is the opposite
    of "by type".

    WHAT SURVIVED THE REFUTATION, because it is the part that was measured true: **through
    `run()` there is no path.** `dataset_by_name` resolves only `{aggTrades, bookDepth}` and
    every key is born from `DumpPartition.object_key`, so no REST response reaches this edge
    THROUGH THE COMPOSITION ROOT — only by hand-building the worker, and then it fails closed.

    SO THE BARRIER IS ONE LINE — `DATASETS_BY_NAME` in `domain/dump_window.py` — AND IT HAD NO
    TEST. `/qa` added `"exchangeInfo"` to that dict and the whole suite stayed GREEN (mutant
    `M08`). It is covered now by
    `test_the_dataset_vocabulary_is_exactly_the_two_the_dump_publishes`. A closed vocabulary
    nobody asserts is a convention, not a gate — which is the same lesson this repository
    already learned about tools that live only in a comment.

    `ADR-014/D3a` states the general rule (*"o que falha fechado e a AUSENCIA DE TESTEMUNHA
    DECLARADA, nao a ausencia de `.CHECKSUM`"*), and for the S3 dump the two formulations
    COINCIDE: its declared witness IS the `.CHECKSUM`. **`ADR-014` is status `proposto`**, so the
    general per-source registry it proposes is NOT built here.
    """

    def __init__(
        self,
        source_dir: Path,
        output_dir: Path,
        suspect_keys: frozenset[str] = frozenset(),
    ) -> None:
        """Bind the local mirror of the bucket, the publication directory, and the suspect set."""
        self._source_dir = source_dir
        self._output_dir = output_dir
        self._suspect_keys = suspect_keys

    def process(self, key: str) -> None:
        """Verify and publish `key`; raise without publishing anything if the digest disagrees.

        Raises:
            ChecksumRejectedError: any integrity verdict. Nothing was published, and the partial
                was removed.
            OSError: the object or its sidecar could not be read. Outside the integrity family
                on purpose — see the `Raises:` of `ingest_verified`, which explains why a batch
                should SKIP a corrupt object and DIE on a vanished path.

        """
        if key in self._suspect_keys:
            # NOT a refusal. `ADR-014/D3b` is explicit that the class-O gate produces a warning
            # and a record, NEVER a rejection: the 6,781 h of April 2024 are REAL data, and
            # refusing them would plant exactly the survivorship that `SPEC-001` §5.6 exists to
            # prevent. The objective is to stop the SILENCE, not to stop the write.
            logger.warning(
                "dump_object_window_suspect",
                extra={"etl_key": key, "reason": "last period before a 404 (ADR-014/A7)"},
            )

        payload = ChecksummedFilePayload(self._source_dir / key)
        destination = self._output_dir / f"{key}{OUTPUT_SUFFIX}"
        destination.parent.mkdir(parents=True, exist_ok=True)
        partial = destination.parent / f"{destination.name}{PARTIAL_SUFFIX}"
        sink = BinaryFileLineSink()
        try:
            with partial.open("wb") as handle:
                sink.bind(handle)
                delivered = ingest_verified(payload, sink)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(partial, destination)
        finally:
            partial.unlink(missing_ok=True)
        logger.info(
            "dump_object_published",
            extra={"etl_key": key, "lines": delivered, "accepted": sink.accepted},
        )
