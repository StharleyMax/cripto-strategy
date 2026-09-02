"""Durable raw sink for `premiumIndex` cycles: one JSON line per symbol, `fsync` before return."""

# Same durability contract as `jsonl_checkpoint.py`: `flush()` + `os.fsync()` BEFORE `write()`
# returns, so a line that returned successfully is not merely in the page cache. This module
# does not reuse `JsonlCheckpoint` itself — that class's `record()` writes a single `{"key":
# ...}` shape and `entries()`/`done()` read it back as a checkpoint of COMPLETED WORK ITEMS,
# which is a different contract from "append one row of market data per symbol". Duplicating
# the two-line `open/write/flush/fsync` body was judged cheaper and clearer than bending
# `JsonlCheckpoint`'s shape to carry a payload it was not designed to hold; a `/review` that
# disagrees has a two-line diff to point at.

from __future__ import annotations

import json
import os
from pathlib import Path

from src.modules.sentimento.domain.premium_index_batch import PremiumIndexReading


class PremiumIndexJsonlSink:
    """Append-only raw storage: every symbol of every cycle, stamped with `received_at`.

    ONE LINE PER SYMBOL, not one line per batch: a reader that wants "the last reading of
    BTCUSDT" should not have to parse every other symbol's row out of the same line first, and
    the plan's "Nao faz" (no shift, no normalization) says nothing against making rows
    independently readable.
    """

    def __init__(self, path: Path) -> None:
        """Bind the sink to `path`; nothing is read or written here."""
        self._path = path

    @property
    def path(self) -> Path:
        """Return the file this sink appends to."""
        return self._path

    def write(self, received_at: int, readings: tuple[PremiumIndexReading, ...]) -> None:
        """Append every reading of one cycle as raw JSON lines, then `flush` and `fsync` once.

        One `fsync` per CYCLE rather than per symbol: `readings` all arrived in the same HTTP
        response, so they are one unit of durability — either the whole cycle is on disk or the
        write is retried, never half a batch silently missing its symbols after a crash.
        """
        self._path.parent.mkdir(parents=True, exist_ok=True)
        lines = "".join(
            json.dumps(_project(received_at, reading), ensure_ascii=False) + "\n"
            for reading in readings
        )
        with self._path.open("a", encoding="utf-8") as handle:
            handle.write(lines)
            handle.flush()
            os.fsync(handle.fileno())


def _project(received_at: int, reading: PremiumIndexReading) -> dict[str, object]:
    """Flatten one reading next to the cycle's `received_at`, keeping every field raw."""
    return {
        "received_at": received_at,
        "symbol": reading.symbol,
        "mark_price_raw": reading.mark_price_raw,
        "index_price_raw": reading.index_price_raw,
        "estimated_settle_price_raw": reading.estimated_settle_price_raw,
        "last_funding_rate_raw": reading.last_funding_rate_raw,
        "interest_rate_raw": reading.interest_rate_raw,
        "next_funding_time": reading.next_funding_time,
        "source_time": reading.source_time,
    }
