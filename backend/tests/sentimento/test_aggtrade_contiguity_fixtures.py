"""`D4.4`/`D4.5`, run against the real `aggTrades` dumps the plan pins by `md5`.

`docs/plans/SPEC-001-plataforma-dados/04_contrato_temporal.md`. Every number asserted below was
measured on these exact fixtures by this test's own logic — `[MEDIDO 2026-08-29]`, command:
`bash backend/scripts/test.sh -k test_aggtrade_contiguity_fixtures` over
`data/binance/aggtrades/BTCUSDT-aggTrades-{2026-08-20,2026-08-21,2026-08-23}.csv` — and each
docstring names the plan/DoD number it pins.

`2026-08-22` is not a fixture this test reads: the whole point of `D4.4` is that the day was
NEVER captured (`data/MANIFEST.md`), and its absence is exactly the discontinuity
`test_d4_4_the_2026_08_22_hole_is_the_only_gap` measures.
"""

from __future__ import annotations

from src.modules.sentimento.domain.aggtrade_contiguity import (
    AggTradeTick,
    count_decreasing_timestamps,
    detect_agg_id_gaps,
    measure_millisecond_collisions,
    require_unique_agg_ids,
)
from src.modules.sentimento.infra.aggtrade_csv_reader import (
    read_aggtrade_ticks,
    read_aggtrade_ticks_from_many,
)
from tests.helpers.data_fixtures import require_fixture

_FIXTURE_2026_08_20 = "binance/aggtrades/BTCUSDT-aggTrades-2026-08-20.csv"
_MD5_2026_08_20 = "fa779db5ece6ad82b1b633649118113d"

_FIXTURE_2026_08_21 = "binance/aggtrades/BTCUSDT-aggTrades-2026-08-21.csv"
_MD5_2026_08_21 = "31f5b006714d6cbc41f8a0b4e10a7aae"

_FIXTURE_2026_08_23 = "binance/aggtrades/BTCUSDT-aggTrades-2026-08-23.csv"
_MD5_2026_08_23 = "a68d9dbdfde1d7c0d25e78eae4d798bb"


def _three_day_ticks() -> tuple[AggTradeTick, ...]:
    paths = [
        require_fixture(_FIXTURE_2026_08_20, expected_md5=_MD5_2026_08_20),
        require_fixture(_FIXTURE_2026_08_21, expected_md5=_MD5_2026_08_21),
        require_fixture(_FIXTURE_2026_08_23, expected_md5=_MD5_2026_08_23),
    ]
    return read_aggtrade_ticks_from_many(paths)


# ── D4.4 — contiguidade de tick sobre aggTrades ─────────────────────────────────────────────


def test_d4_4_the_three_files_concatenate_to_8_873_078_rows() -> None:
    """`[MEDIDO]`: `plano 04` D4.4's own universe — the three captured days, in date order."""
    ticks = _three_day_ticks()
    assert len(ticks) == 8_873_078


def test_d4_4_zero_decreasing_timestamps_across_the_whole_span() -> None:
    """`plano 04` D4.4, literal: "0 ts decrescente" — measured in `agg_id` order, not re-sorted."""
    ticks = _three_day_ticks()
    assert count_decreasing_timestamps(ticks) == 0


def test_d4_4_the_2026_08_22_hole_is_the_only_gap() -> None:
    """`plano 04` D4.4, literal: the missing day surfaces as ONE discontinuity, not "0 saltos".

    `[MEDIDO 2026-08-29]`: within each of the three captured files there are zero jumps — the
    "0 saltos" the plan states — and concatenating them in date order exposes exactly the ONE
    boundary the plan names: `agg_id` `3420055157` (last of `2026-08-21`) to `3421676065`
    (first of `2026-08-23`), `n_missing=1.620.908` (`to - from`, `test_aggtrade_contiguity.py::
    test_detect_agg_id_gaps_n_missing_is_the_width_not_the_strict_between_count` pins the
    convention). This gap is REPORTED, never stitched: `read_aggtrade_ticks_from_many` does not
    invent a `2026-08-22` row, and `AggIdGap` has no field where one could be attached.
    """
    ticks = _three_day_ticks()
    gaps = detect_agg_id_gaps(ticks)
    assert len(gaps) == 1
    (gap,) = gaps
    assert gap.from_agg_id == 3_420_055_157
    assert gap.to_agg_id == 3_421_676_065
    assert gap.n_missing == 1_620_908


def test_d4_4_every_agg_id_is_unique_across_the_three_files() -> None:
    """Unicidade by `agg_id`, over real data spanning a file boundary — never by time."""
    ticks = _three_day_ticks()
    require_unique_agg_ids(ticks)  # does not raise: no file overlaps another in `agg_id`


def test_d4_4_a_single_captured_day_alone_has_zero_internal_gaps() -> None:
    """The "0 saltos" half of D4.4, isolated to ONE file — the hole only appears at the boundary."""
    path = require_fixture(_FIXTURE_2026_08_21, expected_md5=_MD5_2026_08_21)
    ticks = read_aggtrade_ticks(path)
    assert len(ticks) == 4_802_005
    assert detect_agg_id_gaps(ticks) == ()
    assert count_decreasing_timestamps(ticks) == 0


# ── D4.5 — unicidade sob colisao de milissegundo ────────────────────────────────────────────


def test_d4_5_up_to_184_aggtrades_share_one_millisecond() -> None:
    """`plano 04` D4.5, literal: "ate 184 aggTrades no mesmo ms" — `2026-08-20`, the pinned day."""
    path = require_fixture(_FIXTURE_2026_08_20, expected_md5=_MD5_2026_08_20)
    ticks = read_aggtrade_ticks(path)
    stats = measure_millisecond_collisions(ticks)
    assert stats.max_trades_in_one_timestamp == 184


def test_d4_5_25_6_percent_of_the_observed_milliseconds_collide() -> None:
    """`plano 04` D4.5, literal: "25,6% dos ms com colisao".

    `[MEDIDO 2026-08-29]`: 245.890 colliding of 959.949 distinct milliseconds — the ratio the
    plan rounds to one decimal.
    """
    path = require_fixture(_FIXTURE_2026_08_20, expected_md5=_MD5_2026_08_20)
    ticks = read_aggtrade_ticks(path)
    stats = measure_millisecond_collisions(ticks)
    assert stats.distinct_timestamps == 959_949
    assert stats.colliding_timestamps == 245_890
    assert round(stats.collision_ratio * 100, 1) == 25.6


def test_d4_5_agg_id_stays_unique_on_the_very_file_that_collides_on_time() -> None:
    """`plano 04` item 4.3's whole point, proven on the fixture that makes time unsafe.

    The SAME file `test_d4_5_up_to_184_aggtrades_share_one_millisecond` measures 184-way time
    collisions on is fully unique by `agg_id` — `require_unique_agg_ids` never raises here,
    which is exactly why `agg_id` and not time is the key.
    """
    path = require_fixture(_FIXTURE_2026_08_20, expected_md5=_MD5_2026_08_20)
    ticks = read_aggtrade_ticks(path)
    require_unique_agg_ids(ticks)  # does not raise


def test_d4_5_a_time_keyed_scheme_would_silently_drop_1_796_568_real_trades() -> None:
    """The falsifier `D4.5` exists to prevent, run for real: dedup keyed on `transact_time_ms`.

    Not production code — a local, throwaway stand-in built ONLY to show what "unicidade por
    tempo" would cost on the file this task's own DoD cites. Keeping the first tick per
    millisecond collapses 2.756.517 real rows down to 959.949 (the distinct-timestamp count
    `test_d4_5_25_6_percent_of_the_observed_milliseconds_collide` already measured), silently
    discarding `2.756.517 - 959.949 = 1.796.568` legitimate trades — the concrete number behind
    "nunca por tempo" in `plano 04` item 4.3.
    """
    path = require_fixture(_FIXTURE_2026_08_20, expected_md5=_MD5_2026_08_20)
    ticks = read_aggtrade_ticks(path)
    assert len(ticks) == 2_756_517

    seen_timestamps: set[int] = set()
    survivors = 0
    for tick in ticks:
        if tick.transact_time_ms in seen_timestamps:
            continue
        seen_timestamps.add(tick.transact_time_ms)
        survivors += 1

    assert survivors == 959_949
    assert len(ticks) - survivors == 1_796_568
