"""`write_series_row` is the escritor único: `D7.16` enforced, `sink` reached only when it clears.

The central falsifier is `test_a_modeled_candidate_over_an_observed_bucket_never_reaches_the_sink`:
a green "rejects" assertion on its own would not prove the row was never written, only that a
return value said so — this test watches the FAKE sink and proves `accept` was never called.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.use_cases.write_series_row import WriteOutcome, write_series_row

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


def row(**overrides: object) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_provenance_columns.py`'s helper."""
    columns: dict[str, object] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_daily_metrics",
        "bucket_end": BUCKET_END_MS,
        "event_time": EVENT_TIME_MS,
        "available_at": EVENT_TIME_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": EVENT_TIME_MS + 45_000,
        "observed_at": EVENT_TIME_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "2026-08-23 00:00:00",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


@dataclass
class FakeObservedLookup:
    """Answers `observed_already_present` with one fixed verdict, regardless of the row."""

    answer: bool

    def observed_already_present(self, row: SeriesRow) -> bool:
        """Return the fixed, scripted answer."""
        return self.answer


@dataclass
class FakeSeriesSink:
    """Records every row it accepts, so a test can prove it was — or was not — called."""

    accepted: list[SeriesRow] = field(default_factory=list)

    def accept(self, row: SeriesRow) -> None:
        """Append `row` to `accepted`."""
        self.accepted.append(row)


def test_a_modeled_candidate_over_an_observed_bucket_never_reaches_the_sink() -> None:
    """THE FALSIFIER: proves absence at the sink, not just a returned verdict."""
    sink = FakeSeriesSink()
    candidate = row(provenance=Provenance.MODELED)

    outcome = write_series_row(candidate, lookup=FakeObservedLookup(answer=True), sink=sink)

    assert outcome is WriteOutcome.REJECTED_MODELED_OVER_OBSERVED
    assert sink.accepted == []


def test_a_modeled_candidate_filling_a_gap_reaches_the_sink() -> None:
    """The other half of `D7.16`: no observed point yet, so the backfill is accepted."""
    sink = FakeSeriesSink()
    candidate = row(provenance=Provenance.MODELED)

    outcome = write_series_row(candidate, lookup=FakeObservedLookup(answer=False), sink=sink)

    assert outcome is WriteOutcome.ACCEPTED
    assert sink.accepted == [candidate]


def test_an_observed_candidate_always_reaches_the_sink_even_if_a_bucket_is_already_observed() -> (
    None
):
    """Observado sempre vence — a second OBSERVED for the same bucket is a normal append."""
    sink = FakeSeriesSink()
    candidate = row(provenance=Provenance.OBSERVED)

    outcome = write_series_row(candidate, lookup=FakeObservedLookup(answer=True), sink=sink)

    assert outcome is WriteOutcome.ACCEPTED
    assert sink.accepted == [candidate]


def test_the_lookup_is_consulted_before_the_sink_is_ever_touched() -> None:
    """`ADR-002/D5`'s "ler antes de escrever", pinned as an observed ORDER, not just a claim.

    A lookup that raises must stop the write before `sink.accept` is reached at all — if the
    order were reversed, a row could already be durable by the time the read failed.
    """

    class ExplodingLookup:
        """A lookup that always fails, to prove the read happens before any write."""

        def observed_already_present(self, row: SeriesRow) -> bool:
            """Raise, unconditionally, before any write could happen."""
            raise RuntimeError("read failed")

    sink = FakeSeriesSink()
    try:
        write_series_row(row(provenance=Provenance.MODELED), lookup=ExplodingLookup(), sink=sink)
    except RuntimeError:
        pass
    else:
        raise AssertionError("expected the lookup's RuntimeError to propagate")
    assert sink.accepted == []
