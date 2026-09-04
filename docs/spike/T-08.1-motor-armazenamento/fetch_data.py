#!/usr/bin/env python3
"""Fetch REAL Open Interest history from Binance Futures public REST API.

Used as the source dataset for the T-08.1 storage-engine spike (ADR-002/D4).
No API key required -- this endpoint is public. Output: one CSV per symbol
under --out-dir, columns: event_time_ms,symbol,sum_open_interest,sum_open_interest_value

Usage:
    python3 fetch_data.py --symbols BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT --days 30 --out-dir ./raw
"""
import argparse
import csv
import json
import logging
import time
import urllib.request
import urllib.parse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("fetch_data")

BASE = "https://fapi.binance.com/futures/data/openInterestHist"
PERIOD_MS = 5 * 60 * 1000  # "5m" period
LIMIT = 500


def fetch_symbol(symbol: str, start_ms: int, end_ms: int) -> list[dict]:
    rows: list[dict] = []
    cursor = start_ms
    while cursor < end_ms:
        # Binance ignores an over-wide window and returns the newest LIMIT rows
        # instead of the oldest -- the endTime of each page must be bounded to
        # cursor + LIMIT*PERIOD_MS, not the overall end_ms, or pagination silently
        # skips straight to "now" after the first call.
        page_end = min(cursor + LIMIT * PERIOD_MS, end_ms)
        params = {
            "symbol": symbol,
            "period": "5m",
            "limit": str(LIMIT),
            "startTime": str(cursor),
            "endTime": str(page_end),
        }
        url = f"{BASE}?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=15) as resp:
            batch = json.loads(resp.read())
        if not batch:
            break
        rows.extend(batch)
        last_ts = batch[-1]["timestamp"]
        if last_ts <= cursor:
            break
        cursor = last_ts + PERIOD_MS
        time.sleep(0.15)  # stay well under Binance rate limits
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", required=True)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    import os

    os.makedirs(args.out_dir, exist_ok=True)
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - args.days * 24 * 60 * 60 * 1000

    for symbol in args.symbols.split(","):
        log.info("fetching %s from %s to %s", symbol, start_ms, end_ms)
        rows = fetch_symbol(symbol, start_ms, end_ms)
        out_path = os.path.join(args.out_dir, f"{symbol}.csv")
        with open(out_path, "w", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["event_time_ms", "symbol", "sum_open_interest", "sum_open_interest_value"])
            for r in rows:
                writer.writerow([r["timestamp"], r["symbol"], r["sumOpenInterest"], r["sumOpenInterestValue"]])
        log.info("wrote %d rows to %s", len(rows), out_path)


if __name__ == "__main__":
    main()
