"""`plano 04` item 4.3 as an executable contract, on synthetic ticks."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.aggtrade_contiguity import (
    AggIdGap,
    AggTradeTick,
    DuplicateAggIdError,
    MillisecondCollisionStats,
    count_decreasing_timestamps,
    detect_agg_id_gaps,
    measure_millisecond_collisions,
    require_unique_agg_ids,
)


def _tick(agg_id: int, transact_time_ms: int = 0) -> AggTradeTick:
    return AggTradeTick(agg_id=agg_id, transact_time_ms=transact_time_ms)


# ── the type itself carries no `trade_id` field to key on ──────────────────────────────────


def test_agg_trade_tick_has_no_field_to_key_on_time_or_trade_id() -> None:
    """Structural half of "nunca por tempo, nunca first/last trade_id".

    There is no `first_trade_id`/`last_trade_id` field on this type — a caller cannot build the
    forbidden key out of a value that never received it, mirroring the pattern
    `ProbeNotMeasured` already uses in `stream_probe_outcome.py` for the same class of
    guarantee.
    """
    fields = set(vars(_tick(1, 1)))
    assert fields == {"agg_id", "transact_time_ms"}


# ── unicidade e por agg_id, nunca por tempo ─────────────────────────────────────────────────


def test_require_unique_agg_ids_accepts_a_fully_unique_sequence() -> None:
    """Three distinct `agg_id`s, three distinct timestamps: no raise."""
    ticks = [_tick(1, 100), _tick(2, 200), _tick(3, 300)]
    require_unique_agg_ids(ticks)  # does not raise


def test_require_unique_agg_ids_raises_on_a_repeated_agg_id() -> None:
    """The one collision this module refuses: two ticks with the SAME `agg_id`."""
    ticks = [_tick(1, 100), _tick(2, 200), _tick(1, 300)]
    with pytest.raises(DuplicateAggIdError, match="agg_id 1"):
        require_unique_agg_ids(ticks)


def test_two_ticks_sharing_a_timestamp_are_not_a_duplicate() -> None:
    """The falsifier for "unicidade nunca por tempo": same ms, different `agg_id`, no raise.

    This is the exact shape `D4.5` measures at scale on the real fixture (up to 184 trades
    sharing one millisecond) — a scheme keyed on time would have to reject this pair, or
    silently collapse it, and `require_unique_agg_ids` does neither.
    """
    ticks = [_tick(1, 500), _tick(2, 500), _tick(3, 500)]
    require_unique_agg_ids(ticks)  # does not raise: three DISTINCT agg_ids, one timestamp


def test_a_naive_key_by_timestamp_would_wrongly_collapse_the_case_above() -> None:
    """The mutant this task's DoD forbids, made concrete: dedup keyed on `transact_time_ms`.

    Not production code — a local, throwaway stand-in for "what a time-keyed scheme would do"
    — built ONLY to prove the point `plano 04` item 4.3 states in prose: keying on time drops
    real, distinct trades. Three legitimate ticks sharing one ms collapse to one under a
    time-based key, which is the data-loss `require_unique_agg_ids` (agg_id-based) never
    produces on the same input.
    """
    ticks = [_tick(1, 500), _tick(2, 500), _tick(3, 500)]

    def naive_unique_by_time(rows: list[AggTradeTick]) -> list[AggTradeTick]:
        seen: set[int] = set()
        kept: list[AggTradeTick] = []
        for row in rows:
            if row.transact_time_ms in seen:
                continue
            seen.add(row.transact_time_ms)
            kept.append(row)
        return kept

    survivors = naive_unique_by_time(ticks)
    assert len(survivors) == 1  # 2 of 3 real trades silently discarded
    assert len(ticks) == 3  # nothing about the real data changed — only the naive key drops it


# ── contiguidade e por agg_id, e um buraco e contado, nunca preenchido ──────────────────────


def test_detect_agg_id_gaps_on_a_fully_contiguous_run() -> None:
    """Consecutive `agg_id`s exactly one apart: zero gaps, not a gap of size zero."""
    ticks = [_tick(1), _tick(2), _tick(3), _tick(4)]
    assert detect_agg_id_gaps(ticks) == ()


def test_detect_agg_id_gaps_finds_exactly_one_discontinuity() -> None:
    """One jump in an otherwise-contiguous run is reported as ONE gap, sized `to - from`."""
    ticks = [_tick(1), _tick(2), _tick(10), _tick(11)]
    gaps = detect_agg_id_gaps(ticks)
    assert gaps == (AggIdGap(from_agg_id=2, to_agg_id=10, n_missing=8),)


def test_two_separate_gaps_stay_separate() -> None:
    """A dense run between two gaps must not merge them into one."""
    ticks = [_tick(1), _tick(3), _tick(4), _tick(9)]
    gaps = detect_agg_id_gaps(ticks)
    assert [(g.from_agg_id, g.to_agg_id, g.n_missing) for g in gaps] == [
        (1, 3, 2),
        (4, 9, 5),
    ]


def test_agg_id_gap_has_no_field_to_carry_a_stitched_value() -> None:
    """The type-level half of "buraco nunca costurado": no slot to attach a manufactured tick."""
    (gap,) = detect_agg_id_gaps([_tick(1), _tick(5)])
    assert set(vars(gap)) == {"from_agg_id", "to_agg_id", "n_missing"}


def test_detect_agg_id_gaps_refuses_an_unsorted_sequence() -> None:
    """`detect_agg_id_gaps` trusts its precondition exactly as far as it is documented."""
    with pytest.raises(ValueError, match="not sorted"):
        detect_agg_id_gaps([_tick(5), _tick(1)])


def test_detect_agg_id_gaps_n_missing_is_the_width_not_the_strict_between_count() -> None:
    """Pins the convention `D4.4`'s own number needs: `to - from`, not `to - from - 1`.

    `plano 04` D4.4 states "1.620.908 ausentes entre agg_id 3420055157 e 3421676065" — that is
    exactly `3421676065 - 3420055157`, one MORE than the count of integers strictly between the
    two ids. This test pins the convention on a small, hand-checkable pair so the real-fixture
    test (`test_aggtrade_contiguity_fixtures.py`) is checked against a rule stated here first,
    not invented there.
    """
    (gap,) = detect_agg_id_gaps([_tick(10), _tick(13)])
    assert gap.n_missing == 3  # 13 - 10, NOT 13 - 10 - 1 = 2
    strictly_between = {11, 12}
    assert gap.n_missing == len(strictly_between) + 1


# ── "0 ts decrescente" e medido na ordem de agg_id, nunca reordenando por tempo ─────────────


def test_count_decreasing_timestamps_is_zero_on_a_well_ordered_run() -> None:
    """`transact_time_ms` rising alongside `agg_id`: zero backwards steps."""
    ticks = [_tick(1, 100), _tick(2, 200), _tick(3, 300)]
    assert count_decreasing_timestamps(ticks) == 0


def test_count_decreasing_timestamps_counts_every_backwards_step() -> None:
    """Two separate backwards steps in one walk are both counted, not just the first."""
    ticks = [_tick(1, 300), _tick(2, 100), _tick(3, 50), _tick(4, 400)]
    # step 1->2: 300 -> 100 (decreasing); step 2->3: 100 -> 50 (decreasing); step 3->4: increasing
    assert count_decreasing_timestamps(ticks) == 2


def test_count_decreasing_timestamps_allows_ties() -> None:
    """A repeated timestamp is not a decrease — only a strict drop counts."""
    ticks = [_tick(1, 500), _tick(2, 500), _tick(3, 500)]
    assert count_decreasing_timestamps(ticks) == 0


# ── colisao de milissegundo: e o motivo pelo qual tempo nao pode ser chave ──────────────────


def test_measure_millisecond_collisions_on_ticks_with_no_collision() -> None:
    """Three distinct timestamps, one trade each: zero collisions, max of exactly one."""
    ticks = [_tick(1, 10), _tick(2, 20), _tick(3, 30)]
    stats = measure_millisecond_collisions(ticks)
    assert stats == MillisecondCollisionStats(
        distinct_timestamps=3, colliding_timestamps=0, max_trades_in_one_timestamp=1
    )
    assert stats.collision_ratio == 0.0


def test_measure_millisecond_collisions_counts_colliding_timestamps() -> None:
    """Two of three distinct timestamps carry more than one trade — both counted, the third not."""
    ticks = [
        _tick(1, 10),
        _tick(2, 10),
        _tick(3, 10),  # ms 10: 3 trades
        _tick(4, 20),  # ms 20: 1 trade
        _tick(5, 30),
        _tick(6, 30),  # ms 30: 2 trades
    ]
    stats = measure_millisecond_collisions(ticks)
    assert stats.distinct_timestamps == 3
    assert stats.colliding_timestamps == 2  # ms 10 and ms 30
    assert stats.max_trades_in_one_timestamp == 3
    assert stats.collision_ratio == pytest.approx(2 / 3)


def test_measure_millisecond_collisions_on_empty_input() -> None:
    """No ticks at all: every stat is zero, never a `ZeroDivisionError` from the ratio."""
    stats = measure_millisecond_collisions([])
    assert stats.distinct_timestamps == 0
    assert stats.max_trades_in_one_timestamp == 0
    assert stats.collision_ratio == 0.0


def test_measure_millisecond_collisions_does_not_require_sorted_input() -> None:
    """Order-independence: shuffled input gives the same stats as the sorted one."""
    ordered = [_tick(1, 10), _tick(2, 20), _tick(3, 20), _tick(4, 30)]
    shuffled = [ordered[2], ordered[0], ordered[3], ordered[1]]
    assert measure_millisecond_collisions(ordered) == measure_millisecond_collisions(shuffled)
