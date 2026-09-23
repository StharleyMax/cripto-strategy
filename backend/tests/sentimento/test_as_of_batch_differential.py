"""`ADR-039`/`DoD-2`: `as_of_batch` answers, bit for bit, what `as_of` answers — on REAL rows.

⛔ A DIFFERENTIAL THAT ONLY RUNS ON A SYNTHETIC FIXTURE DOES NOT COUNT, AND `ADR-039`/`DoD-2`
SAYS SO IN AS MANY WORDS. The two defects this scan has to survive were found in production
data, not in reasoning, and neither exists in a well-behaved fixture:

  `D2`  `748` rows of `1.452.975` in `md.series` carry `available_at < bucket_end` — the worst
        by `-3.481.439 ms`, about 58 grid steps. A scan keyed on `available_at` alone admits
        such a row BEFORE its own bucket closes: lookahead, and it changes which row wins.
  `D3`  in `5.624` of `147.860` multi-row buckets the winner is re-minimised BACKWARDS — a row
        that activates LATER wins by `_first_observation_order`, because that key is
        `observed_at` and `observed_at` is not ordered by `available_at`. A scan that kept "the
        first row that activated" answers with a row `as_of` never picks.

So this file reads a REAL slice of `md.series`, pinned by `md5`, that contains BOTH: the WORST
of the `748` rows (`-3.481.439 ms`, 58 grid steps) and `23` re-minimised buckets, `2` of them
revised inside a single 1-minute grid cell, which is what makes the revision VISIBLE to the
consumer rather than merely present in the rows. The counts are asserted below rather than
trusted — `ADR-012`'s `rc=0` trap is precisely a green differential over a slice where neither
defect could ever have shown up.

    [MEDIDO 2026-09-16, `deploy-postgres-1`, `BEGIN READ ONLY`, nenhuma semeadura]

    -- the two totals quoted above
    SELECT count(*), count(*) FILTER (WHERE available_at < bucket_end),
           min(available_at - bucket_end) FROM md.series;
    -- 1456825 | 748 | -3481439

    -- the slice this file reads, exported verbatim (the command is in data/MANIFEST.md)
    SELECT row_to_json(t) FROM ( SELECT <the 16 columns of _SELECT_WINDOW_SQL>
      FROM md.series WHERE symbol='BTCUSDT' AND series_key_id IN (
        '94c3d3dd…',  -- sum_open_interest, Nature.STOCK, native grid 5min: the D3 buckets
        'b3d96034…')  -- funding_estimated, Nature.STOCK, 60s cadence: the worst D2 row
      AND bucket_end BETWEEN 1789376000000 AND 1789390000000
      ORDER BY series_key_id, bucket_end, observed_at, source, ingested_at ) t;
    -- 571 rows, 296.893 bytes, md5 bb182d74556cb2fe6faa88dc645e5380

⚠️ THE SLICE HOLDS BOTH SERIES AT ONCE, AND THAT IS NOT LAZINESS. `md.series` has no single
`(series_key_id, symbol)` pair carrying both defects — the `748` rows are ALL
`/fapi/v1/premiumIndex` (`ADR-039`/`D2`) and that series has no multi-row bucket at all
(`0` measured). Handing the WHOLE slice to both functions as `observations` is therefore
strictly stronger than two separate ones: it also exercises the `q`/`nq` weld guard
(`series_key_id`/`symbol`), the two predicates `ADR-039`/`D6` VETOES removing.
"""

from __future__ import annotations

import json
from collections import Counter
from decimal import Decimal
from typing import Final

import pytest

from src.modules.sentimento.domain import as_of_accessor
from src.modules.sentimento.domain.as_of_accessor import (
    AsOfReading,
    BarPolicy,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    _absorb,
    _activation_instant,
    _admits,
    _first_observation_order,
    as_of,
    as_of_batch,
)
from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance, SeriesRow
from src.modules.sentimento.domain.series_key import SeriesKey

# `_funding_estimado_key` is imported PRIVATE on purpose. The `premiumIndex` series that carries
# the `D2` rows is not in any catalog (`list_series_catalog()` has 15 entries and none of them
# is it), so the alternative was to re-spell its fifteen identity terms here — and a second
# spelling of an identity is exactly how a fixture stops being about the rows it claims to be
# about: one term drifts, `series_key_id` changes, every admission predicate quietly returns
# `False`, and the differential passes over an EMPTY universe. Importing the production builder
# makes that impossible by construction.
from src.modules.sentimento.use_cases.collector_series_mapping import _funding_estimado_key
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
from tests.helpers.data_fixtures import require_fixture

_FIXTURE: Final = "postgres/md_series_slice_adr039.jsonl"
_FIXTURE_MD5: Final = "bb182d74556cb2fe6faa88dc645e5380"

_SYMBOL: Final = "BTCUSDT"
_GRID_STEP_MS: Final = 60_000
"""The report grid of `use_cases/series_history.py` — the consumer this ADR exists to speed up."""

_OPEN_INTEREST_ID: Final = "94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9"

# `knowledge_time` is set past the newest `observed_at` of the slice so the horizon admits every
# row: this file is about WHICH row wins at each `t`, and a horizon that cut rows off would
# shrink the universe the two functions disagree over. `CA-F4-25`'s own behaviour is pinned by
# `test_as_of_accessor.py`, not re-litigated here.
_KNOWLEDGE_TIME: Final = 1_800_000_000_000


def _observations() -> tuple[Observation, ...]:
    """Parse the pinned real slice into `Observation`s, by KEYWORD — never by attribute read."""
    path = require_fixture(_FIXTURE, expected_md5=_FIXTURE_MD5)
    parsed = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        row = SeriesRow(
            series_key_id=record["series_key_id"],
            symbol=record["symbol"],
            source=record["source"],
            bucket_end=record["bucket_end"],
            event_time=record["event_time"],
            available_at=record["available_at"],
            availability_source=AvailabilitySource(record["availability_source"]),
            ingested_at=record["ingested_at"],
            observed_at=record["observed_at"],
            provenance=Provenance(record["provenance"]),
            src_label_raw=record["src_label_raw"],
            observer_id=record["observer_id"],
            observer_region=record["observer_region"],
            is_final=record["is_final"],
            value_raw=record["value_raw"],
            principal_id=record["principal_id"],
        )
        parsed.append(Observation(row=row, value=Decimal(row.value_raw)))
    return tuple(parsed)


def _open_interest_case() -> tuple[SeriesKey, SeriesReadPolicy]:
    """Return the `sum_open_interest` series with the policy the PILOT CATALOG publishes."""
    entry = list_pilot_series_catalog().entry_for_id(_OPEN_INTEREST_ID)
    assert entry is not None, "the open-interest series left the pilot catalog"
    return entry.key, SeriesReadPolicy(
        asof_max_staleness_ms=entry.max_staleness_ms,
        render_max_staleness_ms=entry.max_staleness_ms,
        bucket_interval_ms=entry.native_grid_ms,
        first_capture_at=None,
    )


def _funding_estimated_case() -> tuple[SeriesKey, SeriesReadPolicy]:
    """Return the `funding_estimated` series — it carries the `D2` rows and is NOT cataloged.

    The two staleness numbers and the bucket width are DECLARED HERE, not inferred, because no
    catalog row exists to publish them: `60_000 ms` is the collector's own configured cadence
    (`build_premium_index_to_rows` spells the interval term `f"{int(interval_s)}s"`, and the
    stored identity matches `"60s"` — that is how this key was identified in the first place),
    and `600_000 ms` is the staleness the pilot catalog gives its sibling stock series. Neither
    number decides anything this file asserts: the differential compares two functions handed
    the SAME policy, so any value at all would still have to produce the same bits on both
    sides. They are chosen to be realistic so the readings are mostly VALUES rather than
    absences, which is what `test_…_is_not_a_wall_of_absences` below then holds them to.
    """
    return _funding_estimado_key(_SYMBOL, "60s"), SeriesReadPolicy(
        asof_max_staleness_ms=600_000,
        render_max_staleness_ms=600_000,
        bucket_interval_ms=60_000,
        first_capture_at=None,
    )


def _grid(observations: tuple[Observation, ...], series: SeriesKey) -> tuple[int, ...]:
    """Return the 1-minute grid covering this series' rows, as `series_history.py` builds it.

    `t = grid + step - 1` is `_read_instant`'s `final_only` branch, transcribed: the grid instant
    is an X coordinate and `t` is a decision instant, and the LAST instant of the cell is the
    only point in it derivable from the grid alone.
    """
    key_id = series.series_key_id()
    ends = [o.row.bucket_end for o in observations if o.row.series_key_id == key_id]
    first = -(-min(ends) // _GRID_STEP_MS) * _GRID_STEP_MS
    return tuple(range(first, max(ends) + _GRID_STEP_MS, _GRID_STEP_MS))


def _instants(grid: tuple[int, ...], *, bar_policy: BarPolicy) -> tuple[int, ...]:
    if bar_policy is BarPolicy.INTRABAR:
        return grid
    return tuple(g + _GRID_STEP_MS - 1 for g in grid)


def _one_by_one(
    instants: tuple[int, ...],
    *,
    series: SeriesKey,
    observations: tuple[Observation, ...],
    policy: SeriesReadPolicy,
    bar_policy: BarPolicy,
) -> tuple[AsOfReading, ...]:
    """Return the DEFINITION's answer: one `as_of` per instant — what `ADR-039` §1 measured."""
    return tuple(
        as_of(
            series=series,
            symbol=_SYMBOL,
            t=t,
            observations=observations,
            policy=policy,
            bar_policy=bar_policy,
            purpose=ReadPurpose.RENDERING,
            knowledge_time=_KNOWLEDGE_TIME,
        )
        for t in instants
    )


def _in_batch(
    instants: tuple[int, ...],
    *,
    series: SeriesKey,
    observations: tuple[Observation, ...],
    policy: SeriesReadPolicy,
    bar_policy: BarPolicy,
) -> tuple[AsOfReading, ...]:
    return as_of_batch(
        series=series,
        symbol=_SYMBOL,
        instants=instants,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
        purpose=ReadPurpose.RENDERING,
        knowledge_time=_KNOWLEDGE_TIME,
    )


_CASES = (
    ("open_interest", _open_interest_case),
    ("funding_estimated", _funding_estimated_case),
)


# ── THE UNIVERSE, ASSERTED BEFORE ANYTHING IS COMPARED OVER IT ─────────────────────────────


def test_the_real_slice_carries_the_d2_rows_a_synthetic_fixture_would_not_have() -> None:
    """`ADR-039`/`D2`: at least one row whose `available_at` precedes its own `bucket_end`."""
    observations = _observations()
    early = [o for o in observations if o.row.available_at < o.row.bucket_end]
    assert len(early) == 2, f"the slice stopped carrying the D2 defect: {len(early)} early rows"
    worst = min(o.row.available_at - o.row.bucket_end for o in early)
    assert worst == -3_481_439, (
        f"the slice no longer carries the WORST row of `ADR-039`/`D2` ({worst} ms). A row only "
        f"a few milliseconds early cannot move a 60.000 ms grid, so a slice without this one "
        f"would let the naive activation key look harmless"
    )


def test_the_real_slice_no_longer_carries_a_per_row_d3_activation_gap_under_adr_042() -> None:
    """`ADR-039`/`D3` measured on `_activation_instant`, and `ADR-042`/`D1` retired the measure.

    ⚠️ THIS TEST USED TO ASSERT `23`, AND THE NUMBER IS GONE ON PURPOSE, NOT LOST. Before
    `ADR-042`, `_activation_instant` under `final_only` was `max(available_at, bucket_end)` —
    a PER-ROW value, since `available_at` varies row to row even within one `bucket_end`. `D1`
    dropped `available_at` from that key entirely (`available_at` now gates admission against
    `knowledge_time`, not WHEN a row activates): the key is `bucket_end` alone, and every row of
    the SAME bucket shares the SAME `bucket_end` by definition. So `min(acts) ==
    _activation_instant(winner.row, ...)` for every multi-row bucket, ALWAYS, structurally — the
    per-row gap this test used to count no longer exists to be counted, on ANY slice, real or
    synthetic. Asserting `23` again would be asserting `0 == 23`.

    `re_minimised == 0` here is `[MEDIDO]`, not assumed: this loop still runs it, so a REGRESSION
    that puts `available_at` back into the activation key would turn this red (a nonzero count),
    the same way a positive count once proved the OLD key carried the defect.

    `ADR-039`/`D3`'s underlying concern — a later-arriving revision winning by
    `_first_observation_order` rather than by "first absorbed" — is UNCHANGED and still gated by
    `_absorb`'s re-minimisation (`test_falsifier_d3_keeping_the_first_row_that_activated_is_
    caught`, below). What changed is only HOW that tie can arise: before `D1`, by two rows of one
    bucket activating at genuinely different wall-clock instants; since `D1`, only by two rows
    of one bucket sharing ONE activation instant and needing a tie-break, which `_absorb`
    supplies by comparing `_first_observation_order` rather than by processing order.
    """
    observations = _observations()
    by_bucket: dict[tuple[str, int], list[Observation]] = {}
    for o in observations:
        by_bucket.setdefault((o.row.series_key_id, o.row.bucket_end), []).append(o)
    re_minimised = 0
    multi_row_buckets = 0
    for rows in by_bucket.values():
        if len(rows) < 2:
            continue
        multi_row_buckets += 1
        winner = min(rows, key=as_of_accessor._first_observation_order)  # noqa: SLF001
        acts = [_activation_instant(o.row, bar_policy=BarPolicy.FINAL_ONLY) for o in rows]
        if _activation_instant(winner.row, bar_policy=BarPolicy.FINAL_ONLY) > min(acts):
            re_minimised += 1
    assert multi_row_buckets > 0, (
        "the slice has to carry at least one multi-row bucket to prove anything"
    )
    assert re_minimised == 0, (
        f"a per-row activation gap resurfaced under `final_only` ({re_minimised} buckets) — "
        f"`available_at` is back in `_activation_instant`'s key, which `ADR-042`/`D1` retired"
    )


def test_no_backwards_revision_in_md_series_today_can_move_a_reading() -> None:
    """Measure why `D3`'s falsifier has to be synthetic: PRESENT is not the same as VISIBLE.

    ⛔ It is stated here, in the universe section, instead of hidden next to a green test.

    A re-minimisation only changes an ANSWER if the revised row activates while its own bucket
    is still the newest admitted one. The moment the NEXT bucket activates, `as_of` stops
    looking at the older one and no revision to it can matter. Over the WHOLE table today, that
    never happens once:

        [MEDIDO 2026-09-16, `deploy-postgres-1`, `BEGIN READ ONLY`, nenhuma semeadura]

        WITH r AS (SELECT series_key_id, symbol, bucket_end, observed_at, source, ingested_at,
                          greatest(available_at, bucket_end) AS act FROM md.series),
             w AS (SELECT DISTINCT ON (series_key_id, symbol, bucket_end) …, act AS win_act
                   FROM r ORDER BY …, observed_at, source, ingested_at),
             f AS (SELECT …, min(act) AS min_act, count(*) AS n FROM r GROUP BY 1,2,3),
             j AS (SELECT …, lead(f.min_act) OVER (PARTITION BY series_key_id, symbol
                                                   ORDER BY bucket_end) AS next_min_act …)
        SELECT count(*) FROM j
        WHERE n > 1 AND win_act > min_act AND next_min_act IS NOT NULL AND win_act < next_min_act;
        -- 0        (against 5.624 buckets that ARE re-minimised, over 147.860 multi-row ones)

    ⇒ `D3` is a real property of the ROWS and, on today's data, unobservable at the READING.
    The median revision on this series lands `105.634.113 ms` after the bucket closed — about
    `1,2 days`, and the next bucket takes over `300.000 ms` in. So the `D3` falsifier below
    CANNOT be carried by this slice, and saying so is the point: a falsifier that silently
    could not fire is the `rc=0` ambiguity `ADR-012` names, and it would have let
    `_absorb` degrade to "first arrival wins" with the suite green.

    ⛔ THIS TEST IS **NOT** AN AUTOMATIC TRIPWIRE, AND THE PREVIOUS VERSION OF THIS PARAGRAPH
    CLAIMED IT WAS. It read "the day a revision lands inside its own bucket's ownership window,
    this assertion fails" — which is FALSE, and falsely in the exact direction this whole file
    warns about. It asserts over `_observations()`, the slice FROZEN by md5 at the top of this
    module, not over `md.series`: the frozen bytes cannot acquire a new shape, so the day the
    shape appears in production this assertion goes on passing. Claiming a gate that cannot
    fire is the `rc=0` ambiguity of `ADR-012` — the same one the paragraph above denounces —
    and it was caught by `/review` of this branch, not by the suite.

    WHAT IT ACTUALLY IS: a PIN on the frozen slice. It fails only if someone RE-EXPORTS the
    slice and the new bytes carry a readable re-minimisation — so the trigger is **manual, and
    owned by whoever re-exports**. The check itself is the `SELECT` above, and it has to be
    re-run by hand against `md.series` (read-only) before trusting `D3`'s synthetic falsifier
    again. `[NÃO MEDIDO automaticamente — por construção, e agora dito em vez de implicado]`

    ⚠️ `ADR-042`/`D1`, ADDED HERE RATHER THAN LEFT IMPLIED: `activations` below is computed with
    `_activation_instant(..., bar_policy=FINAL_ONLY)`, and since `D1` that key is `bucket_end`
    alone — identical for every row of one bucket. So `activations[bucket_end] == win_act`
    ALWAYS now, and `activations[bucket_end] < win_act` (this loop's own middle condition) is
    `False` unconditionally: `visible == 0` holds STRUCTURALLY, not because today's revisions
    happen to land outside their bucket's ownership window. The `SELECT` above still measures a
    true, separate fact about the ROWS (whether ANY revision today lands inside that window by
    real-world timing) — that fact just stopped being what decides this assertion. See
    `test_the_real_slice_no_longer_carries_a_per_row_d3_activation_gap_under_adr_042`, which
    names the same consequence directly rather than through this loop's side effect.
    """
    observations = _observations()
    by_series: dict[str, dict[int, list[Observation]]] = {}
    for o in observations:
        by_series.setdefault(o.row.series_key_id, {}).setdefault(o.row.bucket_end, []).append(o)
    visible = 0
    for buckets in by_series.values():
        activations = {
            bucket_end: min(
                _activation_instant(o.row, bar_policy=BarPolicy.FINAL_ONLY) for o in rows
            )
            for bucket_end, rows in buckets.items()
        }
        ordered = sorted(buckets)
        for index, bucket_end in enumerate(ordered[:-1]):
            rows = buckets[bucket_end]
            if len(rows) < 2:
                continue
            winner = min(rows, key=as_of_accessor._first_observation_order)  # noqa: SLF001
            win_act = _activation_instant(winner.row, bar_policy=BarPolicy.FINAL_ONLY)
            if activations[bucket_end] < win_act < activations[ordered[index + 1]]:
                visible += 1
    assert visible == 0, (
        f"{visible} backwards revisions now land while their own bucket is still the newest "
        f"one — `ADR-039`/`D3` became observable on real rows, so its falsifier must stop "
        f"being synthetic"
    )


def test_the_slice_holds_both_series_so_the_weld_guard_is_exercised() -> None:
    """`ADR-039`/`D6` vetoes dropping `series_key_id`/`symbol`; this is the row set that bites."""
    counted = Counter(o.row.series_key_id for o in _observations())
    assert dict(counted) == {
        _OPEN_INTEREST_ID: 460,
        _funding_estimado_key(_SYMBOL, "60s").series_key_id(): 111,
    }


# ── `DoD-2` ITSELF ─────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("case", [c for _, c in _CASES], ids=[n for n, _ in _CASES])
@pytest.mark.parametrize("bar_policy", list(BarPolicy), ids=[p.value for p in BarPolicy])
def test_dod_2_the_batch_projection_is_bit_identical_to_the_definition(
    case: object, bar_policy: BarPolicy
) -> None:
    """`ADR-039`/`C3`: `as_of_batch(...)[i].projection() == as_of(t=instants[i], …).projection()`.

    `projection()` (`D4.6`) is the canonical shape — `Decimal` as its own digits, never a float —
    so this is a comparison of BYTES, not of Python object identity or of a repr.
    """
    series, policy = case()  # type: ignore[operator]
    observations = _observations()
    instants = _instants(_grid(observations, series), bar_policy=bar_policy)
    batched = _in_batch(
        instants,
        series=series,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
    )
    definition = _one_by_one(
        instants,
        series=series,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
    )

    assert len(batched) == len(instants)
    for index, t in enumerate(instants):
        assert batched[index].projection() == definition[index].projection(), (
            f"differential broke at instants[{index}] = {t} on {series.metric}/{bar_policy.value}"
        )


@pytest.mark.parametrize("case", [c for _, c in _CASES], ids=[n for n, _ in _CASES])
def test_the_differential_is_not_a_wall_of_absences(case: object) -> None:
    """`ADR-012`: two functions that both answer "nothing" everywhere agree for free.

    A differential over a grid where every reading is an `Absence` proves that the pointer never
    had to choose a winner — the exact `rc=0` ambiguity between "nothing diverged" and "nothing
    was ever compared". This is the floor that makes the assertion above mean something.
    """
    series, policy = case()  # type: ignore[operator]
    observations = _observations()
    bar_policy = BarPolicy.FINAL_ONLY
    instants = _instants(_grid(observations, series), bar_policy=bar_policy)
    batched = _in_batch(
        instants,
        series=series,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
    )
    with_value = [r for r in batched if r.value is not None]
    assert len(instants) >= 100, len(instants)
    assert len(with_value) >= len(instants) // 2, (
        f"only {len(with_value)} of {len(instants)} instants produced a value — the differential "
        f"would be comparing two functions that both answered nothing"
    )


# ── THE THEOREM THE SCAN RESTS ON, CHECKED ON THE SAME REAL ROWS ───────────────────────────


@pytest.mark.parametrize("bar_policy", list(BarPolicy), ids=[p.value for p in BarPolicy])
def test_admission_is_monotone_in_t_and_activation_is_where_it_flips(bar_policy: BarPolicy) -> None:
    """`ADR-039`/`D2`, stated as an equality and checked row by row, instant by instant.

        `_admits(o, t)` == `_admits(o, t=activation(o))` and `activation(o) <= t`

    This is the ONE property that licenses replacing a per-instant rescan with a forward cursor.
    If it ever stops holding, `as_of_batch` is wrong for a reason no amount of re-reading the
    loop would reveal — so it is checked on real rows rather than argued.
    """
    observations = _observations()
    series, _ = _open_interest_case()
    key_id = series.series_key_id()
    instants = _instants(_grid(observations, series), bar_policy=bar_policy)
    checked = 0
    for o in observations:
        activation = _activation_instant(o.row, bar_policy=bar_policy)
        admitted_at_activation = _admits(
            o,
            series_key_id=key_id,
            symbol=_SYMBOL,
            t=activation,
            bar_policy=bar_policy,
            knowledge_time=_KNOWLEDGE_TIME,
        )
        for t in instants:
            direct = _admits(
                o,
                series_key_id=key_id,
                symbol=_SYMBOL,
                t=t,
                bar_policy=bar_policy,
                knowledge_time=_KNOWLEDGE_TIME,
            )
            assert direct == (admitted_at_activation and activation <= t)
            checked += 1
    assert checked >= 100_000, checked


# ── THE FALSIFIERS: THE DIFFERENTIAL HAS TO GO RED, OR IT IS CEREMONY ──────────────────────
#
# "Verde nao prova nada ate uma mutacao reprovar." Each test below breaks ONE of the two
# decisions `ADR-039` took against real data and asserts the differential CATCHES it. Both
# mutations are the naive, obvious implementation — the one a reader would write from the
# contract without having seen the rows.


def test_falsifier_d2_keying_the_scan_on_available_at_alone_is_caught() -> None:
    """The LOOKAHEAD form of the activation key — `ADR-039`/`D2` — must turn this file RED.

    ⛔ It is caught only because the slice carries the WORST of the `748` rows (`-3.481.439 ms`).
    On a well-behaved fixture (`available_at >= bucket_end` everywhere) `max(available_at,
    bucket_end)` and `available_at` are THE SAME FUNCTION, this mutation is invisible, and a
    green differential would be reporting on a defect it structurally could not see.
    """
    series, policy = _funding_estimated_case()
    observations = _observations()
    bar_policy = BarPolicy.FINAL_ONLY
    instants = _instants(_grid(observations, series), bar_policy=bar_policy)
    definition = _one_by_one(
        instants,
        series=series,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
    )

    original = as_of_accessor._activation_instant  # noqa: SLF001
    try:
        as_of_accessor._activation_instant = (  # noqa: SLF001
            lambda row, *, bar_policy: row.available_at
        )
        mutated = _in_batch(
            instants,
            series=series,
            observations=observations,
            policy=policy,
            bar_policy=bar_policy,
        )
    finally:
        as_of_accessor._activation_instant = original  # noqa: SLF001

    divergences = [
        i for i in range(len(instants)) if mutated[i].projection() != definition[i].projection()
    ]
    assert divergences, (
        "keying the scan on `available_at` alone produced the SAME bits as the definition — "
        "the slice no longer carries a row with `available_at < bucket_end`, so `DoD-2` is "
        "green for the wrong reason"
    )


def _revision_inside_its_own_ownership_window() -> tuple[Observation, ...]:
    """Two rows of ONE bucket, tied on activation, where `_absorb`'s re-minimisation matters.

    ⚠️ THIS IS THE ONE SYNTHETIC INPUT IN THIS FILE, AND IT IS LABELLED RATHER THAN BLENDED IN.
    `test_no_backwards_revision_in_md_series_today_can_move_a_reading` measures WHY it has to
    be synthetic: `0` of the `5.624` re-minimised buckets in `md.series` revise before the next
    bucket takes over, so no real slice can carry the shape today. The alternative was to ship
    the `D3` falsifier knowing it could not fire, which is the failure `ADR-012` names.

    The IDENTITY is real — the open-interest key of the pilot catalog, so the weld guard and
    every other predicate behave exactly as they do on the rows above. What is fabricated is the
    TIMING, and only the timing:

        row `live`     `observed_at = B + 10.000`
        row `revision` `observed_at = B + 5.000`   <- wins, argmin(observed_at)

    ⚠️ `ADR-042`/`D1` CHANGED WHAT "TIMING" MEANS HERE. Before `D1`, `available_at` set each
    row's OWN activation instant, so `live` and `revision` activated at genuinely different `t`
    (the docstring this replaces staged that staggering on purpose). Since `D1`,
    `_activation_instant` under `final_only` is `bucket_end` alone — IDENTICAL for both rows,
    because they share one bucket. So both are admitted from the FIRST grid instant this test
    asks about, and the tie is broken the other way `_absorb` breaks ties: by
    `_first_observation_order` (`observed_at`), never by which row the cursor happened to reach
    first. `available_at` still has to clear `knowledge_time` for each row to be admitted at
    all — `bucket_end + 70_000` does, comfortably, against this file's `_KNOWLEDGE_TIME` — but it
    no longer decides WHEN either row enters.
    """
    bucket_end = 1_789_383_000_000
    series, _ = _open_interest_case()
    key_id = series.series_key_id()

    def _row(*, available_at: int, observed_at: int, value_raw: str, source: str) -> Observation:
        row = SeriesRow(
            series_key_id=key_id,
            symbol=_SYMBOL,
            source=source,
            bucket_end=bucket_end,
            event_time=bucket_end,
            available_at=available_at,
            availability_source=AvailabilitySource.OBSERVED,
            ingested_at=observed_at,
            observed_at=observed_at,
            provenance=Provenance.OBSERVED,
            src_label_raw=source,
            observer_id="adr-039-d3-falsifier",
            observer_region="unknown",
            is_final=True,
            value_raw=value_raw,
            principal_id=None,
        )
        return Observation(row=row, value=Decimal(value_raw))

    return (
        _row(
            available_at=bucket_end + 10_000,
            observed_at=bucket_end + 10_000,
            value_raw="1.00000000",
            source="/futures/data/openInterestHist",
        ),
        _row(
            available_at=bucket_end + 70_000,
            observed_at=bucket_end + 5_000,
            value_raw="2.00000000",
            source="/futures/data/openInterestHist",
        ),
    )


def test_falsifier_d3_keeping_the_first_row_that_activated_is_caught() -> None:
    """The "first arrival wins" form — `ADR-039`/`D3` — must turn this file RED.

    The mutation is one word: absorb only when the bucket has no incumbent yet, instead of
    re-minimising by `_first_observation_order`. It runs on the labelled synthetic pair above,
    for the measured reason that test states — and the assertion that the UNMUTATED batch still
    matches the definition on the same two rows is what keeps this from being a test of the
    mutation alone.

    ⚠️ `ADR-042`/`D1`: both instants now show `revision` from the START, not just the second one
    — see `_revision_inside_its_own_ownership_window`'s docstring for why the two rows tie on
    activation under `final_only` since `D1`. The MECHANISM this falsifier proves is unchanged
    (`_absorb` has to re-minimise, not keep the first row it saw); only the SHAPE of the
    divergence moved from "wrong at the second instant" to "wrong at both", because there is no
    longer a first instant where only `live` has activated.
    """
    series, policy = _open_interest_case()
    observations = _revision_inside_its_own_ownership_window()
    bar_policy = BarPolicy.FINAL_ONLY
    bucket_end = observations[0].row.bucket_end
    instants = (bucket_end + 59_999, bucket_end + 119_999)
    definition = _one_by_one(
        instants,
        series=series,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
    )
    honest = _in_batch(
        instants,
        series=series,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
    )
    assert [r.projection() for r in honest] == [r.projection() for r in definition]
    assert definition[0].value == Decimal("2.00000000"), (
        "`revision` (smaller observed_at) has to win from the FIRST instant: since `ADR-042`/"
        "`D1` both rows of this bucket activate together (`bucket_end` alone), so there is no "
        "instant where only `live` has entered"
    )
    assert definition[1].value == Decimal("2.00000000"), (
        "the definition itself stopped picking `revision` by `argmin(observed_at)` — the shape "
        "this falsifier is about no longer exists in `as_of`"
    )

    def _keep_first(
        observation: Observation,
        *,
        best_by_bucket_end: dict[int, Observation],
        latest_bucket_end: int | None,
    ) -> int:
        bucket_end = observation.row.bucket_end
        best_by_bucket_end.setdefault(bucket_end, observation)
        return bucket_end if latest_bucket_end is None else max(latest_bucket_end, bucket_end)

    original = as_of_accessor._absorb  # noqa: SLF001
    try:
        as_of_accessor._absorb = _keep_first  # noqa: SLF001
        mutated = _in_batch(
            instants,
            series=series,
            observations=observations,
            policy=policy,
            bar_policy=bar_policy,
        )
    finally:
        as_of_accessor._absorb = original  # noqa: SLF001

    divergences = [
        i for i in range(len(instants)) if mutated[i].projection() != definition[i].projection()
    ]
    assert divergences == [0, 1], (
        f"keeping the first row that activated diverged at {divergences}, expected BOTH instants "
        f"— since `ADR-042`/`D1` both rows tie on activation, so `live` is already the (wrong) "
        f"incumbent by the time either instant is read"
    )
    assert mutated[0].value == Decimal("1.00000000")
    assert mutated[1].value == Decimal("1.00000000")


def test_a_grid_that_goes_backwards_is_refused_rather_than_answered() -> None:
    """The one-way cursor cannot answer an instant it has passed, so it refuses saying so."""
    series, policy = _open_interest_case()
    observations = _observations()
    instants = _instants(_grid(observations, series), bar_policy=BarPolicy.FINAL_ONLY)
    backwards = (instants[10], instants[9])
    with pytest.raises(as_of_accessor.DecisionReadRefusedError, match="non-decreasing"):
        _in_batch(
            backwards,
            series=series,
            observations=observations,
            policy=policy,
            bar_policy=BarPolicy.FINAL_ONLY,
        )


def test_absorb_is_reachable_and_is_what_the_falsifier_above_replaced() -> None:
    """Guard against the mutation tests silently patching a name that no longer exists."""
    assert callable(_absorb)
    assert callable(_activation_instant)
    assert callable(_admits)


def _older_bucket_activating_last() -> tuple[Observation, ...]:
    """Two buckets, `intrabar`; the OLDER one is ABSORBED LAST.

    The shape `max(latest, bucket_end)` in `_absorb` exists for.

    ⚠️ SYNTHETIC AND LABELLED, same contract as `_revision_inside_its_own_ownership_window`
    above: the IDENTITY is the real open-interest key of the pilot catalog, and only the
    TIMING/ORDER is fabricated.

    ⚠️ `ADR-042`/`D1` MOVED WHAT MAKES THIS SHAPE POSSIBLE. Before `D1` this fixture used
    `final_only`: the OLD bucket's large `available_at` made it activate LATER, in real `t`,
    than the NEW bucket — `_activation_instant` was `max(available_at, bucket_end)` then, so a
    late `available_at` could push a row's activation past a chronologically newer bucket's.
    Since `D1`, `final_only`'s activation is `bucket_end` ALONE (`available_at` gates admission
    against `knowledge_time`, not timing), so buckets always activate in `bucket_end` order —
    the older bucket can never again activate after the newer one, and this exact fixture would
    no longer exercise `_absorb`'s `max()` under `final_only`.

    Under `intrabar`, R-2 never applied and `D1` retired the last `t`-dependent term
    (`_ADMITTED_FROM_THE_START`): every admitted row activates AT ONCE, tied, and ties are
    broken by the ORDER `_activated_in_order`'s stable sort leaves them in — the order this
    tuple is written in. Listing the NEW row first and the OLD row second reproduces "the older
    bucket is absorbed after the newer one", now by INPUT ORDER rather than by wall-clock
    timing:

        bucket NEW (`B`)          value `9.0`   <- absorbed FIRST
        bucket OLD (`B - 60.000`) value `1.0`   <- absorbed SECOND

    `_absorb` returns the running latest `bucket_end`. Dropping the `max` makes absorbing the
    OLD row move the pointer BACKWARDS, and the reading answers `1.0` — a stale value drawn as
    the current one, which is precisely the screen defect this whole feature exists to prevent.
    """
    bucket_new = 1_789_383_000_000
    bucket_old = bucket_new - 60_000
    series, _ = _open_interest_case()
    key_id = series.series_key_id()

    def _row(*, bucket_end: int, available_at: int, value_raw: str) -> Observation:
        row = SeriesRow(
            series_key_id=key_id,
            symbol=_SYMBOL,
            source="/futures/data/openInterestHist",
            bucket_end=bucket_end,
            event_time=bucket_end,
            available_at=available_at,
            availability_source=AvailabilitySource.OBSERVED,
            ingested_at=available_at,
            observed_at=available_at,
            provenance=Provenance.OBSERVED,
            src_label_raw="/futures/data/openInterestHist",
            observer_id="adr-039-latest-bucket-end-falsifier",
            observer_region="unknown",
            is_final=True,
            value_raw=value_raw,
            principal_id=None,
        )
        return Observation(row=row, value=Decimal(value_raw))

    return (
        _row(bucket_end=bucket_new, available_at=bucket_new + 10_000, value_raw="9.00000000"),
        _row(bucket_end=bucket_old, available_at=bucket_new + 130_000, value_raw="1.00000000"),
    )


def test_falsifier_the_latest_bucket_end_must_never_move_backwards() -> None:
    """`ADR-039` §3 item 3: dropping the `max` in `_absorb` draws a STALE value as current.

    Found by `/review` of this branch: mutating `as_of_accessor.py`'s last line of `_absorb`
    to `return bucket_end` left the whole suite GREEN `[MEDIDO 2026-09-16: 64 passed with the
    mutation in place]`. A contract line with no falsifier is a contract line the gate cannot
    hold, which is the `rc=0` ambiguity of `ADR-012` — so this test exists to make that
    mutation red.

    It asserts the DIVERGENCE, not just the mutation: the unmutated batch has to keep matching
    `as_of` on the same rows, or the test would be measuring its own fixture.

    `bar_policy=INTRABAR`, since `ADR-042`/`D1` (`_older_bucket_activating_last`'s docstring has
    the argument): under `final_only`, `D1` made activation `bucket_end` alone, so an older
    bucket can no longer be absorbed AFTER a newer one — the shape this falsifier needs. `intrabar`
    still reproduces it, now via absorption ORDER rather than wall-clock timing. Both grid
    instants land on the SAME side of that absorption (it happens in the cursor's first pass),
    so both show the same value — unlike the pre-`D1` version of this test, where the divergence
    was staggered across the two instants.
    """
    series, policy = _open_interest_case()
    observations = _older_bucket_activating_last()
    bar_policy = BarPolicy.INTRABAR
    bucket_new = observations[0].row.bucket_end
    instants = (bucket_new + 60_000, bucket_new + 140_000)

    definition = _one_by_one(
        instants,
        series=series,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
    )
    honest = _in_batch(
        instants,
        series=series,
        observations=observations,
        policy=policy,
        bar_policy=bar_policy,
    )
    assert [r.projection() for r in honest] == [r.projection() for r in definition]
    assert definition[0].value == Decimal("9.00000000")
    assert definition[1].value == Decimal("9.00000000"), (
        "the definition itself stopped holding the newest bucket once an older one activates "
        "later — the shape this falsifier is about no longer exists in `as_of`"
    )

    def _forget_the_max(
        observation: Observation,
        *,
        best_by_bucket_end: dict[int, Observation],
        latest_bucket_end: int | None,
    ) -> int:
        bucket_end = observation.row.bucket_end
        incumbent = best_by_bucket_end.get(bucket_end)
        if incumbent is None or _first_observation_order(observation) < _first_observation_order(
            incumbent
        ):
            best_by_bucket_end[bucket_end] = observation
        return bucket_end

    original = as_of_accessor._absorb  # noqa: SLF001
    try:
        as_of_accessor._absorb = _forget_the_max  # noqa: SLF001
        mutated = _in_batch(
            instants,
            series=series,
            observations=observations,
            policy=policy,
            bar_policy=bar_policy,
        )
    finally:
        as_of_accessor._absorb = original  # noqa: SLF001

    assert mutated[0].value == Decimal("1.00000000"), (
        "the mutation stopped diverging — this falsifier no longer proves the `max` is "
        "load-bearing, and the contract line goes back to having no gate"
    )
    assert mutated[1].value == Decimal("1.00000000")
    assert [r.projection() for r in mutated] != [r.projection() for r in definition]
