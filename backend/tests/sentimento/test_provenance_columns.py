"""`SPEC-001` §3.1 as an executable contract: the seven columns, on every row, or no row."""

from __future__ import annotations

from typing import Any

import pytest

from src.modules.sentimento.domain.provenance import (
    OBSERVER_COLUMNS,
    PROVENANCE_COLUMNS,
    UNKNOWN_OBSERVER_REGION,
    Absence,
    AvailabilitySource,
    InvalidSeriesRowError,
    Provenance,
    SeriesRow,
    build_series_row,
    reject_clock_skew,
    reject_modeled_for_deterministic_metric,
)

# Hand transcription of `SPEC-001` §3.1, for the same reason as in `test_series_identity.py`:
# a module compared against itself proves nothing.
SPEC_001_3_1_PROVENANCE: tuple[str, ...] = (
    "event_time",
    "available_at",
    "availability_source",
    "ingested_at",
    "observed_at",
    "provenance",
    "src_label_raw",
)

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


def row(**overrides: Any) -> SeriesRow:
    """Build one valid market-series row, with every provenance column filled."""
    columns: dict[str, Any] = {
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
    return SeriesRow(**columns)


def test_the_seven_provenance_columns_are_the_seven_spec_001_3_1_writes() -> None:
    """Seven, in the SPEC's order, plus the observer pair the SPEC lists separately."""
    assert len(SPEC_001_3_1_PROVENANCE) == 7
    assert PROVENANCE_COLUMNS == SPEC_001_3_1_PROVENANCE
    assert OBSERVER_COLUMNS == ("observer_id", "observer_region")


def test_every_row_projects_the_seven_plus_the_observer_pair_plus_is_final() -> None:
    """`SPEC-001` §3.1: "em TODA linha de serie" — the projection is how that is checkable."""
    projected = row().provenance_projection()
    assert tuple(projected) == (
        *SPEC_001_3_1_PROVENANCE,
        "observer_id",
        "observer_region",
        "is_final",
    )
    assert projected["provenance"] == "OBSERVADO"
    assert projected["availability_source"] == "OBSERVED"


@pytest.mark.parametrize(
    "column", ["series_key_id", "symbol", "source", "src_label_raw", "observer_id"]
)
def test_a_blank_required_column_makes_the_row_invalid(column: str) -> None:
    """`SPEC-001` §3.2: "invalida se falta qualquer uma das sete colunas" — blank is missing."""
    with pytest.raises(InvalidSeriesRowError, match=column):
        row(**{column: "  "})


def test_observer_region_unknown_is_a_value_and_blank_is_refused() -> None:
    """`SPEC-001` §2.2: `unknown` is a VALUE — `NULL` crosses quarantine for the wrong reason."""
    assert UNKNOWN_OBSERVER_REGION == "unknown"
    assert row().observer_region == "unknown"
    with pytest.raises(InvalidSeriesRowError, match="observer_region"):
        row(observer_region="")


def test_provenance_observed_and_availability_source_observed_are_different_words() -> None:
    """Same member name, different value, different question — and never interchangeable.

    One says where the NUMBER came from (`OBSERVADO`), the other says whether the TIMESTAMP
    was watched or calibrated (`OBSERVED`). A reader who swaps them publishes a modeled
    availability as an observed one, which is optimistic in silence.

    THE ASSERTION IS ON THE VALUE SETS AND NOT ON `is not`, AND THAT IS A MEASUREMENT: an
    earlier draft wrote `Provenance.OBSERVED is not AvailabilitySource.OBSERVED` and
    `mypy --strict` REFUSED it as a non-overlapping identity check
    `[MEDIDO 2026-08-29: bash backend/scripts/lint.sh -> 2x error comparison-overlap]`. The
    type system already proves the two cannot be confused in typed code; what still can be
    confused is the WIRE VALUE, so that is what this test pins.
    """
    assert Provenance.OBSERVED.value == "OBSERVADO"
    assert AvailabilitySource.OBSERVED.value == "OBSERVED"
    assert "OBSERVED" in {member.name for member in Provenance}
    assert {member.value for member in Provenance} & {
        member.value for member in AvailabilitySource
    } == set()


def test_the_four_provenance_words_and_the_four_absence_words_are_closed_sets() -> None:
    """`SPEC-001` §3.1, verbatim — the values are the contract, the member names are English."""
    assert {member.value for member in Provenance} == {
        "OBSERVADO",
        "DERIVADO",
        "MODELADO",
        "HUMANO",
    }
    assert {member.value for member in Absence} == {
        "SEM_PONTO",
        "NAO_LIDO",
        "QUARENTENA",
        "SEM_FONTE",
    }
    assert {member.value for member in AvailabilitySource} == {"OBSERVED", "MODELED"}


def test_no_source_is_the_answer_qf_4_requires() -> None:
    """`QF-4`: a read under `nq` before the first live capture returns `SEM_FONTE`, never `q`."""
    assert Absence.NO_SOURCE.value == "SEM_FONTE"


# ── DERIVADO IS NOT MODELADO, AND `D4.9` IS WHY ───────────────────────────────────────────


@pytest.mark.parametrize("metric", ["price_mark_close", "cvd_cum"])
def test_a_deterministic_function_of_observed_values_cannot_be_stamped_modeled(
    metric: str,
) -> None:
    """`SPEC-001` §3.1: stamping these `MODELADO` makes the main panel born permanently dashed.

    `D4.9` earns `price_mark_close` the word, at ZERO tolerance to 8 decimals, reproduced for
    this task `[MEDIDO 2026-08-29: BTCUSDT 2026-08-21 288/288 and 2026-08-23 288/288, worst
    residual 0,0000 bp; COTIUSDT 282/288 (4,3407 bp), DOGEUSDT 286/288 (1,0847 bp), SLXUSDT
    286/288 (1,9716 bp); n = 5 symbol-days, 1.440 paired buckets]`.
    """
    with pytest.raises(InvalidSeriesRowError, match="MODELADO"):
        reject_modeled_for_deterministic_metric(metric, Provenance.MODELED)


@pytest.mark.parametrize("provenance", [Provenance.OBSERVED, Provenance.DERIVED, Provenance.HUMAN])
def test_the_other_three_provenances_pass_for_a_deterministic_metric(
    provenance: Provenance,
) -> None:
    """Only `MODELADO` is refused — the guard is about the one word, not about all of them."""
    reject_modeled_for_deterministic_metric("price_mark_close", provenance)


def test_a_metric_outside_the_set_may_be_modeled() -> None:
    """A modeled series is legitimate; what is illegitimate is calling a division a model."""
    reject_modeled_for_deterministic_metric("funding_rate_forecast", Provenance.MODELED)


# ── CLOCK SKEW: THE ROW IS INVALID, NOT WARNED ABOUT ──────────────────────────────────────


def test_available_at_before_event_time_beyond_tolerance_is_refused() -> None:
    """`SPEC-001` §3.2: knowing a fact before it happened is lookahead written into the store."""
    early = row(available_at=EVENT_TIME_MS - 5_000)
    with pytest.raises(InvalidSeriesRowError, match="5000 ms"):
        reject_clock_skew(early, clock_skew_tolerance_ms=1_000)


def test_the_tolerance_boundary_is_inclusive() -> None:
    """Exactly at the declared tolerance passes; one millisecond past it does not."""
    reject_clock_skew(row(available_at=EVENT_TIME_MS - 1_000), clock_skew_tolerance_ms=1_000)
    with pytest.raises(InvalidSeriesRowError):
        reject_clock_skew(row(available_at=EVENT_TIME_MS - 1_001), clock_skew_tolerance_ms=1_000)


def test_a_negative_tolerance_is_refused() -> None:
    """A negative tolerance would REQUIRE lookahead rather than tolerate host skew."""
    with pytest.raises(InvalidSeriesRowError, match="negative"):
        reject_clock_skew(row(), clock_skew_tolerance_ms=-1)


def test_build_series_row_applies_both_checks_at_one_entry_point() -> None:
    """Two checks that each need an injected value, behind one call, so neither is forgotten."""
    assert build_series_row(row(), metric="sum_open_interest", clock_skew_tolerance_ms=0) == row()
    with pytest.raises(InvalidSeriesRowError, match="MODELADO"):
        build_series_row(
            row(provenance=Provenance.MODELED), metric="cvd_cum", clock_skew_tolerance_ms=0
        )
    with pytest.raises(InvalidSeriesRowError, match="ms"):
        build_series_row(
            row(available_at=EVENT_TIME_MS - 10),
            metric="sum_open_interest",
            clock_skew_tolerance_ms=0,
        )


# ── WHAT `T-04.4` WILL READ, CHECKED HERE SO IT CANNOT BREAK IN SILENCE ───────────────────


def test_observed_at_is_argmin_able_and_argmin_is_the_first_observation() -> None:
    """`T-04.4` reads `argmin(observed_at)` (`D4.13`) — this proves the column supports it.

    Three observations of the SAME bucket, deliberately out of order. `observed_at` is an
    `int`, so `min` is exact, total and parse-free; had it been a formatted instant, `argmin`
    would have depended on every source padding the spelling identically — right until one
    of them did not, and then wrong without a word.
    """
    late = row(observed_at=EVENT_TIME_MS + 90_000)
    first = row(observed_at=EVENT_TIME_MS + 10_000)
    middle = row(observed_at=EVENT_TIME_MS + 50_000)
    observations = (late, first, middle)

    assert all(isinstance(observation.observed_at, int) for observation in observations)
    assert min(observations, key=lambda observation: observation.observed_at) is first
    assert max(observations, key=lambda observation: observation.observed_at) is late


def test_observed_at_is_part_of_the_row_key_so_the_same_bucket_can_be_observed_twice() -> None:
    """`SPEC-001` §3.2 key: `(series_key_id, symbol, source, bucket_end, observed_at)`, append-only.

    Without `observed_at` in the key the second observation of a bucket would overwrite the
    first, and `D4.13` — "`as_of` returns the FIRST observation, never the last" — would have
    nothing left to return.
    """

    def key_of(observation: SeriesRow) -> tuple[object, ...]:
        return (
            observation.series_key_id,
            observation.symbol,
            observation.source,
            observation.bucket_end,
            observation.observed_at,
        )

    first = row(observed_at=EVENT_TIME_MS + 10_000)
    second = row(observed_at=EVENT_TIME_MS + 90_000)
    assert first.bucket_end == second.bucket_end
    assert key_of(first) != key_of(second)


def test_is_final_absent_is_different_from_is_final_false() -> None:
    """`SPEC-001` §3.1 lists `is_final` "quando a fonte o declara" — `None` is that case.

    A source that does not declare finality is not a source declaring the bar unfinished.
    Collapsing the two would let `bar_policy = final_only` (`R-2`) read a silence as a "no".
    """
    assert row(is_final=None).is_final is None
    assert row(is_final=False).is_final is False
    assert row(is_final=None).provenance_projection()["is_final"] is None
