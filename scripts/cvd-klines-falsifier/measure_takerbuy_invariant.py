"""Is `0 <= takerBuyBaseVol <= volume` true over the whole backfill window? (`DoD 5`, item 2.4)

`T-02.2`/`T-02.3`, phase `02` of `SPEC-007`. The guard lives in
`domain/kline_cvd.kline_cvd_delta` and REFUSES a bucket that violates the chain — which means
that if the invariant were false anywhere in the seven days the collector backfills at boot, the
collector would raise and the pass would close `REJECTED`. That is the correct behaviour and a
terrible thing to discover in production, so this script measures the window first.

It walks the SAME window and the SAME symbols the collector does (`KLINES_BACKFILL_DAYS` over
`INITIAL_SYMBOLS`, `interval=1m`), pages it at the endpoint's own `MAX_LIMIT`, and counts every
bucket. The invariant is evaluated by calling the PRODUCTION function, not by re-writing the
comparison here: a re-written comparison could be right while the shipped one is wrong.

⚠️ THIS IS A MEASUREMENT, NOT PART OF THE COLLECTOR. It makes its own HTTP calls, and those are
not the "zero new calls" `DoD 7` is about — that one is the diff of what the COLLECTOR spends,
and the test that pins it is
`test_collectors_cli_klines_collector.py::test_both_identities_are_published_from_the_very_same_single_http_call`.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from src.modules.sentimento.domain.kline_cvd import (  # noqa: E402
    TakerBuyExceedsVolumeError,
    kline_cvd_delta,
)
from src.modules.sentimento.infra.binance_klines_client import (  # noqa: E402
    MAX_LIMIT,
    BinanceKlinesClient,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (  # noqa: E402
    KLINES_BUCKET_WIDTH_MS,
    INITIAL_SYMBOLS,
)

BACKFILL_DAYS = 7
MS_PER_DAY = 86_400_000


def main() -> int:
    """Walk the backfill window per symbol and report violations, with the universe counted."""
    import time

    client = BinanceKlinesClient()
    now_ms = int(time.time() * 1000)
    start_ms = now_ms - BACKFILL_DAYS * MS_PER_DAY

    total = 0
    violations = 0
    for symbol in sorted(INITIAL_SYMBOLS):
        cursor: int | None = start_ms
        counted = 0
        while cursor is not None:
            page = client.klines(symbol, "1m", MAX_LIMIT, start_time_ms=cursor)
            if page.api_code is not None or not page.rows:
                break
            for row in page.rows:
                counted += 1
                try:
                    kline_cvd_delta(
                        volume=row.volume, taker_buy_base_volume=row.taker_buy_base_volume
                    )
                except TakerBuyExceedsVolumeError as violation:
                    violations += 1
                    print(f"VIOLATION {symbol} openTime={row.open_time_ms}: {violation}")
            if len(page.rows) < MAX_LIMIT:
                break
            cursor = page.rows[-1].open_time_ms + KLINES_BUCKET_WIDTH_MS
            if cursor >= now_ms:
                break
        print(f"{symbol}: {counted} buckets")
        total += counted

    print(f"universe: {len(INITIAL_SYMBOLS)} symbols x {BACKFILL_DAYS}d at 1m -> n={total}")
    print(f"violations of 0 <= takerBuy <= volume: {violations}")
    print("VERDICT: " + ("INVARIANT_BROKEN" if violations else "INVARIANT_HELD"))
    return 1 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
