"""`instrument_universe_snapshot_store`: dated file name, gzip round trip, `D2.1` idempotence.

`D2.1` ("`data(ultimo snapshot) == hoje` por 7 dias consecutivos") is an OPERATIONAL
measurement this task's scope does not run — `T-02.1/handoff.md` names it explicitly as
pending on real deploy. What this module makes true TODAY, and what this test proves, is the
STRUCTURAL half: the collector is idempotent and the date is trivially readable off the
directory, so the 7-day check costs nothing to run once there is a week of history.
"""

from __future__ import annotations

from pathlib import Path

from src.modules.sentimento.infra.instrument_universe_snapshot_store import (
    RawInstrumentUniverseCapture,
    dated_snapshots,
    latest_snapshot_date,
    read_snapshot,
    snapshot_path,
    write_snapshot,
)


def _capture(captured_on: str) -> RawInstrumentUniverseCapture:
    """Build a minimal, valid capture for `captured_on` — content is not this test's subject."""
    return {
        "captured_on": captured_on,
        "received_at": f"{captured_on}T00:00:00+00:00",
        "exchange_info": {"symbols": [{"symbol": "BTCUSDT", "underlyingSubType": ["PoW"]}]},
        "funding_info": [{"symbol": "BTCUSDT", "fundingIntervalHours": 8}],
        "premium_index": [{"symbol": "BTCUSDT", "interestRate": "0.0001"}],
    }


def test_write_then_read_round_trips_exactly(tmp_path: Path) -> None:
    """What comes back out is byte-for-byte the same structure that went in."""
    capture = _capture("2026-09-01")
    path = write_snapshot(tmp_path, capture)

    assert path == snapshot_path(tmp_path, "2026-09-01")
    assert read_snapshot(path) == capture


def test_the_file_name_encodes_the_date_d2_1() -> None:
    """`D2.1`: the date lives in the NAME, not only inside the (gzip-opaque) content."""
    path = snapshot_path(Path("/anywhere"), "2026-09-01")
    assert path.name == "instrument-universe-2026-09-01.json.gz"


def test_writing_the_same_day_twice_overwrites_instead_of_duplicating(tmp_path: Path) -> None:
    """Idempotence: a `cron` firing twice the same day (or an operator re-running) is safe."""
    write_snapshot(tmp_path, _capture("2026-09-01"))
    second = _capture("2026-09-01")
    second["received_at"] = "2026-09-01T12:00:00+00:00"  # a later run, same day
    path = write_snapshot(tmp_path, second)

    assert dated_snapshots(tmp_path) == ("2026-09-01",)
    assert read_snapshot(path)["received_at"] == "2026-09-01T12:00:00+00:00"


def test_dated_snapshots_is_empty_for_a_directory_that_does_not_exist_yet(tmp_path: Path) -> None:
    """No snapshot has ever been written here — a fact, not a defect in reading it."""
    absent = tmp_path / "never-created"
    assert dated_snapshots(absent) == ()
    assert latest_snapshot_date(absent) is None


def test_latest_snapshot_date_is_the_most_recent_of_several(tmp_path: Path) -> None:
    """`D2.1` reads exactly this: `latest_snapshot_date(dir) == date.today().isoformat()`."""
    for day in ("2026-08-30", "2026-08-31", "2026-09-01"):
        write_snapshot(tmp_path, _capture(day))

    assert dated_snapshots(tmp_path) == ("2026-08-30", "2026-08-31", "2026-09-01")
    assert latest_snapshot_date(tmp_path) == "2026-09-01"


def test_write_snapshot_creates_the_directory_if_it_does_not_exist(tmp_path: Path) -> None:
    """An operator's first run should not need to `mkdir` by hand first."""
    target = tmp_path / "snapshots" / "nested"
    write_snapshot(target, _capture("2026-09-01"))
    assert target.is_dir()
    assert dated_snapshots(target) == ("2026-09-01",)


def test_dated_snapshots_ignores_files_that_do_not_match_the_naming_convention(
    tmp_path: Path,
) -> None:
    """A stray file in the directory does not get parsed as a date."""
    write_snapshot(tmp_path, _capture("2026-09-01"))
    (tmp_path / "README.txt").write_text("not a snapshot", encoding="utf-8")
    (tmp_path / "instrument-universe-2026-09-02.json").write_text("wrong suffix", encoding="utf-8")

    assert dated_snapshots(tmp_path) == ("2026-09-01",)
