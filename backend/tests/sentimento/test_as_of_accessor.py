"""`as_of` — the anti-lookahead mechanism, exercised with the poisoned fixture of §5.1."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any

import pytest

from src.modules.sentimento.domain.as_of_accessor import (
    CARRY_FORWARD_BY_NATURE,
    AsOfReading,
    BarPolicy,
    DecisionReadRefusedError,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    as_of,
    reject_delay_threshold_above_staleness,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    Absence,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

# ── THE GRID, IN EPOCH MILLISECONDS, INJECTED AND NEVER READ FROM A CLOCK ──────────────────
#
# `backend/pyproject.toml` contract "Natureza" forbids `time` and `datetime` in `domain`, and
# this test honours the same boundary so that the fixture it feeds the accessor is the shape a
# caller really has. Every instant below is arithmetic on two constants.
BUCKET_MS = 300_000
"""5 min — the grid `SPEC-001` §5.12 calls the one where absence policy is first-class."""

PUBLICATION_LAG_MS = 60_000
"""A stand-in for the measured publication lag. It only has to be > 0 so that `available_at`
lands strictly after `bucket_end`, which is what makes R-1 and R-2 two different questions."""

B1 = 1_000_000_000_000
B2 = B1 + BUCKET_MS
B3 = B2 + BUCKET_MS
B4 = B3 + BUCKET_MS

DECISION_T = B3 + PUBLICATION_LAG_MS
"""The instant at which `B3` is both CLOSED and PUBLISHED — and `B4` is neither.

It is `bucket_end + lag` and not `bucket_end`, because a bucket is not knowable at the moment it
closes. Putting the decision instant on the grid point itself would have had R-1 exclude the
very bucket the test meant to read, which is a fixture defect that looks exactly like a bug."""

ASOF_MAX_STALENESS_MS = 2 * BUCKET_MS + PUBLICATION_LAG_MS
"""`ADR-006`/D4's own formula `2c + p99`, used here as the series' declared value so that the
carry window is wide enough for `LOCF` to be visible and narrow enough to be exceeded."""


def _policy(**overrides: Any) -> SeriesReadPolicy:
    defaults: dict[str, Any] = {
        "asof_max_staleness_ms": ASOF_MAX_STALENESS_MS,
        "render_max_staleness_ms": None,
        "bucket_interval_ms": BUCKET_MS,
        "first_capture_at": None,
    }
    return SeriesReadPolicy(**{**defaults, **overrides})


def _key(**overrides: Any) -> SeriesKey:
    """Build a complete 15-term identity. Every term is spelled out; none has a default."""
    defaults: dict[str, Any] = {
        "provider": "binance",
        "venue": "binance-futures-usdm",
        "instrument_id": "BTCUSDT",
        "metric": "sum_open_interest",
        "cohort": "all",
        "interval": "5m",
        "unit": "BTC",
        "denom": "BASE_ASSET",
        "nature": Nature.STOCK,
        "ts_convention": TsConvention.POINT_AT_BUCKET_END,
        "reduction": Reduction.POINT,
        "quantity_field": QuantityField.NA,
        "label_shift": 300_000,
        "aggregation_scope": "Symbol",
        "verified_by": "tests/sentimento/test_as_of_accessor.py",
    }
    return SeriesKey(**{**defaults, **overrides})


def _observation(
    key: SeriesKey,
    *,
    bucket_end: int,
    observed_at: int,
    available_at: int | None = None,
    value: str = "1.0",
    is_final: bool | None = None,
    source: str = "binance-rest",
    symbol: str = "BTCUSDT",
) -> Observation:
    resolved_available_at = (
        bucket_end + PUBLICATION_LAG_MS if available_at is None else available_at
    )
    row = SeriesRow(
        series_key_id=key.series_key_id(),
        symbol=symbol,
        source=source,
        bucket_end=bucket_end,
        event_time=bucket_end,
        available_at=resolved_available_at,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=resolved_available_at,
        observed_at=observed_at,
        provenance=Provenance.OBSERVED,
        src_label_raw="sumOpenInterest",
        observer_id="vps-1",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=is_final,
    )
    return Observation(row=row, value=Decimal(value))


def _read(
    observations: list[Observation],
    *,
    key: SeriesKey | None = None,
    t: int = DECISION_T,
    bar_policy: BarPolicy = BarPolicy.FINAL_ONLY,
    purpose: ReadPurpose = ReadPurpose.ENTRY_CONDITION,
    knowledge_time: int | None = None,
    policy: SeriesReadPolicy | None = None,
    symbol: str = "BTCUSDT",
) -> AsOfReading:
    resolved_key = _key() if key is None else key
    return as_of(
        series=resolved_key,
        symbol=symbol,
        t=t,
        observations=observations,
        policy=_policy() if policy is None else policy,
        bar_policy=bar_policy,
        purpose=ReadPurpose.RENDERING if bar_policy is BarPolicy.INTRABAR else purpose,
        knowledge_time=t + BUCKET_MS if knowledge_time is None else knowledge_time,
    )


# ── THE POISONED FIXTURE — ONE FIXTURE, THREE CLASSES (`D4.6`, `SPEC-001` §5.1) ────────────
#
# The DoD is emphatic that this is ONE fixture and not three, because class (b) exists only
# because the earlier test "passava nos DOIS valores de `bar_policy`" — it was not testing
# `bar_policy` at all. Splitting the classes would let that come back one class at a time.

STOCK_KEY = _key()
NQ_KEY = _key(quantity_field=QuantityField.NQ, metric="cvd_delta", nature=Nature.FLOW)
Q_KEY = _key(quantity_field=QuantityField.Q, metric="cvd_delta", nature=Nature.FLOW)


def _clean_rows() -> list[Observation]:
    """Three closed buckets, published one lag after each close. No poison."""
    return [
        _observation(STOCK_KEY, bucket_end=B1, observed_at=B1 + PUBLICATION_LAG_MS, value="10.5"),
        _observation(STOCK_KEY, bucket_end=B2, observed_at=B2 + PUBLICATION_LAG_MS, value="11.5"),
        _observation(STOCK_KEY, bucket_end=B3, observed_at=B3 + PUBLICATION_LAG_MS, value="12.5"),
    ]


def _poison_a() -> Observation:
    """Build class (a): `event_time` in the past, `available_at` in the FUTURE — R-1's target."""
    return _observation(
        STOCK_KEY,
        bucket_end=B2,
        observed_at=DECISION_T + 10 * BUCKET_MS,
        available_at=DECISION_T + 10 * BUCKET_MS,
        value="999.999",
    )


def _poison_b() -> Observation:
    """(b) partial bucket: `available_at <= t`, `bucket_end > t`, `is_final = False`."""
    return _observation(
        STOCK_KEY,
        bucket_end=B4,
        observed_at=DECISION_T - 1,
        available_at=DECISION_T - 1,
        value="777.777",
        is_final=False,
    )


def _poison_c() -> Observation:
    """(c) the same bucket present under `quantity_field = q`, where `nq` has no coverage."""
    return _observation(Q_KEY, bucket_end=B3, observed_at=B3 + PUBLICATION_LAG_MS, value="4044402")


def _poisoned_rows() -> list[Observation]:
    return [*_clean_rows(), _poison_a(), _poison_b(), _poison_c()]


def _sweep_digest(observations: list[Observation], *, bar_policy: BarPolicy) -> str:
    """Hash the readings over a whole sweep of `t`, so "bit-identical" is one comparison.

    A single `t` would let a poisoned line hide in a neighbouring instant. The sweep walks the
    grid at quarter-bucket resolution across the whole fixture, which is where a partial bucket
    lives, and hashes the canonical projection of every reading in order.
    """
    projections = []
    for t in range(B1 - BUCKET_MS, B4 + 2 * BUCKET_MS, BUCKET_MS // 4):
        reading = _read(
            observations,
            t=t,
            bar_policy=bar_policy,
            purpose=ReadPurpose.RENDERING,
            knowledge_time=B4 + 10 * BUCKET_MS,
        )
        projections.append(reading.projection())
    payload = json.dumps(projections, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ── `D4.6` CLASS (a) — R-1 ─────────────────────────────────────────────────────────────────


def test_d4_6_a_a_future_available_at_is_bit_identical_to_not_having_the_line() -> None:
    """A line the reader could not have known at `t` must not move a single bit of output."""
    with_poison = _sweep_digest([*_clean_rows(), _poison_a()], bar_policy=BarPolicy.FINAL_ONLY)
    without = _sweep_digest(_clean_rows(), bar_policy=BarPolicy.FINAL_ONLY)
    assert with_poison == without


def test_d4_6_a_holds_under_intrabar_too_because_r1_is_not_r2() -> None:
    """R-1 is unconditional: relaxing R-2 does not admit a line that was not yet knowable."""
    with_poison = _sweep_digest([*_clean_rows(), _poison_a()], bar_policy=BarPolicy.INTRABAR)
    without = _sweep_digest(_clean_rows(), bar_policy=BarPolicy.INTRABAR)
    assert with_poison == without


def test_the_poison_a_line_is_visible_when_the_reader_is_allowed_to_know_it() -> None:
    """The control the other two tests need: the poisoned line is not inert, it is EXCLUDED.

    Without this, "bit-identical" would also be satisfied by a fixture whose poison never
    mattered — the vacuous conformity `ADR-012` names, where `rc=0` cannot tell "nothing
    changed" from "the instrument could never have seen it".
    """
    late_t = DECISION_T + 10 * BUCKET_MS
    reading = _read(
        [_poison_a()],
        t=late_t,
        purpose=ReadPurpose.RENDERING,
        policy=_policy(asof_max_staleness_ms=100 * BUCKET_MS),
    )
    assert reading.value == Decimal("999.999")


# ── `D4.6` CLASS (b) — R-2, AND IT HAS TO BEHAVE DIFFERENTLY UNDER THE TWO POLICIES ────────


def test_d4_6_b_a_partial_bucket_is_bit_identical_under_final_only() -> None:
    """`available_at <= t` says yes and `bucket_end <= t` says no. The conjunction refuses."""
    with_poison = _sweep_digest([*_clean_rows(), _poison_b()], bar_policy=BarPolicy.FINAL_ONLY)
    without = _sweep_digest(_clean_rows(), bar_policy=BarPolicy.FINAL_ONLY)
    assert with_poison == without


def test_d4_6_b_a_partial_bucket_must_change_the_answer_under_intrabar() -> None:
    """The half that the PRD's version of this test could not see, and the reason (b) exists."""
    with_poison = _sweep_digest([*_clean_rows(), _poison_b()], bar_policy=BarPolicy.INTRABAR)
    without = _sweep_digest(_clean_rows(), bar_policy=BarPolicy.INTRABAR)
    assert with_poison != without

    reading = _read(
        [*_clean_rows(), _poison_b()], bar_policy=BarPolicy.INTRABAR, purpose=ReadPurpose.RENDERING
    )
    assert reading.value == Decimal("777.777")


def test_a_source_declared_non_final_bucket_is_refused_even_when_it_has_closed() -> None:
    """`is_final = False` is the SOURCE speaking, and `bucket_end` does not overrule it."""
    non_final = _observation(
        STOCK_KEY, bucket_end=B3, observed_at=B3 + 1, value="66.6", is_final=False
    )
    reading = _read([non_final, *_clean_rows()[:2]])
    assert reading.value == Decimal("11.5")


def test_is_final_none_means_the_source_does_not_declare_and_bucket_end_stands_alone() -> None:
    """`SPEC-001` §3.1 lists `is_final` as "quando a fonte o declara" — absent is not false."""
    reading = _read(_clean_rows())
    assert reading.observation is not None
    assert reading.observation.row.is_final is None
    assert reading.value == Decimal("12.5")


# ── `D4.6` CLASS (c) — `QF-4`, AND THE WELD THAT MUST NOT HAPPEN ───────────────────────────


def test_d4_6_c_a_read_under_nq_before_the_first_capture_is_no_source_and_never_welds_with_q() -> (
    None
):
    """The `q` row for the very same bucket is IN the fixture, and the `nq` read must not see it."""
    reading = _read(
        _poisoned_rows(),
        key=NQ_KEY,
        purpose=ReadPurpose.RENDERING,
        policy=_policy(first_capture_at=B4),
    )
    assert reading.absence is Absence.NO_SOURCE
    assert reading.value is None
    assert reading.observation is None


def test_the_q_row_of_that_same_bucket_is_readable_under_its_own_identity() -> None:
    """The control for the test above: the `q` line exists and carries a number.

    So the `nq` refusal is a refusal to WELD, and not an empty fixture. `quantity_field` being a
    term of the identity (`ADR-001`) is what makes the two different `series_key_id`, and the
    gap between them was measured: `cvd_delta(q) = 4.044.402` against `nq = 3.801.205`, 6,01%
    `[DOC: SPEC-001 §1.1]`.
    """
    reading = _read([_poison_c()], key=Q_KEY, purpose=ReadPurpose.RENDERING)
    assert reading.value == Decimal("4044402")


def test_without_a_declared_first_capture_the_absence_is_no_point_and_not_no_source() -> None:
    """`SEM_FONTE` claims nobody can EVER have it. Only a declared bound licenses that claim."""
    reading = _read(_poisoned_rows(), key=NQ_KEY, purpose=ReadPurpose.RENDERING)
    assert reading.absence is Absence.NO_POINT


def test_after_the_first_capture_the_nq_series_stops_being_no_source() -> None:
    """The other side of the bound, so `first_capture_at` is not a constant that always fires."""
    live = _observation(NQ_KEY, bucket_end=B3, observed_at=B3 + PUBLICATION_LAG_MS, value="3801205")
    reading = _read(
        [live, _poison_c()],
        key=NQ_KEY,
        purpose=ReadPurpose.RENDERING,
        policy=_policy(first_capture_at=B1),
    )
    assert reading.value == Decimal("3801205")


# ── `D4.13` — `argmin(observed_at)`: THE FIRST OBSERVATION, NEVER THE LAST ─────────────────


def test_d4_13_two_observations_of_the_same_bucket_resolve_to_the_first() -> None:
    """The store is append-only and bitemporal, so the same bucket legitimately has two rows."""
    first = _observation(STOCK_KEY, bucket_end=B3, observed_at=B3 + 1_000, value="12.5")
    revision = _observation(STOCK_KEY, bucket_end=B3, observed_at=B3 + 90_000, value="99.9")
    assert _read([revision, first]).value == Decimal("12.5")
    assert _read([first, revision]).value == Decimal("12.5")


def test_d4_13_does_not_depend_on_the_order_the_rows_arrive_in() -> None:
    """A read whose answer depends on input order is not reproducible, whatever it returns."""
    rows = [
        _observation(STOCK_KEY, bucket_end=B3, observed_at=B3 + n * 1_000, value=f"{n}.0")
        for n in (7, 2, 9, 1, 5)
    ]
    assert _read(rows).value == Decimal("1.0")
    assert _read(list(reversed(rows))).value == Decimal("1.0")


def test_a_tie_on_observed_at_is_broken_by_a_declared_total_order_and_not_by_input_order() -> None:
    """Two SOURCES can carry the same instant, because `source` is a term of the row key."""
    a = _observation(STOCK_KEY, bucket_end=B3, observed_at=B3 + 5, value="1.0", source="aaa")
    b = _observation(STOCK_KEY, bucket_end=B3, observed_at=B3 + 5, value="2.0", source="zzz")
    assert _read([a, b]).value == _read([b, a]).value == Decimal("1.0")


# ── `LOCF`, AND THE POINT WHERE IT STOPS ───────────────────────────────────────────────────


def test_locf_carries_the_last_closed_bucket_forward_inside_the_declared_window() -> None:
    """A `STOCK` is a level: it stays true until the next observation."""
    reading = _read(_clean_rows()[:2], t=B3 + BUCKET_MS // 2)
    assert reading.value == Decimal("11.5")
    assert reading.age_ms == B3 + BUCKET_MS // 2 - B2


def test_locf_stops_at_asof_max_staleness_ms_and_the_answer_becomes_an_absence() -> None:
    """Stop the carry at the window. Absence is information; a stale number is not."""
    just_inside = B1 + ASOF_MAX_STALENESS_MS
    assert _read(_clean_rows()[:1], t=just_inside).value == Decimal("10.5")
    assert _read(_clean_rows()[:1], t=just_inside + 1).absence is Absence.NO_POINT


def test_nothing_is_interpolated_between_two_points() -> None:
    """The falsifier of the whole task: an answer that is neither of the two stored values.

    Interpolation would produce `11.0` halfway between `10.5` and `11.5` — and it would produce
    it using the LATER point, which is lookahead by construction (`SPEC-001` §2.4 marks
    `time_bucket_gapfill` + `interpolate` PROIBIDO for exactly this). `LOCF` never consults the
    next point, so every answer in the sweep is a value that was actually stored.
    """
    stored = {Decimal("10.5"), Decimal("11.5"), Decimal("12.5")}
    seen = set()
    for t in range(B1, B3 + BUCKET_MS, BUCKET_MS // 10):
        reading = _read(_clean_rows(), t=t)
        if reading.value is not None:
            seen.add(reading.value)
    assert seen and seen <= stored


# ── `D4.11` — `LOCF` OVER `FLOW` IS A TYPE ERROR ───────────────────────────────────────────


def test_d4_11_an_absent_flow_bucket_returns_an_absence_and_never_the_previous_value() -> None:
    """Crosshair case: `cvd_delta` has no bucket here, so it shows "—", not the last sum."""
    rows = [_observation(Q_KEY, bucket_end=B2, observed_at=B2 + PUBLICATION_LAG_MS, value="42.0")]
    assert _read(rows, key=Q_KEY, t=B2 + PUBLICATION_LAG_MS).value == Decimal("42.0")
    assert _read(rows, key=Q_KEY, t=B3 + PUBLICATION_LAG_MS).absence is Absence.NO_POINT


def test_the_same_fixture_under_stock_does_carry_forward_and_measures_nature() -> None:
    """Read the same rows under `STOCK`, so the test above is known to measure `nature`.

    Same instants, one term of the key different. If both refused, `D4.11` would be passing for
    the wrong reason — an empty carry window rather than a type rule.
    """
    rows = [
        _observation(STOCK_KEY, bucket_end=B2, observed_at=B2 + PUBLICATION_LAG_MS, value="42.0")
    ]
    assert _read(rows, key=STOCK_KEY, t=B3 + PUBLICATION_LAG_MS).value == Decimal("42.0")


def test_every_nature_declares_whether_it_may_be_carried_forward() -> None:
    """A nature missing from the table would raise `KeyError` inside the accessor at read time."""
    assert set(CARRY_FORWARD_BY_NATURE) == set(Nature)


def test_only_stock_may_be_carried_forward_today_and_ratio_is_the_conservative_side() -> None:
    """Pins the `[NAO SEI]` the module declares, so relaxing it is a red test and not a diff."""
    assert CARRY_FORWARD_BY_NATURE[Nature.STOCK] is True
    assert not any(CARRY_FORWARD_BY_NATURE[n] for n in Nature if n is not Nature.STOCK)


# ── THE WIDTH OF ONE BUCKET IS INJECTED, AND `SeriesKey.interval` NEVER SUBSTITUTES FOR IT ─


def _flow_key(**overrides: Any) -> SeriesKey:
    """Build a `FLOW` identity, so `D4.11` applies and the carry rule is what is measured."""
    defaults: dict[str, Any] = {
        "quantity_field": QuantityField.Q,
        "metric": "cvd_delta",
        "nature": Nature.FLOW,
    }
    return _key(**{**defaults, **overrides})


def _one_flow_bucket(key: SeriesKey) -> list[Observation]:
    """One published flow bucket at `B2`, which is all `D4.11` needs to be decided."""
    return [_observation(key, bucket_end=B2, observed_at=B2 + PUBLICATION_LAG_MS, value="42.0")]


def test_publication_lag_means_a_flow_bucket_is_readable_at_a_strictly_positive_age() -> None:
    """The reason `D4.11` CANNOT be written `age_ms > 0`, pinned as behaviour.

    A bucket becomes readable one publication lag AFTER it closes, so at the very FIRST instant
    a flow value can be read at all, its age is already `PUBLICATION_LAG_MS` — strictly positive.
    Under a guard of `age_ms > 0` every flow series would therefore be unreadable FOR EVER: the
    whole `cvd_delta` panel would show "—" at every instant, and it would look like missing data
    rather than like a bug. `as_of_accessor.py:170-174` states the argument; this test is what
    stops it from being undone by someone who reads `>=` as an off-by-one.
    """
    key = _flow_key()
    reading = _read(_one_flow_bucket(key), key=key, t=B2 + PUBLICATION_LAG_MS)
    assert reading.age_ms == PUBLICATION_LAG_MS
    assert reading.age_ms > 0
    assert reading.value == Decimal("42.0")


def test_a_flow_value_dies_exactly_when_one_whole_bucket_has_gone_by_and_not_one_ms_later() -> None:
    """The boundary is `>=`: at exactly one bucket of age the value has already stopped being it.

    "Uma janela inteira passou" is true AT the width, not one millisecond after it. Both sides of
    the boundary are asserted together so that `>` in place of `>=` is a red test rather than an
    off-by-one that nobody reads.
    """
    key = _flow_key()
    rows = _one_flow_bucket(key)
    assert _read(rows, key=key, t=B2 + BUCKET_MS - 1).value == Decimal("42.0")
    assert _read(rows, key=key, t=B2 + BUCKET_MS).absence is Absence.NO_POINT


def test_the_injected_width_governs_when_it_is_wider_than_the_key_s_interval_string() -> None:
    """Key says `"5m"`, the series' declared grid is 15 min, and the INJECTED 15 min wins.

    The default fixture of this file is a trap for exactly this rule: `SeriesKey.interval` is
    `"5m"` and `bucket_interval_ms` is `300_000`, so a version that PARSED the string would agree
    with the injected value on every other test here and the suite would stay green. The only way
    to tell an injected width from a derived one is to make the two DISAGREE.

    A flow bucket 6 min old is still inside one 15 min bucket, so `D4.11` does not fire and the
    value is still the answer — where a width parsed from `"5m"` would have refused it.
    """
    key = _flow_key()
    reading = _read(
        _one_flow_bucket(key),
        key=key,
        t=B3 + PUBLICATION_LAG_MS,
        policy=_policy(bucket_interval_ms=3 * BUCKET_MS),
    )
    assert reading.age_ms == BUCKET_MS + PUBLICATION_LAG_MS
    assert reading.value == Decimal("42.0")


def test_the_injected_width_governs_when_it_is_narrower_than_the_key_s_interval_string() -> None:
    """Key says `"15m"`, the series' declared grid is 5 min, and the INJECTED 5 min wins.

    The mirrored direction, and it is not redundant with the one above: a single direction is
    also satisfied by a parser that is merely wrong by a constant factor. Together the two pin
    that the answer moves with `SeriesReadPolicy.bucket_interval_ms` and NOT with
    `SeriesKey.interval`, whichever of the two happens to be the larger number.

    A flow bucket 6 min old has outlived one 5 min bucket, so `D4.11` fires and the reading is an
    absence — where a width parsed from `"15m"` would have carried it forward.
    """
    key = _flow_key(interval="15m")
    reading = _read(_one_flow_bucket(key), key=key, t=B3 + PUBLICATION_LAG_MS, policy=_policy())
    assert reading.value is None
    assert reading.absence is Absence.NO_POINT


def test_the_two_widths_are_read_from_the_policy_even_for_a_nature_that_may_be_carried() -> None:
    """A `STOCK` ignores the width entirely, which is what makes the two tests above about NATURE.

    Same instants, same policies, one term of the key different. If the `STOCK` reading also
    moved with `bucket_interval_ms`, the pair above would be measuring the width guard rather
    than `D4.11`, and `CARRY_FORWARD_BY_NATURE` would be doing nothing.
    """
    rows = [
        _observation(STOCK_KEY, bucket_end=B2, observed_at=B2 + PUBLICATION_LAG_MS, value="42.0")
    ]
    for width in (BUCKET_MS, 3 * BUCKET_MS, 1):
        reading = _read(
            rows,
            key=STOCK_KEY,
            t=B3 + PUBLICATION_LAG_MS,
            policy=_policy(bucket_interval_ms=width),
        )
        assert reading.value == Decimal("42.0"), width


def test_a_non_positive_bucket_width_is_refused_because_d4_11_would_have_no_meaning() -> None:
    """A width of zero makes "one whole bucket has gone by" true at EVERY instant, silently.

    Refusing is the `ADR-006`/D3 shape one layer down: a malformed policy is a fact about the
    CALL, not about the data, so it raises instead of returning an absence that a consumer would
    read as an empty series. A negative width is refused for the same reason.
    """
    key = _flow_key()
    rows = _one_flow_bucket(key)
    for width in (0, -1):
        with pytest.raises(DecisionReadRefusedError, match="not a positive width"):
            _read(rows, key=key, t=DECISION_T, policy=_policy(bucket_interval_ms=width))


# ── `D4.14` AND `ADR-006` — THE ACCESSOR NEVER INHERITS THE SCREEN'S DEFAULT ───────────────


def test_d4_14_omitting_asof_max_staleness_ms_refuses_the_decision_read() -> None:
    """`ADR-006`/D3: ausencia e erro, nao default — the message names the field NOT used."""
    policy = _policy(asof_max_staleness_ms=None, render_max_staleness_ms=600_000)
    with pytest.raises(DecisionReadRefusedError, match="asof_max_staleness_ms is absent"):
        _read(_clean_rows(), policy=policy)


def test_adr_006_mirror_the_render_value_does_not_move_the_output_by_one_bit() -> None:
    """The test that catches GRAVITY: a screen constant sitting next to a decision constant.

    `ADR-006` records the incident — a `max_staleness = 600 s` chosen through a UX lens became,
    by proximity, the constant another section cited. Here `render_max_staleness_ms` is set to
    that very number and the digest must not move.
    """
    without_render = _sweep_digest(_clean_rows(), bar_policy=BarPolicy.FINAL_ONLY)
    rows = _clean_rows()
    with_render = hashlib.sha256(
        json.dumps(
            [
                as_of(
                    series=STOCK_KEY,
                    symbol="BTCUSDT",
                    t=t,
                    observations=rows,
                    policy=_policy(render_max_staleness_ms=600_000),
                    bar_policy=BarPolicy.FINAL_ONLY,
                    purpose=ReadPurpose.RENDERING,
                    knowledge_time=B4 + 10 * BUCKET_MS,
                ).projection()
                for t in range(B1 - BUCKET_MS, B4 + 2 * BUCKET_MS, BUCKET_MS // 4)
            ],
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    assert with_render == without_render


def test_a_negative_asof_max_staleness_ms_is_refused_instead_of_staling_everything() -> None:
    """Refuse a negative window rather than making every observation stale on arrival."""
    with pytest.raises(DecisionReadRefusedError, match="is negative"):
        _read(_clean_rows(), policy=_policy(asof_max_staleness_ms=-1))


def test_adr_006_d4_a_delay_threshold_above_the_staleness_is_refused_naming_both_numbers() -> None:
    """Refuse `limiar_atraso > asof_max_staleness_ms` — absence announced before lateness."""
    with pytest.raises(DecisionReadRefusedError) as excinfo:
        reject_delay_threshold_above_staleness(
            series_key_id=STOCK_KEY.series_key_id(),
            delay_threshold_ms=ASOF_MAX_STALENESS_MS + 1,
            policy=_policy(),
        )
    message = str(excinfo.value)
    assert str(ASOF_MAX_STALENESS_MS + 1) in message
    assert str(ASOF_MAX_STALENESS_MS) in message
    assert STOCK_KEY.series_key_id() in message


def test_adr_006_d4_admits_a_series_whose_threshold_fits_inside_its_own_staleness() -> None:
    """Admit the `cala` side, so `ADR-006`/D4 is not a check that always fires."""
    reject_delay_threshold_above_staleness(
        series_key_id=STOCK_KEY.series_key_id(),
        delay_threshold_ms=ASOF_MAX_STALENESS_MS,
        policy=_policy(),
    )


def test_adr_006_d4_has_nothing_to_compare_against_when_the_asof_value_is_absent() -> None:
    """Refuse the comparison itself when the series has no declared `asof_max_staleness_ms`."""
    with pytest.raises(DecisionReadRefusedError, match="has no asof_max_staleness_ms"):
        reject_delay_threshold_above_staleness(
            series_key_id=STOCK_KEY.series_key_id(),
            delay_threshold_ms=1,
            policy=_policy(asof_max_staleness_ms=None),
        )


# ── `SPEC-001` §2.3 THIRD LINE — `intrabar` IS NEVER AN ENTRY CONDITION ────────────────────


def test_intrabar_is_refused_for_an_entry_condition() -> None:
    """Refuse the one pair `SPEC-001` §2.3 forbids: `intrabar` deciding an entry."""
    with pytest.raises(DecisionReadRefusedError, match="never for"):
        as_of(
            series=STOCK_KEY,
            symbol="BTCUSDT",
            t=DECISION_T,
            observations=_clean_rows(),
            policy=_policy(),
            bar_policy=BarPolicy.INTRABAR,
            purpose=ReadPurpose.ENTRY_CONDITION,
            knowledge_time=B4,
        )


@pytest.mark.parametrize("purpose", [ReadPurpose.RENDERING, ReadPurpose.EXECUTION_SIMULATION])
def test_intrabar_is_admitted_for_the_two_purposes_the_spec_names(purpose: ReadPurpose) -> None:
    """The `cala` side: the refusal is about the PAIR, not about `intrabar` being banned."""
    reading = as_of(
        series=STOCK_KEY,
        symbol="BTCUSDT",
        t=DECISION_T,
        observations=_clean_rows(),
        policy=_policy(),
        bar_policy=BarPolicy.INTRABAR,
        purpose=purpose,
        knowledge_time=B4,
    )
    assert reading.value == Decimal("12.5")


def test_final_only_is_admitted_for_an_entry_condition() -> None:
    """Admit the pair the SPEC prescribes, so the refusal above is about the PAIR."""
    assert _read(_clean_rows()).value == Decimal("12.5")


# ── `F-1`, THE GLOBAL FALSIFIER OF `SPEC-001` §12 ──────────────────────────────────────────


@pytest.mark.parametrize("bar_policy", list(BarPolicy))
def test_f1_no_read_ever_returns_a_row_the_reader_could_not_have_known(
    bar_policy: BarPolicy,
) -> None:
    """Sweep the poisoned fixture for the observation `F-1` says must never come back.

    "uma leitura de decisao que devolva linha com `available_at > t_decisao` **ou**
    `bucket_end > t_decisao` sob `final_only`".

    n = every quarter-bucket instant across the fixture, under both policies.
    """
    checked = 0
    for t in range(B1 - BUCKET_MS, B4 + 3 * BUCKET_MS, BUCKET_MS // 4):
        reading = _read(
            _poisoned_rows(),
            t=t,
            bar_policy=bar_policy,
            purpose=ReadPurpose.RENDERING,
            knowledge_time=B4 + 20 * BUCKET_MS,
        )
        if reading.observation is not None:
            checked += 1
            assert reading.observation.row.available_at <= t
            if bar_policy is BarPolicy.FINAL_ONLY:
                assert reading.observation.row.bucket_end <= t
    assert checked > 0, "the sweep has to return at least one row, or it proves nothing"


# ── `CA-F4-25` / `F-4` — `knowledge_time` IS ON THE READ PATH ──────────────────────────────


def test_knowledge_time_bounds_the_read_and_is_echoed_back_on_every_reading() -> None:
    """`reproduzir(run) = (bundle_hash, window, knowledge_time)` — the third one has to travel."""
    reading = _read(_clean_rows(), knowledge_time=B4)
    assert reading.knowledge_time == B4


def test_ca_f4_25_a_late_observation_of_an_evaluated_bucket_does_not_move_the_same_read() -> None:
    """Step (2) of `CA-F4-25`: a late row for a bucket already inside the evaluated window.

    Held at the same `knowledge_time`, the answer is IDENTICAL — twice over: the late row is
    outside the horizon, and even inside it `argmin(observed_at)` still returns the first
    observation.
    """
    horizon = B3 + PUBLICATION_LAG_MS
    late = _observation(STOCK_KEY, bucket_end=B2, observed_at=horizon + 10 * BUCKET_MS, value="0.1")
    before = _read(_clean_rows(), knowledge_time=horizon).projection()
    after = _read([*_clean_rows(), late], knowledge_time=horizon).projection()
    assert before == after

    at_b2 = _read(_clean_rows(), t=B2 + PUBLICATION_LAG_MS, knowledge_time=horizon).value
    with_late = _read(
        [*_clean_rows(), late], t=B2 + PUBLICATION_LAG_MS, knowledge_time=horizon + 20 * BUCKET_MS
    ).value
    assert at_b2 == with_late == Decimal("11.5")


def test_ca_f4_25_raising_the_horizon_can_change_the_answer_and_the_reading_says_so() -> None:
    """The divergence `F-4` is about, made VISIBLE rather than silent.

    A late observation of a bucket that had NO earlier observation is the case where the number
    really moves. It moves only when `knowledge_time` moves, and the reading carries the value
    that moved it — so two runs are comparable instead of mysteriously different.
    """
    late_only = _observation(
        STOCK_KEY, bucket_end=B3, observed_at=B3 + 50 * BUCKET_MS, value="13.5"
    )
    rows = [*_clean_rows()[:2], late_only]
    narrow = _read(rows, knowledge_time=B3 + PUBLICATION_LAG_MS)
    wide = _read(rows, knowledge_time=B3 + 60 * BUCKET_MS)
    assert narrow.value == Decimal("11.5")
    assert wide.value == Decimal("13.5")
    assert narrow.knowledge_time != wide.knowledge_time


# ── THE SHAPE OF A READING ─────────────────────────────────────────────────────────────────


def test_a_reading_is_either_a_value_or_a_named_absence_and_never_both() -> None:
    """Refuse a reading that carries a number and an absence at the same time."""
    with pytest.raises(DecisionReadRefusedError, match="never both"):
        AsOfReading(
            value=Decimal("1"),
            absence=Absence.NO_POINT,
            observation=None,
            knowledge_time=B1,
            bar_policy=BarPolicy.FINAL_ONLY,
            age_ms=0,
        )


def test_a_reading_is_never_neither() -> None:
    """Refuse a reading that carries neither a number nor a reason for not having one."""
    with pytest.raises(DecisionReadRefusedError, match="never neither"):
        AsOfReading(
            value=None,
            absence=None,
            observation=None,
            knowledge_time=B1,
            bar_policy=BarPolicy.FINAL_ONLY,
            age_ms=None,
        )


def test_a_value_never_travels_without_the_observation_it_came_from() -> None:
    """Refuse a number whose provenance was left behind."""
    with pytest.raises(DecisionReadRefusedError, match="provenance travels with the number"):
        AsOfReading(
            value=Decimal("1"),
            absence=None,
            observation=None,
            knowledge_time=B1,
            bar_policy=BarPolicy.FINAL_ONLY,
            age_ms=0,
        )


def test_the_projection_carries_the_decimal_as_its_own_digits_and_not_as_a_float() -> None:
    """`SPEC-001` §2.6 makes decimal arithmetic contractual; a float would undo it here."""
    exact = _observation(
        STOCK_KEY, bucket_end=B3, observed_at=B3 + 1, value="0.1000000000000000055"
    )
    projected = _read([exact]).projection()
    assert projected["value"] == "0.1000000000000000055"


def test_an_absent_reading_projects_the_reason_and_no_provenance() -> None:
    """Project a named absence with every provenance field explicitly empty."""
    projected = _read([], t=DECISION_T).projection()
    assert projected["absence"] == Absence.NO_POINT.value
    assert projected["value"] is None
    assert projected["observed_at"] is None
    assert projected["bucket_end"] is None
    assert projected["available_at"] is None


def test_a_read_for_another_symbol_does_not_see_this_symbols_rows() -> None:
    """`symbol` is a term of the row key (`SPEC-001` §3.2), not decoration."""
    assert _read(_clean_rows(), symbol="ETHUSDT").absence is Absence.NO_POINT
