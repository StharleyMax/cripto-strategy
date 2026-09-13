"""Is `2*takerBuyBaseVol - volume` a RECONSTRUCTION of `aggtrade_q`'s `cvd_delta`, or a read?

`T-02.1` (`SPEC-007` phase `02`, plan item 2.3, DoD 6). This script exists to be RUN BEFORE the
fourth `cvd_source` catalog row is written, and the reason the order matters is arithmetic, not
process: `series_key_id()` is the `sha256` of the canonical projection of all fifteen `SeriesKey`
terms (`series_key.py:226-234`), so changing `reconstructed_from` after the fact does not correct
the row — it RE-IDENTIFIES the series, and every row already written lands under an id nothing
addresses any more.

THE COMPARISON, and each side names its own provenance:

  * left  — `/fapi/v1/klines`, `interval=1m`: `delta = 2*takerBuyBaseVol[9] - volume[5]`, which is
    `takerBuy - takerSell` by construction, the exchange's OWN aggregation of the bucket;
  * right — the canonical `aggTrade` dump (`data/binance/aggtrades/`), folded by
    `domain/cvd.cvd_delta_by_bucket` — the REAL function, not a re-implementation of its
    arithmetic here, so a change to `SPEC-001` §2.6's convention moves this measurement too.

The dump is read in chunks and each chunk folded by the domain function, then the per-bucket
`Decimal` totals are added across chunks. That is equal to folding the whole day at once
(addition is associative, the quantities carry three decimals and `Decimal` does not round at
these magnitudes) and it keeps 2,4 million trades from being materialised as 2,4 million
dataclasses at once.

⛔ THE VERDICT IS NOT "ANY NONZERO DIFF IS A RECONSTRUCTION", and writing it that way would have
answered this question WRONG. Plan `02` item 2.3 asks whether the two diverge "beyond what BUCKET
AGGREGATION explains", and bucket aggregation has one specific signature: a trade attributed to
minute `i` by one side and to minute `i+1` by the other moves quantity BETWEEN adjacent buckets
without creating or destroying any — so the diffs of a maximal run of consecutive divergent
buckets sum to exactly zero. A reconstruction, by contrast, gets the QUANTITY wrong, and a wrong
quantity does not cancel against its neighbour.

So this script partitions the divergent buckets into maximal consecutive runs and asks whether
EVERY run cancels to exactly zero:

  * every run cancels  -> BUCKET_BOUNDARY_ATTRIBUTION. The klines row reads the same quantities
    the canonical dump carries, laid on the grid the ORIGIN itself publishes; nothing is
    reconstructed, so `reconstructed_from=None` and `published_error=None` survive the falsifier;
  * any run leaves a residual -> RECONSTRUCTION. The row IS an approximation of `aggtrade_q` and
    `SeriesCatalogEntry.__post_init__` (`D6.9`) must be given a `published_error`.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.request
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from src.modules.sentimento.domain.cvd import (  # noqa: E402
    CvdTrade,
    cvd_delta_by_bucket,
)

KLINES_URL = "https://fapi.binance.com/fapi/v1/klines"
OPEN_TIME, VOLUME, TAKER_BUY = 0, 5, 9
CHUNK = 500_000
DAY_MS = 86_400_000


def klines_for_day(symbol: str, day_start_ms: int) -> dict[int, tuple[Decimal, Decimal]]:
    """Fetch the 1m klines of one UTC day, keyed by `openTime` -> (volume, takerBuyBaseVol)."""
    query = (
        f"?symbol={symbol}&interval=1m&limit=1500"
        f"&startTime={day_start_ms}&endTime={day_start_ms + DAY_MS - 1}"
    )
    with urllib.request.urlopen(KLINES_URL + query, timeout=30) as response:  # noqa: S310
        payload = json.loads(response.read())
    return {
        int(row[OPEN_TIME]): (Decimal(str(row[VOLUME])), Decimal(str(row[TAKER_BUY])))
        for row in payload
    }


def cvd_delta_from_dump(csv_path: Path) -> dict[int, Decimal]:
    """Fold the aggTrade dump through `domain/cvd.cvd_delta_by_bucket`, chunk by chunk."""
    totals: dict[int, Decimal] = defaultdict(Decimal)
    chunk: list[CvdTrade] = []

    def flush() -> None:
        for fact in cvd_delta_by_bucket(chunk):
            totals[fact.bucket_start_ms] += fact.value
        chunk.clear()

    with csv_path.open(newline="") as handle:
        for record in csv.DictReader(handle):
            chunk.append(
                CvdTrade(
                    agg_id=int(record["agg_trade_id"]),
                    transact_time_ms=int(record["transact_time"]),
                    raw_quantity=record["quantity"],
                    is_buyer_maker=record["is_buyer_maker"].strip().lower() == "true",
                )
            )
            if len(chunk) >= CHUNK:
                flush()
    if chunk:
        flush()
    return dict(totals)


def divergent_runs(diffs: Sequence[Decimal]) -> tuple[tuple[int, int, Decimal], ...]:
    """Partition `diffs` into maximal runs of consecutive NONZERO entries.

    Returns `(start_index, length, residual)` per run. `residual` is the run's signed sum: zero
    means the run only MOVED quantity between adjacent buckets (bucket-boundary attribution),
    nonzero means quantity was created or destroyed, which aggregation cannot explain.
    """
    runs: list[tuple[int, int, Decimal]] = []
    index = 0
    while index < len(diffs):
        if diffs[index] == 0:
            index += 1
            continue
        end = index
        while end < len(diffs) and diffs[end] != 0:
            end += 1
        runs.append((index, end - index, sum(diffs[index:end], Decimal(0))))
        index = end
    return tuple(runs)


def main() -> int:
    """Run the comparison and print the verdict, with the universe it was measured over."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--day", required=True, help="UTC day, YYYY-MM-DD")
    parser.add_argument("--dump", required=True, type=Path, help="aggTrades CSV for that day")
    args = parser.parse_args()

    day_start_ms = int(
        datetime.strptime(args.day, "%Y-%m-%d").replace(tzinfo=UTC).timestamp() * 1000
    )
    klines = klines_for_day(args.symbol, day_start_ms)
    dump = cvd_delta_from_dump(args.dump)
    common = sorted(set(klines) & set(dump))

    diffs: list[Decimal] = []
    left_total = Decimal(0)
    right_total = Decimal(0)
    worst_abs = Decimal(0)
    worst_bp = Decimal(0)
    for bucket in common:
        volume, taker_buy = klines[bucket]
        left = 2 * taker_buy - volume
        right = dump[bucket]
        left_total += left
        right_total += right
        diffs.append(left - right)
        if abs(left - right) > worst_abs:
            worst_abs = abs(left - right)
            worst_bp = worst_abs / volume * 10_000 if volume else Decimal(0)

    runs = divergent_runs(diffs)
    uncancelled = tuple(run for run in runs if run[2] != 0)
    exact = sum(1 for diff in diffs if diff == 0)

    print(f"symbol={args.symbol} day={args.day}")
    print(f"n_klines={len(klines)} n_dump_buckets={len(dump)} n_common={len(common)}")
    print(f"exact_match={exact}/{len(common)}")
    print(f"day_total_klines={left_total} day_total_aggtrade_q={right_total}")
    print(f"day_total_diff={left_total - right_total}")
    print(f"worst_bucket_diff={worst_abs} ({worst_bp:.4f} bp of that bucket's volume)")
    print(f"divergent_runs={len(runs)} runs_with_residual={len(uncancelled)}")
    for start, length, residual in uncancelled[:5]:
        print(f"  residual run at bucket {common[start]} len={length} residual={residual}")
    reconstruction = bool(uncancelled)
    print(
        "VERDICT: "
        + ("RECONSTRUCTION" if reconstruction else "DIRECT_READ (BUCKET_BOUNDARY_ATTRIBUTION)")
    )
    return 1 if reconstruction else 0


if __name__ == "__main__":
    raise SystemExit(main())
