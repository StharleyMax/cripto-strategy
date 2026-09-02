"""`T-03.10`: the dump window is enumerated A PRIORI from a DEPTH, and refuses what cannot exist."""

from __future__ import annotations

from datetime import date

import pytest

from src.modules.sentimento.domain.dump_window import (
    AGG_TRADES,
    BOOK_DEPTH,
    DEFAULT_DEPTH_DAYS,
    DumpPartition,
    InvalidDepthError,
    UnknownDatasetError,
    UnsupportedGranularityError,
    backlog_of,
    dataset_by_name,
    enumerate_window,
)

END = date(2026, 8, 29)


def test_the_declared_default_depth_is_thirty_days() -> None:
    """`Q18`(d): the depth is a PARAMETER whose declared default is 30 days, never a gate."""
    assert DEFAULT_DEPTH_DAYS == 30
    window = enumerate_window(AGG_TRADES, "BTCUSDT", END)
    assert len(window) == 30


def test_the_window_is_closed_inclusive_and_ordered_oldest_first() -> None:
    """Enumerate `[end - depth + 1, end]` inclusive, oldest first — the declared work order."""
    window = enumerate_window(AGG_TRADES, "BTCUSDT", END, depth_days=3, granularity="daily")

    assert [p.period for p in window] == [date(2026, 8, 27), date(2026, 8, 28), date(2026, 8, 29)]


def test_a_deeper_window_is_a_superset_of_a_shallower_one_ending_the_same_day() -> None:
    """The owner's argument for `Q18` not being a gate, asserted rather than quoted.

    *"comecar por 30 dias e estender depois nao e retrabalho, e a mesma fila com outro limite"*.
    That is only true if extending the depth PRESERVES the keys the shallow window already
    drained — otherwise the checkpoint would be full of keys the new window does not contain, and
    `EtlBacklog.pending` raises `CheckpointOutsideWindowError` on exactly that. So this is the
    test that makes the owner's claim structural instead of aspirational.
    """
    shallow = {p.object_key for p in enumerate_window(AGG_TRADES, "BTCUSDT", END, 30, "daily")}
    deep = {p.object_key for p in enumerate_window(AGG_TRADES, "BTCUSDT", END, 90, "daily")}

    assert shallow < deep
    assert len(deep) == 90


def test_a_monthly_window_collapses_the_days_it_touches_into_distinct_months() -> None:
    """Return one partition per month TOUCHED, deduplicated — 30 days is 1 or 2 objects."""
    window = enumerate_window(AGG_TRADES, "BTCUSDT", END, depth_days=30, granularity="monthly")

    assert [p.period_label for p in window] == ["2026-07", "2026-08"]


def test_book_depth_has_no_monthly_prefix_and_the_window_refuses_to_pretend_it_does() -> None:
    """`SPEC-001` §5.8 `[MEDIDO, CST-5]`: an ETL that assumes monthly for `bookDepth` BREAKS.

    This is the trap the plan pairs items 3.11 and 3.14 over: the word "mensal" in *"`curl -sI`
    mensal"* is the CADENCE of the probe, and reading it as the GRANULARITY of the object builds
    a URL for a prefix the publisher does not serve.
    """
    with pytest.raises(UnsupportedGranularityError):
        enumerate_window(BOOK_DEPTH, "BTCUSDT", END, depth_days=30, granularity="monthly")

    daily = enumerate_window(BOOK_DEPTH, "BTCUSDT", END, depth_days=2, granularity="daily")
    assert [p.granularity for p in daily] == ["daily", "daily"]


@pytest.mark.parametrize("depth", [0, -1, -365])
def test_a_depth_that_enumerates_nothing_is_refused(depth: int) -> None:
    """Refuse a depth that would produce an empty or backwards window."""
    with pytest.raises(InvalidDepthError):
        enumerate_window(AGG_TRADES, "BTCUSDT", END, depth_days=depth)


def test_the_object_key_is_the_bucket_key_and_the_url_is_built_from_it() -> None:
    """Build the key exactly as the bucket serves it — the layout `ADR-014` actually fetched."""
    partition = DumpPartition(
        dataset=AGG_TRADES, symbol="BTCUSDT", granularity="monthly", period=date(2024, 4, 1)
    )

    assert partition.object_name == "BTCUSDT-aggTrades-2024-04.zip"
    assert partition.object_key == (
        "data/futures/um/monthly/aggTrades/BTCUSDT/BTCUSDT-aggTrades-2024-04.zip"
    )
    assert partition.url == (
        "https://data.binance.vision/data/futures/um/monthly/aggTrades/BTCUSDT/"
        "BTCUSDT-aggTrades-2024-04.zip"
    )


def test_declared_hours_come_from_the_name_and_know_the_length_of_each_month() -> None:
    """Read the DECLARED window off the object name — the denominator of the class-O question.

    April 2024 declares 720 h. `ADR-014` measured that the object covers 6,781 h of them, so the
    number this returns is the one that makes *"0,942 % do mes"* computable at all.
    """
    april = DumpPartition(AGG_TRADES, "BTCUSDT", "monthly", date(2024, 4, 1))
    february_leap = DumpPartition(AGG_TRADES, "BTCUSDT", "monthly", date(2024, 2, 1))
    february_plain = DumpPartition(AGG_TRADES, "BTCUSDT", "monthly", date(2026, 2, 1))
    december = DumpPartition(AGG_TRADES, "BTCUSDT", "monthly", date(2024, 12, 1))
    one_day = DumpPartition(BOOK_DEPTH, "BTCUSDT", "daily", date(2024, 4, 15))

    assert april.declared_hours() == 720.0
    assert february_leap.declared_hours() == 696.0
    assert february_plain.declared_hours() == 672.0
    # December is the year boundary, where naive month arithmetic wraps to month 13.
    assert december.declared_hours() == 744.0
    assert one_day.declared_hours() == 24.0
    assert 6.781 / april.declared_hours() == pytest.approx(0.00942, abs=1e-5)


def test_an_unknown_dataset_name_is_refused_naming_what_is_available() -> None:
    """Refuse a dataset outside the closed vocabulary instead of building a plausible URL."""
    assert dataset_by_name("aggTrades") is AGG_TRADES
    assert dataset_by_name("bookDepth") is BOOK_DEPTH
    with pytest.raises(UnknownDatasetError, match="aggTrades"):
        dataset_by_name("aggTrade")


def test_the_window_becomes_the_backlog_the_existing_drain_already_consumes() -> None:
    """No second resume mechanism: the window IS an `EtlBacklog`, in the enumerated order."""
    window = enumerate_window(AGG_TRADES, "BTCUSDT", END, depth_days=5, granularity="daily")
    backlog = backlog_of(window)

    assert len(backlog) == 5
    assert backlog.keys == tuple(p.object_key for p in window)
    assert backlog.pending(done=[]) == backlog.keys
