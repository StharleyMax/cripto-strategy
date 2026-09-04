#!/usr/bin/env python3
"""Build the bitemporal spike dataset (ADR-002/D4) from the raw Binance CSVs,
inject the 3 poison classes of SPEC-001 Sec.5.1, and compute an INDEPENDENT
Python reference for the expected as_of(t) result -- so both storage engines
are checked against a computation that does not share code with either engine's
SQL, per this repo's "dois caminhos independentes" discipline (D8.1).

Output (under --out-dir):
  dataset.csv        -- every row that gets loaded into BOTH engines
  reference.json      -- expected as_of results per test, computed in Python
  manifest.json        -- cutoffs, poisoned event_times, counts (audit trail)
"""
import argparse
import csv
import json
import os
from datetime import datetime, timedelta, timezone


def load_raw(raw_dir: str, symbol: str) -> list[dict]:
    rows = []
    with open(os.path.join(raw_dir, f"{symbol}.csv")) as fh:
        for r in csv.DictReader(fh):
            rows.append(
                {
                    "event_time_ms": int(r["event_time_ms"]),
                    "symbol": r["symbol"],
                    "sum_open_interest": float(r["sum_open_interest"]),
                    "sum_open_interest_value": float(r["sum_open_interest_value"]),
                }
            )
    rows.sort(key=lambda r: r["event_time_ms"])
    return rows


def iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--symbols", default="BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT")
    ap.add_argument("--lag-s", type=int, default=90, help="normal ingestion lag: available_at = event_time + lag")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    symbols = args.symbols.split(",")
    all_real: dict[str, list[dict]] = {s: load_raw(args.raw_dir, s) for s in symbols}

    dataset_rows: list[dict] = []
    manifest: dict = {"symbols": symbols, "lag_s": args.lag_s}

    # ---- base: every real row, fonte='q', is_final=true ----------------------------
    for s in symbols:
        for r in all_real[s]:
            available_at_ms = r["event_time_ms"] + args.lag_s * 1000
            dataset_rows.append(
                {
                    "event_time": iso(r["event_time_ms"]),
                    "symbol": s,
                    "sum_open_interest": r["sum_open_interest"],
                    "sum_open_interest_value": r["sum_open_interest_value"],
                    "bucket_end": iso(r["event_time_ms"] + 5 * 60 * 1000),
                    "available_at": iso(available_at_ms),
                    "observed_at": iso(available_at_ms),
                    "is_final": "true",
                    "fonte": "q",
                    "poison_class": "",
                }
            )

    btc = all_real["BTCUSDT"]
    n = len(btc)
    # evenly sampled indices, away from the very edges so lag math stays inside range
    idx_a = list(range(200, 200 + 30))
    idx_b = list(range(400, 400 + 30))
    manifest["cutoff_test_a"] = iso(btc[-1]["event_time_ms"])  # right after all real availability
    manifest["cutoff_test_b"] = None  # per-row, computed below

    # ---- class (a): event_time PASSADO, available_at FUTURO ------------------------
    # A late "correction" row for an already-published bucket, dated far beyond the
    # test cutoff. as_of(cutoff) must ignore it -> result identical to no-poison.
    poisoned_a_event_times = []
    for i in idx_a:
        r = btc[i]
        poisoned_a_event_times.append(iso(r["event_time_ms"]))
        dataset_rows.append(
            {
                "event_time": iso(r["event_time_ms"]),
                "symbol": "BTCUSDT",
                "sum_open_interest": r["sum_open_interest"] * 1.5,  # perturbed, so a leak is detectable
                "sum_open_interest_value": r["sum_open_interest_value"] * 1.5,
                "bucket_end": iso(r["event_time_ms"] + 5 * 60 * 1000),
                "available_at": iso(r["event_time_ms"] + 20 * 24 * 60 * 60 * 1000),  # +20 days
                "observed_at": iso(r["event_time_ms"] + 20 * 24 * 60 * 60 * 1000),
                "is_final": "true",
                "fonte": "q",
                "poison_class": "a",
            }
        )
    manifest["poison_a_event_times"] = poisoned_a_event_times

    # ---- class (b): bucket PARCIAL (is_final=false), bucket_end > t, available_at <= t
    # Same event_time as an already-final bucket, but observed EARLIER (partial reading
    # that arrived before the final one closed). final_only must ignore it; intrabar
    # (argmin(observed_at) among rows available by t) must pick it, and diverge.
    poisoned_b_event_times = []
    for i in idx_b:
        r = btc[i]
        poisoned_b_event_times.append(iso(r["event_time_ms"]))
        partial_available_ms = r["event_time_ms"] + 30 * 1000  # observed at +30s, before the final row's +90s
        dataset_rows.append(
            {
                "event_time": iso(r["event_time_ms"]),
                "symbol": "BTCUSDT",
                "sum_open_interest": r["sum_open_interest"] * 0.5,  # partial reading, different value
                "sum_open_interest_value": r["sum_open_interest_value"] * 0.5,
                "bucket_end": iso(r["event_time_ms"] + 5 * 60 * 1000),
                "available_at": iso(partial_available_ms),
                "observed_at": iso(partial_available_ms),
                "is_final": "false",
                "fonte": "q",
                "poison_class": "b",
            }
        )
    manifest["poison_b_event_times"] = poisoned_b_event_times
    manifest["cutoff_test_b"] = iso(btc[-1]["event_time_ms"])  # both rows are available well before this

    # ---- class (c): mesmo bucket em fonte 'q' (dump) e 'nq' (ao vivo) --------------
    # nq rows exist only from live_start_ms onward. Querying nq before live_start_ms
    # must return SEM_FONTE (absence), never fall back to q.
    live_start_ms = btc[int(n * 0.9)]["event_time_ms"]  # last ~10% of the window is "live"
    manifest["live_start_at"] = iso(live_start_ms)
    nq_count = 0
    for r in btc:
        if r["event_time_ms"] >= live_start_ms:
            available_at_ms = r["event_time_ms"] + args.lag_s * 1000
            dataset_rows.append(
                {
                    "event_time": iso(r["event_time_ms"]),
                    "symbol": "BTCUSDT",
                    "sum_open_interest": r["sum_open_interest"],
                    "sum_open_interest_value": r["sum_open_interest_value"],
                    "bucket_end": iso(r["event_time_ms"] + 5 * 60 * 1000),
                    "available_at": iso(available_at_ms),
                    "observed_at": iso(available_at_ms),
                    "is_final": "true",
                    "fonte": "nq",
                    "poison_class": "c",
                }
            )
            nq_count += 1
    manifest["nq_rows_from_live"] = nq_count
    manifest["nq_rows_before_live_expected"] = 0
    pre_live_btc = sum(1 for r in btc if r["event_time_ms"] < live_start_ms)
    manifest["pre_live_btc_buckets"] = pre_live_btc

    # ---- write dataset.csv ----------------------------------------------------------
    fieldnames = [
        "event_time", "symbol", "sum_open_interest", "sum_open_interest_value",
        "bucket_end", "available_at", "observed_at", "is_final", "fonte", "poison_class",
    ]
    dataset_path = os.path.join(args.out_dir, "dataset.csv")
    with open(dataset_path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(dataset_rows)

    # ---- independent Python reference for as_of results -----------------------------
    # TEST A: as_of(cutoff_test_a) over BTCUSDT for the 30 poisoned event_times must
    # equal the ORIGINAL (unperturbed) value -- computed here straight from raw, no SQL.
    ref_a = {iso(btc[i]["event_time_ms"]): {
        "sum_open_interest": btc[i]["sum_open_interest"],
        "sum_open_interest_value": btc[i]["sum_open_interest_value"],
    } for i in idx_a}

    # TEST B: final_only(cutoff_test_b) must equal the ORIGINAL final value (0.5x row ignored).
    # intrabar(cutoff_test_b) must equal the PARTIAL (0.5x) value (argmin(observed_at) picks it).
    ref_b_final = {iso(btc[i]["event_time_ms"]): {
        "sum_open_interest": btc[i]["sum_open_interest"],
        "sum_open_interest_value": btc[i]["sum_open_interest_value"],
    } for i in idx_b}
    ref_b_intrabar = {iso(btc[i]["event_time_ms"]): {
        "sum_open_interest": btc[i]["sum_open_interest"] * 0.5,
        "sum_open_interest_value": btc[i]["sum_open_interest_value"] * 0.5,
    } for i in idx_b}

    reference = {"test_a": ref_a, "test_b_final_only": ref_b_final, "test_b_intrabar": ref_b_intrabar}
    with open(os.path.join(args.out_dir, "reference.json"), "w") as fh:
        json.dump(reference, fh, indent=2)
    with open(os.path.join(args.out_dir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)

    print(f"dataset rows: {len(dataset_rows)}")
    print(f"class a poisoned event_times: {len(poisoned_a_event_times)}")
    print(f"class b poisoned event_times: {len(poisoned_b_event_times)}")
    print(f"class c nq rows: {nq_count} (from {manifest['live_start_at']}), pre-live btc buckets: {pre_live_btc}")


if __name__ == "__main__":
    main()
