"""`SPEC-001` §5.8 / plano 3.14: the monthly `curl -sI`, and the rule the `404` alone misses."""

from __future__ import annotations

from datetime import date

import pytest

from src.modules.sentimento.domain.dump_window import (
    AGG_TRADES,
    BOOK_DEPTH,
    DumpDataset,
    DumpPartition,
    enumerate_window,
)
from src.modules.sentimento.domain.retention_probe import (
    ABSENT,
    PRESENT,
    SUSPECT_FINDINGS,
    SUSPECT_LAST_BEFORE_ABSENT,
    ProbeOutcome,
    UnknownProbeDatasetError,
    classify,
    probe_targets,
    probe_targets_for_window,
    size_ratio_alarm,
)

# The three months `ADR-014` actually probed, with the byte counts it recorded.
# `[MEDIDO 2026-08-29, n = 3 simbolos x 3 meses = 9 requisicoes HEAD]`
MARCH = DumpPartition(AGG_TRADES, "BTCUSDT", "monthly", date(2024, 3, 1))
APRIL = DumpPartition(AGG_TRADES, "BTCUSDT", "monthly", date(2024, 4, 1))
MAY = DumpPartition(AGG_TRADES, "BTCUSDT", "monthly", date(2024, 5, 1))

MARCH_BYTES = 6_712_517_585
APRIL_BYTES = 37_761_761


def _measured_run() -> tuple[ProbeOutcome, ...]:
    """Return the exact sequence `ADR-014` measured: 200, 200-but-short, 404."""
    return (
        ProbeOutcome(MARCH, 200, MARCH_BYTES),
        ProbeOutcome(APRIL, 200, APRIL_BYTES),
        ProbeOutcome(MAY, 404, None),
    )


def test_the_probe_targets_both_an_old_and_a_recent_prefix_for_both_datasets() -> None:
    """§5.8 mandates OLD **and** RECENT, for `aggTrades` **and** `bookDepth` — four probes."""
    targets = probe_targets("BTCUSDT", old_period=date(2024, 3, 1), recent_period=date(2026, 8, 1))

    assert len(targets) == 4
    assert {t.dataset.name for t in targets} == {"aggTrades", "bookDepth"}


def test_the_probe_uses_monthly_for_agg_trades_and_daily_for_book_depth() -> None:
    """The measured trap: `bookDepth` has NO `monthly` prefix, so probing it monthly breaks.

    A probe that read the word "mensal" as the object granularity would emit
    `.../monthly/bookDepth/...`, get a `404` from a prefix that never existed, and report the
    dataset as DELETED. That is a false alarm indistinguishable from the real one this probe
    exists to raise.
    """
    targets = probe_targets("BTCUSDT", old_period=date(2024, 3, 1), recent_period=date(2026, 8, 1))
    by_dataset = {t.dataset.name: t for t in targets}

    assert by_dataset["aggTrades"].granularity == "monthly"
    assert by_dataset["bookDepth"].granularity == "daily"
    assert "/monthly/bookDepth/" not in " ".join(t.object_key for t in targets)


def test_a_404_is_absent_and_the_month_before_it_is_suspect() -> None:
    """Achado `A7`: the `curl -sI` catches May's 404 and MISSES the partial April behind it.

    This is the whole point of the task's fourth debt. April answers 200, its `.CHECKSUM`
    published by the vendor VERIFIES (`sha256sum -c` -> rc=0), `unzip -t` reports no errors, and
    it holds 0,942 % of the month its name declares. Five gates pass over it. The only thing that
    bites is its POSITION: the last period before a 404.
    """
    findings = classify(_measured_run())

    assert [f.finding for f in findings] == [PRESENT, SUSPECT_LAST_BEFORE_ABSENT, ABSENT]
    assert "2024-05" in findings[1].reason
    assert findings[1].partition is APRIL


def test_a_run_with_no_404_marks_nothing_suspect() -> None:
    """Do not manufacture suspicion: with no discontinuity, every period is simply present."""
    findings = classify(
        (
            ProbeOutcome(MARCH, 200, MARCH_BYTES),
            ProbeOutcome(APRIL, 200, MARCH_BYTES),
            ProbeOutcome(MAY, 200, MARCH_BYTES),
        )
    )

    assert {f.finding for f in findings} == {PRESENT}


def test_the_newest_period_is_never_suspect_because_nothing_follows_it() -> None:
    """The rule is about a NEIGHBOUR, and the newest period has none — so it stays `PRESENT`.

    Marking the newest period suspect "just in case" would flag EVERY window on EVERY run, and a
    warning that always fires is a warning nobody reads.
    """
    findings = classify((ProbeOutcome(MARCH, 200, MARCH_BYTES),))

    assert [f.finding for f in findings] == [PRESENT]


def test_only_the_immediate_successor_decides_and_a_later_gap_does_not_reach_back() -> None:
    """A 404 two steps away says nothing about this period — `A7` is a boundary one step wide."""
    findings = classify(
        (
            ProbeOutcome(MARCH, 200, MARCH_BYTES),
            ProbeOutcome(APRIL, 200, APRIL_BYTES),
            ProbeOutcome(MAY, 200, MARCH_BYTES),
            ProbeOutcome(
                DumpPartition(AGG_TRADES, "BTCUSDT", "monthly", date(2024, 6, 1)), 404, None
            ),
        )
    )

    assert [f.finding for f in findings] == [
        PRESENT,
        PRESENT,
        SUSPECT_LAST_BEFORE_ABSENT,
        ABSENT,
    ]


def test_classify_on_an_empty_run_returns_nothing_rather_than_asserting_health() -> None:
    """No observation is not a clean bill of health — it is no observation."""
    assert classify(()) == ()


def test_the_suspect_set_is_enumerated_and_not_matched_by_prefix() -> None:
    """Membership is a declared set, so renaming a member cannot silently empty it."""
    assert SUSPECT_FINDINGS == frozenset({SUSPECT_LAST_BEFORE_ABSENT})
    assert PRESENT not in SUSPECT_FINDINGS
    assert ABSENT not in SUSPECT_FINDINGS


def test_the_size_ratio_is_an_alarm_and_measurably_not_a_count_of_missing_hours() -> None:
    """`ADR-014/D3d`, MEASURED: the size ratio is 177,8x while the real deficit is 106,2x.

    The two numbers disagree by 67 %, which is why the ratio is accepted as an alarm and refused
    as `n_missing`. This test exists so that anyone tempted to multiply the ratio by the declared
    hours has to delete an assertion that names the discrepancy.
    """
    april = ProbeOutcome(APRIL, 200, APRIL_BYTES)
    march = ProbeOutcome(MARCH, 200, MARCH_BYTES)
    ratio = size_ratio_alarm(april, march)
    assert ratio is not None
    assert ratio == pytest.approx(177.8, abs=0.1)

    real_deficit = APRIL.declared_hours() / 6.781
    assert real_deficit == pytest.approx(106.2, abs=0.1)
    assert ratio > real_deficit * 1.5


def test_the_size_ratio_reports_nothing_when_a_length_is_missing_or_zero() -> None:
    """A `404` has no length, and dividing by an absent number would invent a ratio."""
    march = ProbeOutcome(MARCH, 200, MARCH_BYTES)
    gone = ProbeOutcome(MAY, 404, None)

    assert size_ratio_alarm(gone, march) is None
    assert size_ratio_alarm(ProbeOutcome(APRIL, 200, APRIL_BYTES), gone) is None
    assert size_ratio_alarm(ProbeOutcome(APRIL, 200, 0), march) is None


def test_a_dataset_with_no_declared_probe_granularity_is_refused() -> None:
    """Refusing beats defaulting to `monthly` — that default is the measured `bookDepth` break.

    A dataset nobody declared a granularity for is a dataset nobody measured. Guessing `monthly`
    would build a URL under a prefix that may not exist and read the resulting `404` as evidence
    that the bucket deleted something.
    """
    unmeasured = DumpDataset(name="bookTicker", has_monthly=True)

    with pytest.raises(UnknownProbeDatasetError, match="bookTicker"):
        probe_targets(
            "BTCUSDT",
            old_period=date(2024, 3, 1),
            recent_period=date(2026, 8, 1),
            datasets=(unmeasured,),
        )


def test_book_depth_probes_carry_the_daily_object_name() -> None:
    """The `bookDepth` target names a daily object, which is the only kind that exists."""
    targets = probe_targets(
        "BTCUSDT",
        old_period=date(2024, 3, 1),
        recent_period=date(2026, 8, 1),
        datasets=(BOOK_DEPTH,),
    )

    assert [t.object_name for t in targets] == [
        "BTCUSDT-bookDepth-2024-03-01.zip",
        "BTCUSDT-bookDepth-2026-08-01.zip",
    ]


def test_the_window_probe_targets_add_the_successor_of_the_newest_period() -> None:
    """The successor is the whole point of `A7`: the `404` that convicts sits OUTSIDE the window.

    An operator backfilling *up to the last month that exists* is doing the ordinary thing, and
    that is exactly the shape which silenced P2 before ciclo 2 — the `404` proving the last month
    was cut short lives one period past the end of what they asked for.
    """
    window = enumerate_window(AGG_TRADES, "BTCUSDT", date(2024, 4, 30), 60, "monthly")
    targets = probe_targets_for_window(window)

    assert [t.period_label for t in window] == ["2024-03", "2024-04"]
    assert [t.period_label for t in targets] == ["2024-03", "2024-04", "2024-05"]


def test_an_empty_window_asks_for_no_probe_at_all() -> None:
    """No window is no work, and asking for the successor of nothing would raise on `[-1]`."""
    assert probe_targets_for_window(()) == ()
