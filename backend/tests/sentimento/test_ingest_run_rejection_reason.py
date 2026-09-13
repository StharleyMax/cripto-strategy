"""`T-05.6` / `RF-6` / `RS-4`: a `REJECTED` run cannot exist without a reason.

THE STATE THIS FILE EXISTS TO MAKE IMPOSSIBLE, measured before it was written:

    select run_id, endpoint, verdict, coalesce(api_code::text,'NULL'), n_written, started_at
      from md.ingest_run where verdict='REJECTED' order by started_at;
    -> `[MEDIDO 2026-09-12, n=6 runs REJECTED]`: 6 of 6 with `api_code` NULL
       (5 from `!forceOrder@arr`, 1 from `/fapi/v1/klines` at 2026-09-11T01:40Z)

And the other half of `DoD 5` was worse than unmet — it was UNSATISFIABLE. There was no `notes`
anywhere: not a column of `md.ingest_run` (17 names, none of them `notes`), not a field of
`IngestRun`, not a write `[MEDIDO 2026-09-12]`. Nothing could ever have failed it.
"""

from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

import pytest

from src.modules.sentimento.domain.ingest_record import (
    INGEST_HEALTH_RUN_COLUMNS,
    IngestHealthReport,
    IngestRun,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.collector_run_mapping import (
    RejectionWithoutReasonError,
    build_force_order_run,
    build_klines_run,
    build_liquidation_history_run,
    build_long_short_run,
    build_open_interest_run,
    build_premium_index_run,
    require_rejection_reason,
)

_STARTED_AT = "2026-09-12T14:00:00.000Z"
_ENDED_AT = "2026-09-12T14:05:00.000Z"
_SHA = hashlib.sha256(b"body").hexdigest()


def _run(**overrides: object) -> IngestRun:
    """Build a complete `IngestRun` with every field named, so a test overrides only one."""
    base: dict[str, object] = {
        "run_id": "run-1",
        "source": "coinalyze",
        "endpoint": "/v1/liquidation-history",
        "window": f"{_STARTED_AT}/{_ENDED_AT}",
        "n_expected": 3,
        "n_returned": 3,
        "n_written": 0,
        "verdict": "ACCEPTED",
        "api_code": None,
        "src_sha256": _SHA,
        "weight_used": 4,
        "observer_id": "liquidation-collector",
        "observer_region": "UNKNOWN",
        "clock_skew_ms": -2_147_483_648,
        "started_at": _STARTED_AT,
        "ended_at": _ENDED_AT,
    }
    base.update(overrides)
    return IngestRun(**base)  # type: ignore[arg-type]


# ── THE FIELD EXISTS AT ALL ───────────────────────────────────────────────────────────────


def test_a_run_carries_notes_and_it_defaults_to_none() -> None:
    """The half of `DoD 5` that was unsatisfiable by construction now has somewhere to live."""
    assert _run().notes is None
    assert _run(notes="Redis went away").notes == "Redis went away"


def test_notes_is_not_one_of_the_fifteen_contract_columns() -> None:
    """⛔ THE FINGERPRINT MUST NOT MOVE. `ADR-008/DoD-2` compares `sha256` of the projection.

    `INGEST_HEALTH_RUN_COLUMNS` is a contract whose ORDER feeds that hash, and
    `_project_run_dict` walks THAT tuple rather than `dataclasses.fields(IngestRun)` — the same
    mechanism `writer_accounted_at` (`ADR-035/D2`) relies on. If `notes` had been appended to
    the tuple, every report ever emitted would have a different fingerprint and two sides
    comparing hashes to prove they agree would start disagreeing with nothing to point at.
    """
    assert "notes" not in INGEST_HEALTH_RUN_COLUMNS
    assert len(INGEST_HEALTH_RUN_COLUMNS) == 15


def test_adding_notes_does_not_move_the_canonical_fingerprint() -> None:
    """The measurement behind the paragraph above, run rather than asserted in prose."""
    without = IngestHealthReport(runs=(_run(),), gaps=())
    with_notes = IngestHealthReport(runs=(_run(notes="a reason"),), gaps=())
    assert with_notes.fingerprint() == without.fingerprint()
    assert with_notes.canonical_projection() == without.canonical_projection()


# ── THE GUARD BITES ───────────────────────────────────────────────────────────────────────


def test_a_rejected_run_with_no_api_code_and_no_notes_is_refused() -> None:
    """THE MUTATION, direct: the exact shape all 6 production rejections have."""
    with pytest.raises(RejectionWithoutReasonError, match="REJECTED run must carry"):
        require_rejection_reason("REJECTED", None, None)


def test_either_reason_alone_satisfies_the_rule() -> None:
    """The rule is about the PAIR — a provider code OR a note, never both required."""
    require_rejection_reason("REJECTED", 429, None)
    require_rejection_reason("REJECTED", None, "Redis went away")


def test_an_accepted_run_is_never_asked_for_a_reason() -> None:
    """THE CALA HALF: demanding prose from a clean run would manufacture text nobody wrote."""
    require_rejection_reason("ACCEPTED", None, None)
    require_rejection_reason("ACCEPTED_WITH_WARNING", None, None)


def test_every_builder_refuses_a_reasonless_rejection() -> None:
    """All six producers, including the five that predate this rule.

    This is the test that would have failed on 2026-09-11, and the reason the debt grew from
    2 of 2 to 6 of 6 while the phase was being planned: the rule was prose, and prose has 0%
    adherence without a gate.
    """
    digest = hashlib.sha256(b"frame")
    with pytest.raises(RejectionWithoutReasonError):
        build_force_order_run(_STARTED_AT, _ENDED_AT, 0, "REJECTED", digest)
    with pytest.raises(RejectionWithoutReasonError):
        build_premium_index_run(_STARTED_AT, _ENDED_AT, 0, None, None, "REJECTED", _SHA)
    for builder in (build_klines_run, build_open_interest_run, build_long_short_run):
        with pytest.raises(RejectionWithoutReasonError):
            builder(
                started_at=_STARTED_AT,
                ended_at=_ENDED_AT,
                n_returned=0,
                n_calls=0,
                api_code=None,
                verdict="REJECTED",
                src_sha256=_SHA,
            )
    with pytest.raises(RejectionWithoutReasonError):
        build_liquidation_history_run(
            started_at=_STARTED_AT,
            ended_at=_ENDED_AT,
            n_returned=0,
            n_calls=0,
            api_code=None,
            verdict="REJECTED",
            src_sha256=_SHA,
        )


def test_a_rejection_that_names_its_reason_is_built_and_carries_it() -> None:
    """The CALA half of the guard: a caller that says why is never blocked."""
    run = build_liquidation_history_run(
        started_at=_STARTED_AT,
        ended_at=_ENDED_AT,
        n_returned=0,
        n_calls=0,
        api_code=None,
        verdict="REJECTED",
        src_sha256=_SHA,
        notes="ConnectionResetError: the queue went away",
    )
    assert run.verdict == "REJECTED"
    assert run.notes is not None
    assert run.api_code is None


# ── THE REASON SURVIVES A ROUND TRIP THROUGH THE STORE ────────────────────────────────────


def test_notes_round_trips_through_the_record_store(tmp_path: Path) -> None:
    """A reason that lived only in memory would be a `logger.error` with extra steps.

    The five production rejections DID have their cause printed — `logger.error` carried the
    exception at every one of those sites. It went to stderr, rotated away, and the record an
    operator reads a week later said nothing. Persisting it is the whole point.
    """
    store = SqliteIngestRecordStore(tmp_path / "record.sqlite3")
    store.initialise()
    store.record_run(_run(verdict="REJECTED", notes="ConnectionResetError: peer went away"))
    (persisted,) = store.runs()
    assert persisted.verdict == "REJECTED"
    assert persisted.notes == "ConnectionResetError: peer went away"


def test_the_stored_column_is_named_notes(tmp_path: Path) -> None:
    """The column exists under that exact name — the `DoD 5` query reads it by name."""
    path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(path)
    store.initialise()
    with sqlite3.connect(path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(md_ingest_run)")}
    assert "notes" in columns


def test_the_dod_5_query_finds_nothing_when_every_rejection_names_a_reason(
    tmp_path: Path,
) -> None:
    """`DoD 5` itself, run against a store: no `REJECTED` with BOTH reasons null.

    The universe is every run in the store, which is what the phase's DoD says — and the store
    is seeded with the two legitimate shapes (a provider code, and a note) plus an accepted run
    that has neither, so a query that merely counted nulls would fail here and a correct one
    passes.
    """
    store = SqliteIngestRecordStore(tmp_path / "record.sqlite3")
    store.initialise()
    store.record_run(_run(run_id="a", verdict="REJECTED", api_code=429))
    store.record_run(_run(run_id="b", verdict="REJECTED", notes="Redis went away"))
    store.record_run(_run(run_id="c", verdict="ACCEPTED"))
    offenders = [
        run
        for run in store.runs()
        if run.verdict == "REJECTED" and run.api_code is None and run.notes is None
    ]
    assert offenders == []
