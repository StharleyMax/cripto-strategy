"""`infra.aggtrade_csv_reader`: the boundary where a CSV row becomes an `AggTradeTick`."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.modules.sentimento.infra.aggtrade_csv_reader import (
    read_aggtrade_ticks,
    read_aggtrade_ticks_from_many,
)

_HEADER = "agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker"


def test_read_aggtrade_ticks_reads_agg_id_and_transact_time_only(tmp_path: Path) -> None:
    """`price`/`quantity`/`is_buyer_maker`/the trade-id range are read past, never carried."""
    csv_path = tmp_path / "one-row.csv"
    csv_path.write_text(
        _HEADER + "\n100,69310.1,0.03,7983197862,7983197863,1787184000002,false\n",
        encoding="utf-8",
    )
    (tick,) = read_aggtrade_ticks(csv_path)
    assert tick.agg_id == 100
    assert tick.transact_time_ms == 1_787_184_000_002
    assert set(vars(tick)) == {"agg_id", "transact_time_ms"}


def test_read_aggtrade_ticks_preserves_file_order(tmp_path: Path) -> None:
    """No sort is applied — the reader hands back exactly the rows it saw, in that order."""
    csv_path = tmp_path / "three-rows.csv"
    csv_path.write_text(
        _HEADER + "\n"
        "3,69310.0,0.03,1,1,300,false\n"
        "1,69310.0,0.03,2,2,100,false\n"
        "2,69310.0,0.03,3,3,200,false\n",
        encoding="utf-8",
    )
    ticks = read_aggtrade_ticks(csv_path)
    assert [t.agg_id for t in ticks] == [3, 1, 2]


def test_read_aggtrade_ticks_refuses_a_header_that_does_not_match(tmp_path: Path) -> None:
    """A reordered or truncated header REFUSES rather than silently misreading columns."""
    csv_path = tmp_path / "wrong-header.csv"
    csv_path.write_text("agg_trade_id,transact_time\n1,100\n", encoding="utf-8")
    with pytest.raises(ValueError, match="does not match the seven declared columns"):
        read_aggtrade_ticks(csv_path)


def test_read_aggtrade_ticks_from_many_concatenates_in_the_order_given(tmp_path: Path) -> None:
    """Two files, concatenated caller-order — no re-sort, no gap-filling between them."""
    first = tmp_path / "day1.csv"
    first.write_text(_HEADER + "\n1,0,0,0,0,100,false\n2,0,0,0,0,200,false\n", encoding="utf-8")
    second = tmp_path / "day2.csv"
    second.write_text(_HEADER + "\n10,0,0,0,0,1000,false\n", encoding="utf-8")

    ticks = read_aggtrade_ticks_from_many([first, second])
    assert [t.agg_id for t in ticks] == [1, 2, 10]
