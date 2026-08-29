"""Durable checkpoint in append-only JSONL: `fsync` per line, truncated tail discarded."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class CorruptedCheckpointError(Exception):
    """A COMPLETE line that cannot be read: corruption. A tail with no newline is tolerated."""


class JsonlCheckpoint:
    """One line per completed item, with `flush` + `fsync` BEFORE `record` returns.

    WHAT THIS SUITE MEASURES `[MEDIDO 2026-08-28: bash backend/scripts/test.sh -> 14 passed,
    rc=0]`: that `os.fsync` is called once per line, and that the line is ALREADY in the file
    at that instant (`tests/sentimento/test_durabilidade_da_infra.py`, 2 tests; deleting
    `flush`+`fsync` from both `infra` modules makes both FAIL `[MEDIDO 2026-08-28: 2 failed,
    12 passed]`).

    WHAT THE `SIGKILL` OF THE `D3.1` TEST DOES NOT EXERCISE: after the `close()` of the `with`,
    the bytes sit in the KERNEL page cache; `SIGKILL` kills the process and the kernel survives,
    so the page cache survives with it — `D3.1` would pass with no `fsync` at all. What the
    `fsync` buys is surviving POWER LOSS / KERNEL PANIC, and that is `[NAO MEDIDO]`: no test in
    this suite cuts power, brings the kernel down or inspects the block device. The guarantee
    against power loss is claimed by the `fsync(2)` contract, not by a measurement of this
    repository.
    """

    def __init__(self, path: Path) -> None:
        """Bind the checkpoint to `path`; nothing is read or written here."""
        self._path = path

    @property
    def path(self) -> Path:
        """Return the file this checkpoint appends to."""
        return self._path

    def entries(self) -> tuple[str, ...]:
        """Return every recorded key, in order — repetition included, so it stays measurable.

        NAMED DEBT — the error classification is INCOMPLETE, and `CorruptedCheckpointError`
        only covers unreadable JSON. A readable payload with the wrong shape escapes the
        declared class `[MEDIDO 2026-08-28, universo 4 payloads, backend/.venv/bin/python
        against this module]`:
          `{"chave": "a.csv"}` -> `KeyError: 'key'`
          `5`                  -> `TypeError: 'int' object is not subscriptable`
          `["a.csv"]`          -> `TypeError: list indices must be integers or slices, not str`
          `{"key": null}`      -> raises NOTHING: it returns `('None',)`, because `str(None)`
                                  coerces.
        The last one is the worst: a key named `None` would be marked done IN SILENCE, and that
        defeats the "never loses" invariant by coercion.

        WHY IT IS NOT FIXED HERE: today only an EXTERNAL writer produces those payloads — in
        this tree the only writer is `record()`, which emits `{"key": <str>}` and nothing else.
        The queue that exposes the file to an outside writer is `T-03.10` (CST-26, "fila de ETL
        do dump retomavel"); that is where shape validation has an owner. It is NOT `T-03.11`,
        which is the daily liquidation reconciliation and is `blocked` by `Q1` — debt parked
        there never reaches whoever writes the queue.
        """
        if not self._path.exists():
            return ()
        raw = self._path.read_bytes()
        if not raw:
            return ()
        lines = raw.split(b"\n")
        tail = lines.pop()
        if tail:
            logger.warning("checkpoint_cauda_truncada", extra={"bytes_descartados": len(tail)})
        keys: list[str] = []
        for numero, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                raise CorruptedCheckpointError(f"linha {numero} ilegivel em {self._path}") from exc
            keys.append(str(payload["key"]))
        return tuple(keys)

    def done(self) -> frozenset[str]:
        """Return the recorded keys as a set, repetition collapsed."""
        return frozenset(self.entries())

    def record(self, key: str) -> None:
        """Append the key, then `flush` and `fsync`.

        Without the `fsync` the line would live only in the page cache.
        """
        self._path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps({"key": key}, ensure_ascii=False) + "\n"
        with self._path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
            os.fsync(handle.fileno())
