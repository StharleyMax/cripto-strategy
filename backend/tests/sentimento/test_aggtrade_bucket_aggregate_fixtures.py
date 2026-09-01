"""`D3.5` run against a real `aggTrades` dump the plan pins by `md5` — the bucket-fold layer.

`docs/plans/SPEC-001-plataforma-dados/03_captura_continua.md`, item 3.5 / `D3.5`. This file
proves `aggtrade_bucket_aggregate.py` on the SAME real fixture `test_aggtrade_contiguity_
fixtures.py` (`T-04.3`) already proved contiguous at full scale (8.873.078 rows across three
days, 0 internal `agg_id` jumps, 1 named jump at the missing `2026-08-22`).

`limit=` below reads only the FIRST slice of that same file: the multi-million-row scale of
the underlying tick-level contiguity check is not re-measured here (`require_contiguous`
DELEGATES to `aggtrade_contiguity.detect_agg_id_gaps`, unchanged — re-running it at full scale
a second time would cost real minutes for zero new information, `[MEDIDO]`: reading and
`Decimal`-folding the whole 2026-08-21 file, 4.802.005 rows, takes 68 s on this bancada,
against 0.3 s for the first 20.000). What this file proves is specific to the NEW layer: the
fold's eight terms on real bytes, and the falsifier `D3.5` names — "deletar 1 linha do fixture
⇒ reprova" — on the real fixture, not a synthetic stand-in.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.aggtrade_bucket_aggregate import (
    AggTradeBucketTrade,
    AggTradeGapError,
    aggregate_by_bucket,
    require_contiguous,
)
from src.modules.sentimento.infra.aggtrade_csv_reader import read_aggtrade_bucket_trades
from tests.helpers.data_fixtures import require_fixture

_FIXTURE_2026_08_21 = "binance/aggtrades/BTCUSDT-aggTrades-2026-08-21.csv"
_MD5_2026_08_21 = "31f5b006714d6cbc41f8a0b4e10a7aae"

_SLICE_ROWS = 20_000
_SYMBOL = "BTCUSDT"


def _real_slice() -> tuple[AggTradeBucketTrade, ...]:
    path = require_fixture(_FIXTURE_2026_08_21, expected_md5=_MD5_2026_08_21)
    return read_aggtrade_bucket_trades(path, limit=_SLICE_ROWS)


def test_d3_5_the_real_slice_has_zero_internal_gaps() -> None:
    """`[MEDIDO]`: the first 20.000 real rows of a fully-captured day are gap-free."""
    trades = _real_slice()
    assert len(trades) == _SLICE_ROWS
    require_contiguous(trades)  # does not raise


def test_d3_5_the_real_slice_folds_into_eight_one_minute_buckets_with_no_volume_lost() -> None:
    """`[MEDIDO]`: every trade of the slice lands in exactly one bucket — `Σtx == 20.000`."""
    trades = _real_slice()
    buckets = aggregate_by_bucket(_SYMBOL, trades)
    assert len(buckets) == 8
    assert sum(bucket.tx for bucket in buckets) == _SLICE_ROWS
    assert sum(bucket.btx for bucket in buckets) <= _SLICE_ROWS


def test_d3_5_the_dump_never_carries_nq_on_any_real_bucket() -> None:
    """`CL-5`, structural: every bucket folded from the dump reports `nq` as absent, not zero."""
    trades = _real_slice()
    buckets = aggregate_by_bucket(_SYMBOL, trades)
    assert all(bucket.sum_nq_buy is None and bucket.sum_nq_sell is None for bucket in buckets)
    assert all(bucket.nq_trade_count == 0 for bucket in buckets)


def test_d3_5_deleting_one_real_row_from_the_middle_of_the_slice_makes_it_reprove() -> None:
    """`D3.5`'s own falsifier, literal: "deletar 1 linha do fixture ⇒ reprova" — on real bytes.

    The removed row sits well inside the slice (neither the first nor the last `agg_id`), so a
    check that only compared bucket-level `min`/`max` would miss it; `require_contiguous`
    catches it because the check runs on every trade's own `agg_id`.
    """
    trades = list(_real_slice())
    require_contiguous(trades)  # baseline: does not raise

    middle_index = len(trades) // 2
    removed_agg_id = trades[middle_index].agg_id
    del trades[middle_index]

    with pytest.raises(AggTradeGapError, match=str(removed_agg_id - 1)):
        require_contiguous(trades)


def test_d3_5_aggregate_by_bucket_refuses_the_same_deletion() -> None:
    """The end-to-end path: `aggregate_by_bucket` refuses before folding anything, real bytes."""
    trades = list(_real_slice())
    del trades[len(trades) // 2]

    with pytest.raises(AggTradeGapError):
        aggregate_by_bucket(_SYMBOL, trades)
