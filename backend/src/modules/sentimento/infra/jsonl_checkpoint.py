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
    at that instant (`tests/sentimento/test_infrastructure_durability.py`, 2 tests; deleting
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
        """Return every recorded key, in order, with repetition kept.

        Repetition is not collapsed here, so that a repeated key stays measurable.

        DEBT CLOSED BY `T-03.10`, AND THE WORST CASE WAS THE SILENT ONE. Until 2026-08-29
        `CorruptedCheckpointError` covered only unreadable JSON, and a readable payload with the
        wrong SHAPE escaped the declared class `[MEDIDO 2026-08-28, n=4 payloads]`:
          `{"chave": "a.csv"}` -> `KeyError: 'key'`
          `5`                  -> `TypeError: 'int' object is not subscriptable`
          `["a.csv"]`          -> `TypeError: list indices must be integers or slices, not str`
          `{"key": null}`      -> raised NOTHING: it returned `('None',)`, because `str(None)`
                                  coerces.
        The last one is the one that mattered: a key literally named `None` was marked done IN
        SILENCE, and `EtlBacklog.pending` would then raise `CheckpointOutsideWindowError` on a
        key nobody can find in the bucket — the symptom appearing one layer away from the cause.

        WHY IT IS FIXED NOW, and it is not tidiness: the reason it was deferred was written as
        *"today only an EXTERNAL writer produces those payloads — in this tree the only writer is
        `record()`"*. `T-03.10` ends that. The checkpoint now sits in an operator-facing
        `<workdir>/` next to `probe.jsonl` and `findings.jsonl`, and resuming a partially drained
        window is a thing an operator DOES — by hand, with an editor, at the moment the queue is
        already known to have died. `_key_of` below turns all four payloads into the declared
        class, so a caller written as `except CorruptedCheckpointError` catches what the
        docstring of that class promises.
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
            keys.append(self._key_of(payload, numero))
        return tuple(keys)

    def _key_of(self, payload: object, number: int) -> str:
        """Extract the key from one decoded line, refusing every shape that is not `{"key": str}`.

        NO COERCION ANYWHERE, and that is the whole fix. `str(payload["key"])` was the defect:
        it turned `null` into the four-character string `None` and reported success. A checkpoint
        line is a claim that a unit of work is DONE, and a claim that cannot be read is not a
        weaker claim — it is a different kind of thing, and it fails closed.
        """
        if not isinstance(payload, dict):
            raise CorruptedCheckpointError(
                f"linha {number} de {self._path} e {type(payload).__name__}, nao um objeto"
            )
        if "key" not in payload:
            raise CorruptedCheckpointError(
                f"linha {number} de {self._path} nao tem o campo 'key': {sorted(payload)}"
            )
        key = payload["key"]
        if not isinstance(key, str) or not key:
            raise CorruptedCheckpointError(
                f"linha {number} de {self._path} traz 'key' = {key!r} "
                f"({type(key).__name__}); so uma cadeia nao vazia nomeia trabalho concluido"
            )
        return key

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
