"""`D16`/`E1` precondition — the measured publication lag, and the falsifiers that hold it.

The obligation this file exists to meet, literal from the task that created the table: *"um
teste que reprove se alguem trocar o numero sem remedir. Mutacao obrigatoria: trocar o valor tem
de matar teste."* A test that merely repeats `59_361` in a second place would not meet it — it
would only ask for the same typo twice.

So the number is not asserted here, it is RECOMPUTED. Each endpoint carries its measured UPPER
TAIL below: the `k` largest readings of the frozen window, with `k = n - ceil(0.99 * n) + 1`,
which is exactly the slice a nearest-rank `p99` reads. `_sample_with_measured_tail` rebuilds a
sample of the true length `sample_n` whose tail is that real data, and
`availability_lag_stats.p99` — the repository's own percentile, not a second implementation —
is run over it. Editing `lag_p99_ms` alone makes that recomputation disagree; editing the tail
to match breaks the tail's own relationship to `lag_max_ms`, to `sample_n` and to its own
ordering. Making all of it agree again means going back to the database and remeasuring, which
is the behaviour the mutation requirement is asking for.

Every constant below is `[MEDIDO 2026-09-11]` against `deploy-postgres-1`, read-only, with the
window frozen at `bucket_end < 1789155360000`; the commands are quoted in
`src/modules/sentimento/domain/publication_lag_table.py`'s docstring and in
`docs/context/cinco-metricas-do-core/handoff/MEDICAO-ATRASO-DE-PUBLICACAO.md`.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import pytest

from src.modules.sentimento.domain.availability_lag_stats import LAG_STAT_NAME, p99
from src.modules.sentimento.domain.publication_lag_table import (
    ENDPOINT_PUBLICATION_LAG,
    MIN_PUBLICATION_LAG_SAMPLES,
    MIN_PUBLICATION_LAG_WINDOW_HOURS,
    PUBLICATION_LAG_STAT_NAME,
    MeasuredPublicationLag,
    UnmeasuredPublicationLagError,
    publication_lag_for_endpoint,
)

KLINES = "/fapi/v1/klines"
PREMIUM_INDEX = "/fapi/v1/premiumIndex"

# ── the raw evidence: the upper tail of each measured distribution ──────────────────────────
#
#   docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -c "
#   with g as (select series_key_id, available_at, count(*) nb from md.series group by 1,2),
#        live as (select s.* from md.series s
#                   join g on g.series_key_id = s.series_key_id
#                         and g.available_at = s.available_at and g.nb = 1
#                  where s.bucket_end < 1789155360000 and s.source = '<endpoint>')
#   select string_agg(l::text, ',' order by l) from
#     (select available_at-bucket_end l from live order by 1 desc limit <k>) t;"

# `n = 4.079` -> `ceil(0.99 * 4079) = 4039` -> `k = 4079 - 4039 + 1 = 41`.
KLINES_LAG_TAIL_MS: tuple[int, ...] = (
    59_361, 59_384, 59_418, 59_430, 59_468, 59_485, 59_516, 59_531,
    59_553, 59_567, 59_570, 59_571, 59_594, 59_598, 59_603, 59_605,
    59_605, 59_622, 59_633, 59_673, 59_692, 59_694, 59_724, 59_734,
    59_738, 59_764, 59_777, 59_786, 59_822, 59_830, 59_845, 59_871,
    59_885, 59_906, 59_926, 59_932, 59_941, 59_944, 59_972, 59_980,
    59_999,
)  # fmt: skip

# `n = 34.752` -> `ceil(0.99 * 34752) = 34405` -> `k = 34752 - 34405 + 1 = 348`. The repeats are
# real and structural: one poll instant writes 8 rows (4 symbols x 2 series keys), so the same
# lag appears up to 16 times in a row.
PREMIUM_INDEX_LAG_TAIL_MS: tuple[int, ...] = (
    1_758, 1_758, 1_758, 1_758, 1_758, 1_758, 1_759, 1_759, 1_759, 1_759,
    1_759, 1_759, 1_765, 1_765, 1_765, 1_765, 1_771, 1_771, 1_771, 1_771,
    1_771, 1_771, 1_772, 1_772, 1_772, 1_772, 1_772, 1_772, 1_772, 1_772,
    1_773, 1_773, 1_773, 1_773, 1_773, 1_773, 1_773, 1_773, 1_774, 1_774,
    1_774, 1_774, 1_774, 1_774, 1_774, 1_774, 1_774, 1_774, 1_774, 1_774,
    1_774, 1_774, 1_774, 1_774, 1_778, 1_778, 1_778, 1_778, 1_778, 1_778,
    1_781, 1_781, 1_781, 1_781, 1_781, 1_781, 1_781, 1_781, 1_783, 1_783,
    1_783, 1_783, 1_783, 1_783, 1_791, 1_791, 1_791, 1_791, 1_791, 1_791,
    1_793, 1_793, 1_793, 1_793, 1_793, 1_793, 1_793, 1_793, 1_793, 1_793,
    1_793, 1_793, 1_793, 1_793, 1_793, 1_793, 1_803, 1_803, 1_803, 1_803,
    1_803, 1_803, 1_803, 1_803, 1_803, 1_803, 1_803, 1_803, 1_808, 1_808,
    1_808, 1_808, 1_808, 1_808, 1_808, 1_808, 1_809, 1_809, 1_809, 1_809,
    1_809, 1_809, 1_809, 1_809, 1_811, 1_811, 1_813, 1_813, 1_813, 1_813,
    1_813, 1_813, 1_813, 1_813, 1_814, 1_814, 1_814, 1_814, 1_814, 1_814,
    1_814, 1_814, 1_816, 1_816, 1_816, 1_816, 1_816, 1_816, 1_816, 1_816,
    1_816, 1_816, 1_816, 1_816, 1_817, 1_817, 1_817, 1_817, 1_817, 1_817,
    1_817, 1_817, 1_818, 1_818, 1_818, 1_818, 1_823, 1_823, 1_823, 1_823,
    1_823, 1_823, 1_823, 1_823, 1_829, 1_829, 1_829, 1_829, 1_829, 1_829,
    1_829, 1_829, 1_831, 1_831, 1_831, 1_831, 1_831, 1_831, 1_831, 1_831,
    1_832, 1_832, 1_832, 1_832, 1_832, 1_832, 1_832, 1_832, 1_839, 1_839,
    1_839, 1_839, 1_839, 1_839, 1_839, 1_839, 1_841, 1_841, 1_841, 1_841,
    1_841, 1_841, 1_841, 1_841, 1_841, 1_841, 1_841, 1_841, 1_841, 1_841,
    1_842, 1_842, 1_842, 1_842, 1_842, 1_842, 1_846, 1_846, 1_846, 1_846,
    1_846, 1_846, 1_846, 1_846, 1_851, 1_851, 1_851, 1_851, 1_851, 1_851,
    1_851, 1_851, 1_853, 1_853, 1_853, 1_853, 1_853, 1_853, 1_853, 1_853,
    1_853, 1_853, 1_853, 1_853, 1_853, 1_853, 1_853, 1_853, 1_853, 1_853,
    1_855, 1_855, 1_855, 1_855, 1_855, 1_855, 1_855, 1_855, 1_877, 1_877,
    1_877, 1_877, 1_877, 1_877, 1_877, 1_877, 1_877, 1_877, 1_877, 1_877,
    1_877, 1_877, 1_878, 1_878, 1_878, 1_878, 1_878, 1_878, 1_878, 1_878,
    1_880, 1_880, 1_880, 1_880, 1_880, 1_880, 1_880, 1_880, 1_881, 1_881,
    1_881, 1_881, 1_881, 1_881, 1_881, 1_881, 1_885, 1_885, 1_885, 1_885,
    1_885, 1_885, 1_885, 1_885, 1_887, 1_887, 1_887, 1_887, 1_887, 1_887,
    1_887, 1_887, 1_888, 1_888, 1_888, 1_888, 1_888, 1_888, 1_889, 1_889,
    1_889, 1_889, 1_889, 1_889, 1_889, 1_889, 1_895, 1_895, 1_895, 1_895,
    1_895, 1_895, 1_895, 1_895, 1_895, 1_895, 1_895, 1_895,
)  # fmt: skip

MEASURED_LAG_TAIL_MS: dict[str, tuple[int, ...]] = {
    KLINES: KLINES_LAG_TAIL_MS,
    PREMIUM_INDEX: PREMIUM_INDEX_LAG_TAIL_MS,
}

# ── the evidence for Q3 (per endpoint, not per symbol) ──────────────────────────────────────
#   ... select source, symbol, count(*), percentile_disc(0.99) within group
#       (order by available_at-bucket_end) from live group by 1,2 order by 1,2;
MEASURED_PER_SYMBOL_P99_MS: dict[str, dict[str, int]] = {
    KLINES: {"BTCUSDT": 59_248, "ETHUSDT": 59_430, "LINKUSDT": 59_531, "SOLUSDT": 59_361},
    PREMIUM_INDEX: {"BTCUSDT": 1_740, "ETHUSDT": 1_758, "LINKUSDT": 1_774, "SOLUSDT": 1_774},
}

# ── the evidence for Q2 (stability over time) ───────────────────────────────────────────────
#   ... group by source, to_char(to_timestamp(bucket_end/1000.0) at time zone 'UTC',
#       'YYYY-MM-DD HH24') having count(*) >= 100 -- in chronological order
# The FINAL hour of each series is truncated by the frozen window's right edge (klines `55_791`,
# premiumIndex `1_521`) and is dropped below: comparing a partial hour's order statistic against
# whole hours would manufacture a downward "trend" out of a smaller `n`.
# fmt: off
MEASURED_HOURLY_P99_MS: dict[str, tuple[int, ...]] = {
    KLINES: (
        58_854, 59_325, 59_214, 59_418, 58_951, 59_531, 58_944, 59_594, 59_567,
        59_203, 59_091, 59_692, 59_319, 59_273, 59_209, 59_229, 59_179,
    ),
    PREMIUM_INDEX: (
        1_832, 1_813, 1_793, 1_647, 1_803, 1_791, 1_816, 1_877, 1_773, 1_701,
        1_853, 1_888, 1_682, 1_625, 1_744, 1_895, 1_610, 1_842, 1_715, 1_717,
        1_694, 1_739, 1_598, 1_729, 1_877, 1_880, 1_751, 1_753, 1_855, 1_853,
        1_706, 1_889, 1_817, 1_667, 1_698, 1_573, 1_885, 1_749, 1_729, 1_771,
        1_669, 1_731, 1_716, 1_748, 1_816, 1_640, 1_691, 1_741, 1_523, 1_814,
        1_752, 1_887, 1_635, 1_736, 1_774, 1_841, 1_851, 1_878, 1_783, 1_839,
        1_735, 1_895, 1_829, 1_823, 1_781, 1_846, 1_793, 1_753, 1_831, 1_738,
        1_841, 1_881, 1_717,
    ),
}
# fmt: on

# Same endpoint, same window, one bucket per DAY instead of per hour — the second half of the
# Q2 argument: dispersion that shrinks when `n` grows is sampling noise, not drift. Only
# `premiumIndex` has more than one whole day of live rows.
MEASURED_DAILY_P99_MS: dict[str, tuple[int, ...]] = {
    PREMIUM_INDEX: (1_793, 1_753, 1_740, 1_809),
}


def _sample_with_measured_tail(record: MeasuredPublicationLag) -> tuple[int, ...]:
    """Rebuild a sample of `record.sample_n` readings whose upper tail is the measured one.

    The readings below the tail are not reconstructible and do not need to be: a nearest-rank
    `p99` never looks at them, it reads the `ceil(0.99 * n)`-th smallest, which is the first
    element of the tail. They are filled with `lag_min_ms` — a value the measurement actually
    observed, so the rebuilt sample stays a sorted sequence of real readings rather than a
    padded fiction with a fabricated magnitude in it.
    """
    tail = MEASURED_LAG_TAIL_MS[record.endpoint]
    return (record.lag_min_ms,) * (record.sample_n - len(tail)) + tail


def _relative_spread(values: Sequence[int]) -> float:
    """Return `(max - min) / median`, the dispersion measure both Q2 and Q3 are compared on."""
    ordered = sorted(values)
    return (ordered[-1] - ordered[0]) / ordered[len(ordered) // 2]


def _half_to_half_drift(series: Sequence[int]) -> float:
    """Return `|mean(second half) - mean(first half)| / mean(first half)`.

    The cheapest statistic that separates DRIFT (the halves differ) from NOISE (they do not),
    which is the exact question `D16` has to answer before a constant scalar can stand in for a
    time-varying lag.
    """
    half = len(series) // 2
    first = sum(series[:half]) / half
    second = sum(series[half:]) / len(series[half:])
    return abs(second - first) / first


# ── the number itself: recomputed from the measured tail, never merely repeated ─────────────


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_lag_p99_is_recomputed_from_the_measured_tail(endpoint: str) -> None:
    """`lag_p99_ms` must equal `p99()` of the real readings — the mutation killer.

    Change `lag_p99_ms` in the table without remeasuring and this fails: the tail is data, and
    data does not follow an edited constant.
    """
    record = ENDPOINT_PUBLICATION_LAG[endpoint]
    assert p99(_sample_with_measured_tail(record)) == record.lag_p99_ms


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_the_tail_is_exactly_the_slice_a_nearest_rank_p99_reads(endpoint: str) -> None:
    """`k = n - ceil(0.99n) + 1`, sorted, ending at `lag_max_ms` — the tail cannot be padded."""
    record = ENDPOINT_PUBLICATION_LAG[endpoint]
    tail = MEASURED_LAG_TAIL_MS[endpoint]
    assert len(tail) == record.sample_n - math.ceil(0.99 * record.sample_n) + 1
    assert list(tail) == sorted(tail)
    assert tail[0] == record.lag_p99_ms
    assert tail[-1] == record.lag_max_ms


def test_a_forged_p99_does_not_survive_the_tail() -> None:
    """The falsifier, run: a plausible edit of the constant must REPROVE, not merely look odd.

    `59_361 -> 59_000` is the shape of the edit this guard exists to catch — a rounder, still
    plausible number typed by somebody who did not rerun the query. `verde nao prova nada ate
    uma mutacao reprovar`, so the mutation is executed here instead of being asserted about.
    """
    measured = ENDPOINT_PUBLICATION_LAG[KLINES]
    forged = MeasuredPublicationLag(
        endpoint=measured.endpoint,
        lag_p99_ms=59_000,
        lag_min_ms=measured.lag_min_ms,
        lag_max_ms=measured.lag_max_ms,
        sample_n=measured.sample_n,
        poll_resolution_ms=measured.poll_resolution_ms,
        window_start_ms=measured.window_start_ms,
        window_end_ms=measured.window_end_ms,
        symbols=measured.symbols,
        measured_on=measured.measured_on,
    )
    assert p99(_sample_with_measured_tail(forged)) != forged.lag_p99_ms
    assert p99(_sample_with_measured_tail(measured)) == measured.lag_p99_ms


# ── Q1: the statistic is `p99`, and it is the SAME `p99` the lag table already fixed ─────────


def test_the_statistic_is_p99_and_is_not_respelled() -> None:
    """One decision, one spelling: `SPEC-001` §5.2's `p99_lag` is `availability_lag_stats`'."""
    assert PUBLICATION_LAG_STAT_NAME == LAG_STAT_NAME == "p99"


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_p99_is_pessimistic_against_the_median_it_replaces(endpoint: str) -> None:
    """The reason `p50` was refused, as a number: the median is EARLIER, and earlier is lookahead.

    A MODELED `available_at` built on a central statistic claims knowledge in the half of the
    cases where the real lag was longer — `PRD-001` §5.1's "otimistas em metade dos casos".
    """
    record = ENDPOINT_PUBLICATION_LAG[endpoint]
    sample = _sample_with_measured_tail(record)
    median = sorted(sample)[len(sample) // 2]
    assert median < record.lag_p99_ms


def test_p99_buys_almost_all_of_max_without_the_outlier() -> None:
    """Why not `max`: it costs one hostage reading and buys `1,06%` on klines."""
    record = ENDPOINT_PUBLICATION_LAG[KLINES]
    assert (record.lag_max_ms - record.lag_p99_ms) / record.lag_p99_ms < 0.02


# ── Q2: no drift — a constant scalar is a legitimate model ───────────────────────────────────


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_the_lag_does_not_drift_across_the_measurement_window(endpoint: str) -> None:
    """First half vs second half of the hourly `p99` series: `0,13%` for both endpoints.

    The threshold is `1%`, an order of magnitude above what was measured — a real drift shows up
    as a difference between the halves, and this is the assertion that would catch it.
    """
    assert _half_to_half_drift(MEASURED_HOURLY_P99_MS[endpoint]) < 0.01


def test_hourly_dispersion_is_sampling_noise_because_it_shrinks_with_n() -> None:
    """`premiumIndex`: `21,1%` spread at `n ~ 480/h`, `3,9%` at `n ~ 11.400/day`.

    Drift does not get smaller when the bucket gets bigger — noise does. This is what makes the
    wide hourly amplitude compatible with a single constant.
    """
    hourly = _relative_spread(MEASURED_HOURLY_P99_MS[PREMIUM_INDEX])
    daily = _relative_spread(MEASURED_DAILY_P99_MS[PREMIUM_INDEX])
    assert daily < hourly / 2


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_the_declared_p99_sits_inside_the_range_of_its_own_hourly_p99(endpoint: str) -> None:
    """A pooled `p99` that fell outside every hour's own `p99` would be a pooling artefact."""
    hourly = MEASURED_HOURLY_P99_MS[endpoint]
    assert min(hourly) <= ENDPOINT_PUBLICATION_LAG[endpoint].lag_p99_ms <= max(hourly)


# ── Q3: per endpoint, not per symbol ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_symbol_to_symbol_spread_is_smaller_than_the_endpoints_own_hourly_noise(
    endpoint: str,
) -> None:
    """`0,48%` vs `1,4%` (klines) and `1,93%` vs `21,1%` (`premiumIndex`).

    A per-symbol table would be fitting variation smaller than the noise of the same endpoint
    measured at a different hour — which is what "um valor por endpoint mente para alguns" would
    have to beat, and does not.
    """
    per_symbol = _relative_spread(list(MEASURED_PER_SYMBOL_P99_MS[endpoint].values()))
    hourly = _relative_spread(MEASURED_HOURLY_P99_MS[endpoint])
    assert per_symbol < hourly


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_the_declared_p99_sits_inside_the_range_of_its_own_per_symbol_p99(endpoint: str) -> None:
    """The tightest envelope the constant survives: `283` ms wide, `34` ms for `premiumIndex`.

    The four symbols carry a quarter of the sample each, so the pooled `p99` has to land between
    the smallest and the largest of their own. This is what closes the coordinated forgery the
    tail alone leaves open — editing `lag_p99_ms` AND the head of the tail together still has to
    land inside `34` ms of four independently measured numbers.
    """
    per_symbol = MEASURED_PER_SYMBOL_P99_MS[endpoint].values()
    assert min(per_symbol) <= ENDPOINT_PUBLICATION_LAG[endpoint].lag_p99_ms <= max(per_symbol)


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_every_symbol_the_record_names_has_its_own_measurement(endpoint: str) -> None:
    """The `symbols` field is the universe the value was measured over, not a decorative list."""
    assert set(ENDPOINT_PUBLICATION_LAG[endpoint].symbols) == set(
        MEASURED_PER_SYMBOL_P99_MS[endpoint]
    )


# ── the observer caveat: how much of the number is our own poll phase ────────────────────────


def test_poll_phase_share_separates_the_two_regimes() -> None:
    """Klines reads `0,967` (we are the delay), `premiumIndex` `0,031` (they are).

    This is the caveat every consumer of a MODELED row has to carry, and it is computed rather
    than asserted in prose: klines' `p99` is 96,7% our 60 s sampling period.
    """
    assert ENDPOINT_PUBLICATION_LAG[KLINES].poll_phase_share > 0.9
    assert ENDPOINT_PUBLICATION_LAG[PREMIUM_INDEX].poll_phase_share < 0.1


def test_a_live_lag_never_reaches_a_whole_poll_period() -> None:
    """Structural check on the fan-out separator: one poll, one bucket, lag under one period.

    A reading at or past `poll_resolution_ms` would mean the poll that produced it had a second
    newly closed bucket to report, and would therefore have been excluded by `nb = 1`. A record
    that violates this was not measured over the live population it claims.
    """
    for record in ENDPOINT_PUBLICATION_LAG.values():
        assert record.lag_max_ms < record.poll_resolution_ms


def test_premium_index_keeps_its_negative_minimum_instead_of_clamping_it() -> None:
    """`-100` ms is a real scheduling fact (the poll fires before the grid point); zero hides it."""
    assert ENDPOINT_PUBLICATION_LAG[PREMIUM_INDEX].lag_min_ms < 0


# ── the table as a gate: an unmeasured endpoint is refused, never defaulted ──────────────────


def test_an_unmeasured_endpoint_is_refused_not_defaulted() -> None:
    """`SPEC-001` §5.2: no measured lag means `available_at = NULL` and quarantine, not a guess."""
    with pytest.raises(UnmeasuredPublicationLagError) as excinfo:
        publication_lag_for_endpoint("/fapi/v1/openInterestHist")
    assert "never been measured" in str(excinfo.value)


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_publication_lag_for_endpoint_returns_the_measured_record(endpoint: str) -> None:
    """The accessor is the table, not a copy of it."""
    assert publication_lag_for_endpoint(endpoint) is ENDPOINT_PUBLICATION_LAG[endpoint]


def test_the_table_holds_exactly_the_endpoints_with_evidence_in_this_file() -> None:
    """A third endpoint added to the table without a measured tail here fails immediately."""
    assert set(ENDPOINT_PUBLICATION_LAG) == set(MEASURED_LAG_TAIL_MS)


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_every_record_is_keyed_by_its_own_endpoint(endpoint: str) -> None:
    """A record filed under the wrong key would attribute one endpoint's lag to another."""
    assert ENDPOINT_PUBLICATION_LAG[endpoint].endpoint == endpoint


# ── the record refuses to describe a measurement that never happened ─────────────────────────


def _record(**overrides: object) -> MeasuredPublicationLag:
    """Build a valid record with `overrides` applied — one invariant exercised at a time."""
    fields: dict[str, object] = {
        "endpoint": "/fapi/v1/test",
        "lag_p99_ms": 1_000,
        "lag_min_ms": 0,
        "lag_max_ms": 2_000,
        "sample_n": 10_000,
        "poll_resolution_ms": 60_000,
        "window_start_ms": 0,
        "window_end_ms": 24 * 60 * 60 * 1000,
        "symbols": ("BTCUSDT",),
        "measured_on": "2026-09-11",
    }
    fields.update(overrides)
    return MeasuredPublicationLag(**fields)  # type: ignore[arg-type]


def test_a_valid_record_is_accepted() -> None:
    """The helper itself has to pass, or every refusal below would prove nothing."""
    assert _record().lag_p99_ms == 1_000


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"lag_p99_ms": 3_000}, "falls outside"),
        ({"lag_p99_ms": -1}, "falls outside"),
        ({"sample_n": MIN_PUBLICATION_LAG_SAMPLES - 1}, "not a measured lag"),
        ({"window_start_ms": 10, "window_end_ms": 10}, "does not move forward"),
        (
            {"window_end_ms": (MIN_PUBLICATION_LAG_WINDOW_HOURS - 1) * 60 * 60 * 1000},
            "measured mid-drift",
        ),
        ({"poll_resolution_ms": 0}, "cannot be zero or negative"),
        ({"symbols": ()}, "names no universe"),
    ],
)
def test_a_record_that_contradicts_its_own_measurement_is_refused(
    overrides: dict[str, object], expected: str
) -> None:
    """Each refusal names what it caught — a `ValueError` with no cause is a dead end."""
    with pytest.raises(ValueError, match=expected):
        _record(**overrides)


def test_window_hours_measures_the_span_it_claims() -> None:
    """`window_hours` is what `MIN_PUBLICATION_LAG_WINDOW_HOURS` is checked against."""
    assert _record(window_start_ms=0, window_end_ms=13 * 60 * 60 * 1000).window_hours == 13.0
    assert ENDPOINT_PUBLICATION_LAG[KLINES].window_hours == pytest.approx(17.9, abs=0.05)
    assert ENDPOINT_PUBLICATION_LAG[PREMIUM_INDEX].window_hours == pytest.approx(72.9, abs=0.05)


# ── the grid invariant: a MODELED stamp must stay INSIDE the bucket's own native grid ────────
#
# `QA 2026-09-11`. `SPEC-001` §5.2 writes the MODELED stamp as
#
#     available_at_MODELED = proximo ponto da grade nativa >= (bucket_end + p99_lag + margem)
#
# so the lag does not merely have to be measured, it has to FIT: the moment
# `lag_p99_ms + margin` reaches one native grid step, the stamp rounds up to the SECOND grid
# point after `bucket_end` instead of the first, and every MODELED row is born one whole bucket
# late — unreadable at the decision instant of its own grid slot under `final_only`
# (`as_of_accessor` R-1 `available_at <= t` plus R-2 `bucket_end <= t`). That is the very defect
# `D16` exists to remove, reintroduced by the fix. The table declares `59_361` against a `60_000`
# grid, which is `639` ms of headroom, and NOTHING in the module named that as an invariant.
#
# The bound below is the SERIES' NATIVE GRID, deliberately not `record.poll_resolution_ms`:
# the poll period is a mutable field of the same record an editor is editing, so binding the
# invariant to it lets a coherent edit (`poll_resolution_ms = 120_000` alongside a bigger lag)
# satisfy the check while breaking the stamp.
#
# `[MEDIDO 2026-09-11, read-only against deploy-postgres-1, frozen window bucket_end <
# 1789155360000]` — the klines grid is exactly one minute, with no second value:
#
#     with d as (select bucket_end - lag(bucket_end) over (partition by series_key_id
#                order by bucket_end) step from md.series
#                where bucket_end < 1789155360000 and source = '/fapi/v1/klines')
#     select count(*), count(*) filter (where step = 60000), count(distinct step)
#       from d where step is not null and step <> 0;   -- 44612 | 44612 | 1

NATIVE_GRID_MS: dict[str, int] = {
    KLINES: 60_000,
    # `premiumIndex` is a SNAPSHOT series: its `bucket_end` is the observation instant, so the
    # step is 60_000 only modally (`59_998`..`61_000` measured). The poll cadence is the grid a
    # consumer would round to, and the invariant is slack here by 58 s either way.
    PREMIUM_INDEX: 60_000,
}


def _modeled_available_at(
    record: MeasuredPublicationLag, *, bucket_end: int, margin_ms: int
) -> int:
    """Return `SPEC-001` §5.2's MODELED stamp: the next native grid point at or after the lag."""
    grid = NATIVE_GRID_MS[record.endpoint]
    earliest = bucket_end + record.lag_p99_ms + margin_ms
    return math.ceil(earliest / grid) * grid


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_the_modeled_stamp_lands_on_the_first_grid_point_after_its_own_bucket(
    endpoint: str,
) -> None:
    """The stamp must be `bucket_end + one grid`, never `bucket_end + two`.

    Two grid steps means the row is not yet knowable at the decision instant of its own slot,
    and a backfilled history whose every row arrives a bucket late is a different series from
    the live one it claims to reproduce.
    """
    record = ENDPOINT_PUBLICATION_LAG[endpoint]
    grid = NATIVE_GRID_MS[endpoint]
    bucket_end = 1_789_090_860_000
    assert _modeled_available_at(record, bucket_end=bucket_end, margin_ms=0) == bucket_end + grid


@pytest.mark.parametrize("endpoint", [KLINES, PREMIUM_INDEX])
def test_the_lag_keeps_declared_headroom_against_the_native_grid(endpoint: str) -> None:
    """The invariant nobody had written: `lag_p99_ms` strictly under one native grid step.

    Bound to the GRID, not to `poll_resolution_ms` — see this section's header for why the
    record's own field is not an acceptable bound.
    """
    record = ENDPOINT_PUBLICATION_LAG[endpoint]
    assert record.lag_p99_ms < NATIVE_GRID_MS[endpoint]


def test_a_lag_that_crosses_the_grid_is_caught_by_this_guard() -> None:
    """The falsifier of the guard above, EXECUTED: one ms over the grid must change the stamp.

    `lag = grid` exactly is already the boundary — it lands ON the next grid point, legible only
    under a convention that reads AT the grid instant and never a millisecond before it, and any
    positive `margem` in `SPEC-001` §5.2's formula pushes it over. One ms past is unambiguous.
    """
    record = ENDPOINT_PUBLICATION_LAG[KLINES]
    grid = NATIVE_GRID_MS[KLINES]
    bucket_end = 1_789_090_860_000
    crossed = MeasuredPublicationLag(
        endpoint=record.endpoint,
        lag_p99_ms=grid + 1,
        lag_min_ms=record.lag_min_ms,
        lag_max_ms=grid + 2,
        sample_n=record.sample_n,
        poll_resolution_ms=record.poll_resolution_ms,
        window_start_ms=record.window_start_ms,
        window_end_ms=record.window_end_ms,
        symbols=record.symbols,
        measured_on=record.measured_on,
    )
    assert not crossed.lag_p99_ms < NATIVE_GRID_MS[KLINES]
    stamp = _modeled_available_at(crossed, bucket_end=bucket_end, margin_ms=0)
    assert stamp == bucket_end + 2 * grid


# ── the population: `nb = 1` right-censors the live lag at exactly one poll period ────────────
#
# `QA 2026-09-11`. The fan-out separator is not circular in FORM — it never reads the lag — but
# it is censoring in EFFECT, and the censoring lands exactly on the grid the invariant above
# needs headroom against: a poll that ran late enough to reveal TWO newly closed buckets becomes
# `nb = 2` and leaves the population, so no reading at or past one poll period can survive it.
# `lag_max_ms = 59_999 < 60_000` is therefore a property of the FILTER, not of the endpoint.
#
# The `nb = 2` rows are not the "ambiguous middle" the module's docstring calls them — they are
# provably LATE LIVE POLLS, measured `[MEDIDO 2026-09-11, read-only, same frozen window]`:
# all `105` groups span exactly `60_000` ms (two consecutive buckets) and the older reading is
# the younger plus exactly one grid step (`12` -> `60_012`, `27_855` -> `87_855`). Every backfill
# group measured spans `1_079`-`1_500` buckets; no path produces a two-bucket request.
#
#     ... and g.nb = 2 -> grp(span, lag_old, lag_new)
#     select span, count(*), min(lag_old), max(lag_old), min(lag_new), max(lag_new) from grp ...
#     # 60000 | 105 | 60012 | 87855 | 12 | 27855
#
# Uncensored live population for klines (`nb <= 2`): `n = 4.289`, `105` readings at or past the
# grid, and the top `k = 4289 - ceil(0.99 * 4289) + 1 = 43` readings are below.

# `n = 4.289` -> `ceil(0.99 * 4289) = 4247` -> `k = 4289 - 4247 + 1 = 43`.
KLINES_UNCENSORED_LAG_TAIL_MS: tuple[int, ...] = (
    60_936, 60_964, 61_002, 61_023, 61_032, 61_081, 61_082, 61_110,
    61_113, 61_116, 61_147, 61_174, 61_211, 61_214, 61_216, 61_233,
    61_240, 61_244, 61_251, 61_276, 61_279, 61_281, 61_282, 61_301,
    61_307, 61_317, 61_322, 61_369, 61_451, 61_471, 61_486, 61_490,
    61_557, 61_583, 61_622, 61_625, 61_648, 61_757, 65_190, 71_471,
    84_924, 87_535, 87_855,
)  # fmt: skip

KLINES_UNCENSORED_SAMPLE_N: int = 4_289


def test_the_live_lag_holds_the_grid_when_the_late_polls_are_not_censored_away() -> None:
    """The `p99` of the LIVE population, late polls included, must still fit the native grid.

    This is the same question `test_the_lag_keeps_declared_headroom_against_the_native_grid`
    asks, over the population that `nb = 1` removes. If it fails, the declared `59_361` and its
    `639` ms of headroom are artefacts of the filter: the endpoint really does publish past the
    grid, and `D16` cannot stamp a MODELED row on the first grid point.
    """
    tail = KLINES_UNCENSORED_LAG_TAIL_MS
    rank = math.ceil(0.99 * KLINES_UNCENSORED_SAMPLE_N)
    assert len(tail) == KLINES_UNCENSORED_SAMPLE_N - rank + 1
    sample = (ENDPOINT_PUBLICATION_LAG[KLINES].lag_min_ms,) * (
        KLINES_UNCENSORED_SAMPLE_N - len(tail)
    ) + tail
    assert p99(sample) < NATIVE_GRID_MS[KLINES]
