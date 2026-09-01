"""Persist the raw capture: gzip JSON, dated BY FILE NAME, `received_at` carried inside."""

# Plan `02`, item 2.1, `D2.1`: "grava a data no proprio nome/metadado do snapshot" — a filename
# that ENCODES the date means a directory listing alone answers "data(ultimo snapshot) == hoje"
# (`latest_snapshot_date`), without opening a single file. Re-running the SAME day overwrites the
# SAME path: the collector is IDEMPOTENT by construction — safe for a `cron` that runs once a day
# and safe for an operator to re-run by hand (plan `02`, header: "um `cron` num host que dorme
# perde no maximo o dia em que dormiu").
#
# Plan `02`, "Nao faz": "grava cru + `received_at`. Nao normaliza." The three payloads
# (`exchangeInfo`/`fundingInfo`/`premiumIndex`, exactly as `json.loads` decoded them, no field
# dropped) go in WHOLE. `domain/instrument_universe_snapshot.py`'s per-symbol projection is
# derived FROM this file on read (`build_instrument_rows`), never computed once here and thrown
# away — a query written next month reads the SAME raw bytes this module wrote today.

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Final, TypedDict, cast

from src.modules.sentimento.domain.instrument_universe_snapshot import (
    ExchangeInfoPayload,
    FundingInfoEntry,
    PremiumIndexEntry,
)

FILENAME_PREFIX: Final[str] = "instrument-universe-"
FILENAME_SUFFIX: Final[str] = ".json.gz"


class RawInstrumentUniverseCapture(TypedDict):
    """The whole artifact: three raw payloads plus the two timestamps that frame them."""

    captured_on: str
    received_at: str
    exchange_info: ExchangeInfoPayload
    funding_info: list[FundingInfoEntry]
    premium_index: list[PremiumIndexEntry]


def snapshot_path(directory: Path, captured_on: str) -> Path:
    """Return the path a snapshot for `captured_on` lives (or would be written) at."""
    return directory / f"{FILENAME_PREFIX}{captured_on}{FILENAME_SUFFIX}"


def write_snapshot(directory: Path, capture: RawInstrumentUniverseCapture) -> Path:
    """Write `capture` gzip-compressed at its dated path, creating `directory` if needed.

    Overwrites without asking: a second run on the SAME `captured_on` (an operator re-running
    by hand, or a `cron` firing twice) replaces the file rather than erroring, which is exactly
    the idempotence `D2.1` asks the collector to have.
    """
    directory.mkdir(parents=True, exist_ok=True)
    path = snapshot_path(directory, capture["captured_on"])
    raw = json.dumps(capture, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    path.write_bytes(gzip.compress(raw))
    return path


def read_snapshot(path: Path) -> RawInstrumentUniverseCapture:
    """Read one gzip-compressed snapshot back into the shape it was written in."""
    raw = gzip.decompress(path.read_bytes())
    return cast("RawInstrumentUniverseCapture", json.loads(raw))


def dated_snapshots(directory: Path) -> tuple[str, ...]:
    """Return every `captured_on` this directory holds, parsed from file names, sorted.

    An empty or absent `directory` returns `()` rather than raising — "no snapshot has ever
    been written here" is a fact about the directory's history, not a defect in reading it.
    """
    if not directory.is_dir():
        return ()
    dates = [
        entry.name[len(FILENAME_PREFIX) : -len(FILENAME_SUFFIX)]
        for entry in directory.iterdir()
        if entry.name.startswith(FILENAME_PREFIX) and entry.name.endswith(FILENAME_SUFFIX)
    ]
    return tuple(sorted(dates))


def latest_snapshot_date(directory: Path) -> str | None:
    """Return the most recent `captured_on` this directory holds, or `None` if it holds none.

    This is what makes `D2.1` ("`data(ultimo snapshot) == hoje` por 7 dias consecutivos")
    trivial to check once the collector has been operated for a week: `latest_snapshot_date(d)
    == date.today().isoformat()`, read straight off the file names.
    """
    dates = dated_snapshots(directory)
    return dates[-1] if dates else None
