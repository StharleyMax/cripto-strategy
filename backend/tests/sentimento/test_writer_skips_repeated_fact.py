"""`T-06.4`: the single writer stops persisting an observation that repeats its predecessor.

Norm: `docs/context/paineis-de-fluxo/handoff/T-06.4-prova.md` (the predicate of §1.2/§1.5,
`n_written` of §2) over `handoff/T-06.3-desenho.md` §4 ("T-06.4", tests 1-5).

WHAT EACH GROUP PROVES, AND WHICH ABLATION IT ANSWERS TO:

* **MORDE** — a repeat is skipped and never reaches the sink; every column of the fact, changed
  alone, makes the row a NEW fact that is written; an earlier `available_at` makes it new too.
  Ablation: `repeats_predecessor_fact` returning `False` turns the skip tests red.
* **predecessor imediato** — `X, 0, X` keeps all three rows, so `T-05.2`'s falsifier `F-1`
  ("a `0` observed before a non-zero of the same bucket") still accuses the bucket. Ablation:
  the "any earlier equal fact" form drops the 2nd `X` and `F-1` goes silent.
* **CALA, `as_of`** — `as_of_batch` over the store the writer built and over the raw list of
  every candidate answers the same, bit for bit, on a grid of `K` that includes `K` between the
  1st and the 2nd observation. Ablation: always `False` keeps it green (it tests invariance,
  not the mechanism); dropping the `available_at` term turns it red on the §1.3 counterexample.
* **crédito** — a run whose rows are all repeats closes with `n_written = 0`, never with the
  number of rows offered (`ADR-035/D1`, `T-06.4-prova.md` §2).
"""

from __future__ import annotations

import dataclasses
import logging
import threading
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Final

import pytest

from src.modules.sentimento.domain.as_of_accessor import (
    BarPolicy,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    as_of,
    as_of_batch,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.repeated_fact import (
    FACT_COLUMNS,
    RecordedObservation,
    repeats_predecessor_fact,
)
from src.modules.sentimento.domain.series_key import SeriesKey
from src.modules.sentimento.infra.single_writer_cli import run
from src.modules.sentimento.use_cases.run_single_writer import QueuedSeriesRow
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
from src.modules.sentimento.use_cases.write_series_row import WriteOutcome, write_series_row

_OPEN_INTEREST_ID: Final = "94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9"
_STEP_MS: Final = 60_000
_BUCKET_MS: Final = 1_787_443_499_999
_EVENT_MS: Final = 1_787_443_500_000


def _series() -> SeriesKey:
    entry = list_pilot_series_catalog().entry_for_id(_OPEN_INTEREST_ID)
    assert entry is not None, "the open-interest series left the pilot catalog"
    return entry.key


def _row(**overrides: object) -> SeriesRow:
    """One valid row of the pilot open-interest series; `observed_at` is the knob tests turn."""
    columns: dict[str, object] = {
        "series_key_id": _OPEN_INTEREST_ID,
        "symbol": "BTCUSDT",
        "source": "binance_daily_metrics",
        "bucket_end": _BUCKET_MS,
        "event_time": _EVENT_MS,
        "available_at": _EVENT_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": _EVENT_MS + 46_000,
        "observed_at": _EVENT_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "2026-08-23 00:00:00",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
        "value_raw": "1.0",
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


def _later(row: SeriesRow, delta_ms: int, **overrides: object) -> SeriesRow:
    """Return the same row observed `delta_ms` later — `available_at` moves with it (a re-poll)."""
    return dataclasses.replace(
        row,
        observed_at=row.observed_at + delta_ms,
        ingested_at=row.ingested_at + delta_ms,
        available_at=row.available_at + delta_ms,
        **overrides,  # type: ignore[arg-type]
    )


def _bucket(row: SeriesRow) -> tuple[str, str, str, int]:
    return (row.series_key_id, row.symbol, row.source, row.bucket_end)


@dataclass
class _MemoryStore:
    """`ObservedLookup` + `SeriesSink` over one list — the PK upsert-noop included."""

    rows: list[SeriesRow] = field(default_factory=list)

    def observed_already_present(self, row: SeriesRow) -> bool:
        """`D7.16`'s question, answered from the list."""
        return any(
            _bucket(r) == _bucket(row) and r.provenance is Provenance.OBSERVED for r in self.rows
        )

    def immediate_predecessor(self, row: SeriesRow) -> RecordedObservation | None:
        """Return the bucket's row with the greatest `observed_at` below the candidate's."""
        earlier = [
            r for r in self.rows if _bucket(r) == _bucket(row) and r.observed_at < row.observed_at
        ]
        if not earlier:
            return None
        return RecordedObservation.of(max(earlier, key=lambda r: r.observed_at))

    def accept(self, row: SeriesRow) -> None:
        """Insert unless the primary key is already there (`ON CONFLICT DO NOTHING`)."""
        key = (*_bucket(row), row.observed_at)
        if not any((*_bucket(r), r.observed_at) == key for r in self.rows):
            self.rows.append(row)


def _write_all(candidates: list[SeriesRow]) -> tuple[_MemoryStore, list[WriteOutcome]]:
    store = _MemoryStore()
    outcomes = [write_series_row(c, lookup=store, sink=store) for c in candidates]
    return store, outcomes


# ── MORDE ──────────────────────────────────────────────────────────────────────────────────


def test_a_repeat_of_the_predecessor_is_skipped_and_never_reaches_the_sink() -> None:
    """Test 1 of `T-06.3-desenho.md` §4: same fact, `observed_at` later ⇒ skipped, sink has 1."""
    first = _row()
    store, outcomes = _write_all([first, _later(first, 300_000), _later(first, 600_000)])

    assert outcomes == [
        WriteOutcome.ACCEPTED,
        WriteOutcome.SKIPPED_IDENTICAL_FACT,
        WriteOutcome.SKIPPED_IDENTICAL_FACT,
    ]
    assert store.rows == [first]


_CHANGED_FACT: Final[dict[str, object]] = {
    "series_key_id": "b" * 64,
    "symbol": "ETHUSDT",
    "source": "binance_premium_index",
    "bucket_end": _BUCKET_MS + _STEP_MS,
    "event_time": _EVENT_MS + 1,
    "is_final": None,
    "value_raw": "2.0",
    "provenance": Provenance.DERIVED.value,
    "availability_source": AvailabilitySource.MODELED.value,
    "principal_id": "owner",
    "src_label_raw": "2026-08-23 00:05:00",
    "observer_id": "vps-02",
    "observer_region": "eu-central",
}


def test_the_changed_fact_table_covers_every_fact_column() -> None:
    """The parametrisation below is over THIS dict — a 14th fact column must enter it."""
    assert tuple(_CHANGED_FACT) == FACT_COLUMNS


@pytest.mark.parametrize("column", FACT_COLUMNS)
def test_a_predecessor_differing_in_any_fact_column_is_not_a_repeat(column: str) -> None:
    """Domain level, all 13 columns: one column changed alone ⇒ a NEW fact."""
    candidate = _later(_row(), 300_000)
    same = RecordedObservation.of(_row())
    assert repeats_predecessor_fact(candidate, same) is True

    changed = dataclasses.replace(same, **{column: _CHANGED_FACT[column]})  # type: ignore[arg-type]

    assert repeats_predecessor_fact(candidate, changed) is False


_IN_BUCKET_CHANGES: Final[tuple[tuple[str, object], ...]] = (
    ("event_time", _EVENT_MS + 1),
    ("is_final", False),
    ("is_final", None),
    ("value_raw", "1.5"),
    ("provenance", Provenance.DERIVED),
    ("availability_source", AvailabilitySource.MODELED),
    ("principal_id", "owner"),
    ("src_label_raw", "2026-08-23 00:00:01"),
    ("observer_id", "vps-02"),
    ("observer_region", "eu-central"),
)


@pytest.mark.parametrize(("column", "value"), _IN_BUCKET_CHANGES)
def test_a_new_value_in_any_in_bucket_fact_column_is_written(column: str, value: object) -> None:
    """Use-case level: a re-poll that changed one column of the fact reaches the sink."""
    first = _row()
    store, outcomes = _write_all([first, _later(first, 300_000, **{column: value})])

    assert outcomes == [WriteOutcome.ACCEPTED, WriteOutcome.ACCEPTED]
    assert len(store.rows) == 2


def test_an_earlier_available_at_makes_the_same_value_a_new_row() -> None:
    """Test 2: the §1.3 counterexample — the new row would win at a `K` the old one does not."""
    first = _row(observed_at=_EVENT_MS + 10, available_at=_EVENT_MS + 100)
    early = _row(observed_at=_EVENT_MS + 20, available_at=_EVENT_MS + 30)
    store, outcomes = _write_all([first, early])

    assert outcomes == [WriteOutcome.ACCEPTED, WriteOutcome.ACCEPTED]
    assert store.rows == [first, early]


def test_an_equal_available_at_still_dominates() -> None:
    """`≤`, not `<`: `available_at` equal and `observed_at` later is a repeat."""
    first = _row()
    same_available = dataclasses.replace(first, observed_at=first.observed_at + 1)
    _, outcomes = _write_all([first, same_available])

    assert outcomes == [WriteOutcome.ACCEPTED, WriteOutcome.SKIPPED_IDENTICAL_FACT]


def test_a_redelivery_of_the_same_row_is_not_judged_a_repeat_of_itself() -> None:
    """Same `observed_at` is not a predecessor: the redelivery reaches `ON CONFLICT DO NOTHING`."""
    first = _row()
    store, outcomes = _write_all([first, first])

    assert outcomes == [WriteOutcome.ACCEPTED, WriteOutcome.ACCEPTED]
    assert store.rows == [first]


def test_a_predecessor_at_or_after_the_candidate_is_never_a_repeat() -> None:
    """The domain re-checks the port contract: a broken port cannot drop a same-instant row."""
    candidate = _row()
    assert repeats_predecessor_fact(candidate, RecordedObservation.of(candidate)) is False
    assert repeats_predecessor_fact(candidate, None) is False


def test_modeled_over_observed_is_refused_before_the_repeat_is_considered() -> None:
    """`D7.16` first: a MODELED repeat in an OBSERVED bucket is REJECTED, not SKIPPED."""
    observed = _row()
    modeled = _row(provenance=Provenance.MODELED, observed_at=_EVENT_MS + 50_000)
    repeat = _later(modeled, 300_000)
    store = _MemoryStore(rows=[observed, modeled])

    outcome = write_series_row(repeat, lookup=store, sink=store)

    assert outcome is WriteOutcome.REJECTED_MODELED_OVER_OBSERVED


# ── T-05.2: the zero, and the `X, 0, X` pattern `F-1` accuses ─────────────────────────────


def _f1_accuses(rows: list[SeriesRow]) -> bool:
    """`T-05.2-desenho.md` §6, F-1: a `0` observed before a non-zero of the same bucket."""
    return any(
        z.value_raw == "0" and n.value_raw != "0" and z.observed_at < n.observed_at
        for z in rows
        for n in rows
        if _bucket(z) == _bucket(n)
    )


def test_x_zero_x_keeps_all_three_rows_and_f1_still_accuses() -> None:
    """§1.5: the 2nd `X` repeats the 1st but NOT its immediate predecessor (`0`) ⇒ written."""
    x = _row(value_raw="5")
    zero = _later(x, 300_000, value_raw="0")
    x_again = _later(x, 600_000)
    store, outcomes = _write_all([x, zero, x_again])

    assert outcomes == [WriteOutcome.ACCEPTED] * 3
    assert [r.value_raw for r in store.rows] == ["5", "0", "5"]
    assert _f1_accuses(store.rows) is True


def test_the_zero_of_t052_is_written_once_and_its_republication_is_skipped() -> None:
    """The 1st zero of a minute is written; the zero re-published after a reboot is not."""
    zero = _row(value_raw="0")
    store, outcomes = _write_all([zero, _later(zero, 300_000)])

    assert outcomes == [WriteOutcome.ACCEPTED, WriteOutcome.SKIPPED_IDENTICAL_FACT]
    assert store.rows == [zero]


def test_a_non_zero_after_a_zero_is_written() -> None:
    """A value after a zero is a new fact: `ZL-2` and `F-1` do not change."""
    zero = _row(value_raw="0")
    store, outcomes = _write_all([zero, _later(zero, 300_000, value_raw="7")])

    assert outcomes == [WriteOutcome.ACCEPTED, WriteOutcome.ACCEPTED]
    assert [r.value_raw for r in store.rows] == ["0", "7"]


def test_a_value_revision_is_written_and_only_its_repetition_is_skipped() -> None:
    """§3.3: the revision itself is a new fact; the repeat of the REVISED value is not."""
    first = _row(value_raw="1.0")
    revised = _later(first, 300_000, value_raw="1.5")
    store, outcomes = _write_all([first, revised, _later(revised, 300_000)])

    assert outcomes == [
        WriteOutcome.ACCEPTED,
        WriteOutcome.ACCEPTED,
        WriteOutcome.SKIPPED_IDENTICAL_FACT,
    ]
    assert [r.value_raw for r in store.rows] == ["1.0", "1.5"]


# ── CALA: no `as_of` answer moves ──────────────────────────────────────────────────────────


def _candidates() -> list[SeriesRow]:
    """Every shape the proof names, across five buckets of one series, in ARRIVAL order."""
    rows: list[SeriesRow] = []
    # bucket 0: a plain re-poll, 5 repeats.
    b0 = _row(bucket_end=_BUCKET_MS, event_time=_EVENT_MS, value_raw="10")
    rows += [_later(b0, k * 300_000) for k in range(6)]
    # bucket 1: a revision, then repeats of the revised value.
    b1 = _row(bucket_end=_BUCKET_MS + _STEP_MS, event_time=_EVENT_MS + _STEP_MS, value_raw="11")
    rows += [b1, _later(b1, 300_000), _later(b1, 600_000, value_raw="12")]
    rows += [_later(b1, 900_000, value_raw="12")]
    # bucket 2: X, 0, X, X.
    b2 = _row(bucket_end=_BUCKET_MS + 2 * _STEP_MS, event_time=_EVENT_MS + 2 * _STEP_MS)
    rows += [
        dataclasses.replace(b2, value_raw="5"),
        _later(b2, 300_000, value_raw="0"),
        _later(b2, 600_000, value_raw="5"),
        _later(b2, 900_000, value_raw="5"),
    ]
    # bucket 3: the §1.3 counterexample — same value, the later observation published EARLIER.
    b3 = _row(
        bucket_end=_BUCKET_MS + 3 * _STEP_MS,
        event_time=_EVENT_MS + 3 * _STEP_MS,
        observed_at=_EVENT_MS + 3 * _STEP_MS + 10_000,
        available_at=_EVENT_MS + 3 * _STEP_MS + 900_000,
        value_raw="13",
    )
    rows += [
        b3,
        dataclasses.replace(
            b3,
            observed_at=b3.observed_at + 10_000,
            ingested_at=b3.ingested_at + 10_000,
            available_at=_EVENT_MS + 3 * _STEP_MS + 30_000,
        ),
    ]
    # bucket 4: not final first, final later — `is_final` is in the fact.
    b4 = _row(
        bucket_end=_BUCKET_MS + 4 * _STEP_MS,
        event_time=_EVENT_MS + 4 * _STEP_MS,
        is_final=False,
        value_raw="14",
    )
    rows += [b4, _later(b4, 300_000), _later(b4, 600_000, is_final=True)]
    rows += [_later(b4, 900_000, is_final=True)]
    return rows


def _observations(rows: list[SeriesRow]) -> tuple[Observation, ...]:
    return tuple(Observation(row=r, value=Decimal(r.value_raw)) for r in rows)


_POLICY: Final = SeriesReadPolicy(
    asof_max_staleness_ms=600_000,
    render_max_staleness_ms=600_000,
    bucket_interval_ms=_STEP_MS,
    first_capture_at=None,
)


def _knowledge_grid(rows: list[SeriesRow]) -> list[int]:
    """Every instant a row's admission can flip at, ±1, plus every midpoint between them."""
    edges = sorted({r.observed_at for r in rows} | {r.available_at for r in rows})
    grid = {e + d for e in edges for d in (-1, 0, 1)}
    grid |= {(a + b) // 2 for a, b in zip(edges, edges[1:], strict=False)}
    return sorted(grid)


def _readings(rows: list[SeriesRow], bar_policy: BarPolicy) -> list[list[dict[str, object]]]:
    """Every `(t, K)` of ONE grid — built from ALL candidates, so both stores face the same K."""
    series = _series()
    instants = [_BUCKET_MS + k * _STEP_MS + d for k in range(-1, 7) for d in (0, _STEP_MS - 1)]
    instants = sorted(set(instants))
    out = []
    for knowledge_time in _knowledge_grid(_candidates()):
        batch = as_of_batch(
            series=series,
            symbol="BTCUSDT",
            instants=instants,
            observations=_observations(rows),
            policy=_POLICY,
            bar_policy=bar_policy,
            purpose=ReadPurpose.RENDERING,
            knowledge_time=knowledge_time,
        )
        out.append([reading.projection() for reading in batch])
    return out


def test_the_cala_universe_really_contains_skips_and_values() -> None:
    """Guard the guard: a CALA over a store where nothing was skipped proves nothing."""
    store, outcomes = _write_all(_candidates())
    n_skipped = outcomes.count(WriteOutcome.SKIPPED_IDENTICAL_FACT)

    assert n_skipped == 10, outcomes
    assert len(store.rows) == len(_candidates()) - 10
    values = [
        p["value"]
        for grid in _readings(store.rows, BarPolicy.FINAL_ONLY)
        for p in grid
        if p["value"]
    ]
    assert len(values) > 100, "the grid is a wall of absences"


@pytest.mark.parametrize("bar_policy", [BarPolicy.FINAL_ONLY, BarPolicy.INTRABAR])
def test_as_of_batch_answers_the_same_over_the_compacted_and_the_raw_store(
    bar_policy: BarPolicy,
) -> None:
    """Test 3 (CALA): every `(t, K)` of the grid, both bar policies, projection bit for bit."""
    raw = _candidates()
    store, _ = _write_all(raw)

    assert _readings(store.rows, bar_policy) == _readings(raw, bar_policy)


def test_as_of_answers_the_same_with_k_between_the_first_and_second_observation() -> None:
    """The case named in §1.3, against the DEFINITION (`as_of`), not only the batch."""
    raw = _candidates()
    store, _ = _write_all(raw)
    first, second = raw[0], raw[1]
    for knowledge_time in (first.observed_at, (first.observed_at + second.observed_at) // 2):
        readings = [
            as_of(
                series=_series(),
                symbol="BTCUSDT",
                t=_BUCKET_MS + _STEP_MS - 1,
                observations=_observations(rows),
                policy=_POLICY,
                bar_policy=BarPolicy.FINAL_ONLY,
                purpose=ReadPurpose.RENDERING,
                knowledge_time=max(knowledge_time, first.available_at),
            ).projection()
            for rows in (store.rows, raw)
        ]
        assert readings[0] == readings[1]
        assert readings[0]["value"] == "10"


# ── crédito: `n_written` counts persisted rows only ─────────────────────────────────────────

_RUN: Final = "run-skip"
_ACCOUNTED_AT: Final = "2026-10-02T21:00:00.000Z"


@dataclass
class _QueueOf:
    batches: list[tuple[QueuedSeriesRow, ...]]

    def read_pending(self, count: int) -> tuple[QueuedSeriesRow, ...]:  # noqa: ARG002
        return self.batches.pop(0) if self.batches else ()

    def read_new(self, count: int) -> tuple[QueuedSeriesRow, ...]:  # noqa: ARG002
        return ()

    def ack(self, entry_id: object) -> None:
        """Acks are not under test here."""


@dataclass
class _Creditor:
    calls: list[tuple[str, int, str]] = field(default_factory=list)

    def credit_written(self, run_id: str, n_written: int, accounted_at: str) -> bool:
        self.calls.append((run_id, n_written, accounted_at))
        return True


def _drain(store: _MemoryStore, batch: tuple[QueuedSeriesRow, ...], creditor: _Creditor) -> None:
    stop = threading.Event()

    def _sleep(_seconds: float) -> None:
        stop.set()

    run(
        queue=_QueueOf(batches=[batch]),
        lookup=store,
        sink=store,
        batch_size=10,
        poll_interval_s=0.0,
        creditor=creditor,
        stop_event=stop,
        sleep=_sleep,
        now=lambda: _ACCOUNTED_AT,
    )


def test_a_run_of_only_repeats_closes_with_n_written_zero(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Test 4, as `T-06.4-prova.md` §2 decided it: CLOSED (stamped), and at `0`, not at 3."""
    first = _row()
    store = _MemoryStore(rows=[first])
    batch = tuple(
        QueuedSeriesRow(entry_id=k, row=_later(first, k * 300_000), run_id=_RUN) for k in (1, 2, 3)
    )
    creditor = _Creditor()

    with caplog.at_level(logging.INFO, logger="src.modules.sentimento.infra.single_writer_cli"):
        _drain(store, batch, creditor)

    assert creditor.calls == [(_RUN, 0, _ACCOUNTED_AT)]
    assert store.rows == [first]
    acked = [r for r in caplog.records if r.getMessage() == "writer_batch_acked"]
    assert [
        (r.__dict__["n_accepted"], r.__dict__["n_rejected"], r.__dict__["n_skipped_identical"])
        for r in acked
    ] == [(0, 0, 3)]


def test_a_mixed_run_is_credited_with_its_persisted_rows_only() -> None:
    """One new row and two repeats ⇒ `n_written = 1`."""
    first = _row()
    revised = _later(first, 300_000, value_raw="9")
    batch = (
        QueuedSeriesRow(entry_id=1, row=_later(first, 100_000), run_id=_RUN),
        QueuedSeriesRow(entry_id=2, row=revised, run_id=_RUN),
        QueuedSeriesRow(entry_id=3, row=_later(revised, 300_000), run_id=_RUN),
    )
    creditor = _Creditor()

    _drain(_MemoryStore(rows=[first]), batch, creditor)

    assert creditor.calls == [(_RUN, 1, _ACCOUNTED_AT)]
