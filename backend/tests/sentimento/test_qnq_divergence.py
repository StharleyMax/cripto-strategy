"""`QF-6`/`D3.7` — `count(q != nq)/n` and the deficit in bp, reproduced on the real REST evidence.

`docs/plans/SPEC-001-plataforma-dados/03_captura_continua.md`, `D3.7`: "≥ 7 dias × conjunto
declarado. Base: DOGEUSDT 16/1000, 80,56 bp; BTC/ETH/SOL/XRP 0/1000 `[MEDIDO]`". The handoff for
this task is explicit that the 7-day/regime-real half is `[NÃO MEDIDO]` — it needs days actually
running, which this code has not done yet. What this file proves is the MECHANISM: the exact
formula `ADR-001`/`docs/medicao-coinalyze.md` publish, reproduced bit-for-bit on the same real
snapshot those documents cite (`data/binance/rest/nq_{BTC,ETH,SOL,XRP,DOGE}USDT.json`, one REST
`aggTrades` call of 1000 trades per symbol, `[MEDIDO 2026-08-25]`), plus the `(symbol, day)`
grouping `QF-6` requires — proven separately, on synthetic timestamps, because the real snapshot
spans 251 s and never crosses a UTC day boundary (`[MEDIDO]`, so it cannot exercise grouping by
itself).
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.modules.sentimento.domain.qnq_divergence import (
    EmptyQnqGroupError,
    InvalidQnqQuantityError,
    QnqTrade,
    measure_qnq_divergence,
)
from src.modules.sentimento.infra.aggtrade_rest_snapshot_reader import (
    read_qnq_trades_from_rest_snapshot,
)
from tests.helpers.data_fixtures import require_fixture

_DOGEUSDT_MD5 = "44206adfb0a1fb1d6b6e746d2ec31d9f"
_BTCUSDT_MD5 = "06e72f0fc1f79fa5c168efc8945b8a5f"
_ETHUSDT_MD5 = "ad777b54ae3e7a8425b1938600feba50"
_SOLUSDT_MD5 = "71a0a841dacca25f1bfd485215c3ac98"
_XRPUSDT_MD5 = "d75f86573cc362938c148f80de292188"


def _snapshot(symbol: str, expected_md5: str) -> tuple[QnqTrade, ...]:
    path = require_fixture(f"binance/rest/nq_{symbol}.json", expected_md5=expected_md5)
    return read_qnq_trades_from_rest_snapshot(path, symbol=symbol)


# ── `D3.7` sobre a evidencia real de `ADR-001` ──────────────────────────────────────────────


def test_d3_7_dogeusdt_reproduces_adr_001s_16_of_1000_at_80_56_bp() -> None:
    """`[MEDIDO]`: the one symbol of the declared set where `q` and `nq` disagree at all."""
    trades = _snapshot("DOGEUSDT", _DOGEUSDT_MD5)
    (stats,) = measure_qnq_divergence(trades)
    assert stats.symbol == "DOGEUSDT"
    assert stats.n == 1000
    assert stats.divergent_count == 16
    assert round(stats.deficit_bp, 2) == Decimal("80.56")


@pytest.mark.parametrize(
    ("symbol", "expected_md5"),
    [
        ("BTCUSDT", _BTCUSDT_MD5),
        ("ETHUSDT", _ETHUSDT_MD5),
        ("SOLUSDT", _SOLUSDT_MD5),
        ("XRPUSDT", _XRPUSDT_MD5),
    ],
)
def test_d3_7_the_other_four_symbols_of_the_declared_set_show_zero_divergence(
    symbol: str, expected_md5: str
) -> None:
    """`[MEDIDO]`: BTC/ETH/SOL/XRP, 0/1000, 0,00 bp — `ADR-001`'s own contrast to DOGEUSDT."""
    trades = _snapshot(symbol, expected_md5)
    (stats,) = measure_qnq_divergence(trades)
    assert stats.n == 1000
    assert stats.divergent_count == 0
    assert stats.deficit_bp == 0


def test_d3_7_the_snapshot_never_crosses_a_utc_day_so_it_is_one_group_per_symbol() -> None:
    """Names the gap honestly: real evidence today is ONE window, never ≥ 7 real days."""
    trades = _snapshot("DOGEUSDT", _DOGEUSDT_MD5)
    days = {trade.day for trade in trades}
    assert len(days) == 1


# ── a mecanica de agrupamento por (simbolo, dia) — sintetica, porque a evidencia real e um so dia


def _synthetic_trade(symbol: str, day: str, raw_q: str, raw_nq: str) -> QnqTrade:
    return QnqTrade(symbol=symbol, day=day, raw_q=raw_q, raw_nq=raw_nq)


def test_the_grouping_mechanism_separates_two_symbols_on_the_same_day() -> None:
    """Proven on synthetic data: the real snapshot is single-symbol per file."""
    trades = [
        _synthetic_trade("BTCUSDT", "2026-08-20", "10", "10"),
        _synthetic_trade("ETHUSDT", "2026-08-20", "10", "9"),
    ]
    stats = measure_qnq_divergence(trades)
    assert {s.symbol for s in stats} == {"BTCUSDT", "ETHUSDT"}
    by_symbol = {s.symbol: s for s in stats}
    assert by_symbol["BTCUSDT"].divergent_count == 0
    assert by_symbol["ETHUSDT"].divergent_count == 1


def test_the_grouping_mechanism_separates_the_same_symbol_across_two_days() -> None:
    """`QF-6`'s own axis: "por símbolo E por dia" — two days of the same symbol, two rows."""
    trades = [
        _synthetic_trade("DOGEUSDT", "2026-08-20", "100", "100"),
        _synthetic_trade("DOGEUSDT", "2026-08-20", "100", "100"),
        _synthetic_trade("DOGEUSDT", "2026-08-21", "100", "90"),
    ]
    stats = measure_qnq_divergence(trades)
    assert len(stats) == 2
    by_day = {s.day: s for s in stats}
    assert by_day["2026-08-20"].n == 2
    assert by_day["2026-08-20"].divergent_count == 0
    assert by_day["2026-08-21"].n == 1
    assert by_day["2026-08-21"].divergent_count == 1
    assert round(by_day["2026-08-21"].deficit_bp, 2) == Decimal("1000.00")


def test_results_are_sorted_by_symbol_then_day_regardless_of_input_order() -> None:
    """Deterministic output, mirroring `cvd.cvd_delta_by_bucket`'s own sorted-return contract."""
    trades = [
        _synthetic_trade("ETHUSDT", "2026-08-21", "1", "1"),
        _synthetic_trade("BTCUSDT", "2026-08-22", "1", "1"),
        _synthetic_trade("BTCUSDT", "2026-08-20", "1", "1"),
    ]
    stats = measure_qnq_divergence(trades)
    assert [(s.symbol, s.day) for s in stats] == [
        ("BTCUSDT", "2026-08-20"),
        ("BTCUSDT", "2026-08-22"),
        ("ETHUSDT", "2026-08-21"),
    ]


def test_divergence_ratio_is_a_fraction_not_a_percentage() -> None:
    """`QF-6`, literal: `count(q != nq)/n` — a ratio, `deficit_bp` is the separate bp figure."""
    (stats,) = measure_qnq_divergence(
        [
            _synthetic_trade("DOGEUSDT", "2026-08-20", "1", "1"),
            _synthetic_trade("DOGEUSDT", "2026-08-20", "1", "0"),
        ]
    )
    assert stats.divergence_ratio == Decimal("0.5")


# ── recusas ──────────────────────────────────────────────────────────────────────────────


def test_an_unparseable_q_refuses_instead_of_understating_the_group() -> None:
    """An unparseable quantity is refused, never treated as zero (`SPEC-001` §2.6's own rule)."""
    trades = [_synthetic_trade("DOGEUSDT", "2026-08-20", "not-a-number", "1")]
    with pytest.raises(InvalidQnqQuantityError, match="DOGEUSDT/2026-08-20"):
        measure_qnq_divergence(trades)


def test_a_group_with_zero_total_q_volume_refuses_the_deficit_division() -> None:
    """`0/0` never silently reads as `0,00 bp` — the division is refused, not glossed over."""
    trades = [_synthetic_trade("DOGEUSDT", "2026-08-20", "0", "0")]
    with pytest.raises(EmptyQnqGroupError, match="DOGEUSDT/2026-08-20"):
        measure_qnq_divergence(trades)
