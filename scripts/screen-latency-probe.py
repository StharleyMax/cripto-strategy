#!/usr/bin/env python3
"""Screen-load probe for `T-06.3` (DoD 3 of `06_velocidade_do_ciclo.md`): the 10 series in parallel.

Two layers, both measured as wall clock per run:

- `api`  — the 10 `GET /api/v1/series-history` the BTCUSDT page fires, all at once, the way
  `frontend/src/app/symbol/[symbol]/page.tsx` does (`Promise.all`). The wall time of one run is
  the time until the LAST of the 10 responses is fully read.
- `page` — one `GET /symbol/BTCUSDT?interval=<tf>` on the Next server (SSR, which itself fans out
  to the same 10 calls).

The 10 URLs are FIXED (series ids and windows captured from `docker logs deploy-api-1` after a
real page load on 2026-10-02, `1m x 5760` and `1h x 168`, the `T-05.1` windows) so the before and
the after of a change read the SAME window. Each run also records the 1-minute load average,
because the machine's load moved these numbers 2x within one hour (`T-06.3-desenho.md`, top).

Usage (stdlib only, no dependency):

    python3 scripts/screen-latency-probe.py --layer api --interval 1m --runs 7
    python3 scripts/screen-latency-probe.py --layer page --interval 1h --runs 5
"""

from __future__ import annotations

import argparse
import os
import statistics
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# The 10 series the page requests for BTCUSDT, in `page.tsx`'s `Promise.all` order is irrelevant
# here: they are fired together. Captured from the API access log on 2026-10-02.
SERIES_KEY_IDS: tuple[str, ...] = (
    "b99614b0287aecbea7547375a346ea96078827c3b535b12a5313a2c4030957a6",
    "18125f63e24133cbe564dd4bdcb13aedf2c9014661dfc95b57959f2c484b2130",
    "b8dc419eb18d145d11b2f89b03da61943601af8c46a710dd7b8379bc30065fe1",
    "6486750c2f9cced5b50231fc32a64fd40c47d3ff04b3e8610f986cd0f2a03b6f",
    "ef3033e6ad5a487330c9e669dd1ed3105a7a40ba274b78302b4d3eb624244e42",
    "a09ef7851e850768367c0230a52a3df9844dbebe392b1a8ca7920cd42f2c7b36",
    "23e4332307dc408a49e1480ad73240a7bd37ac5b395119c620b662fdd6f539d5",
    "bc0b8a78e16b36aaedf79af6716405f0e859ee0712c0e44aea1bb6a76a44c551",
    "279d3172f5f2572d71c72f23cb7249edff91b405c2b1e7bc88c3b664963d8e3e",
    "94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9",
)

# (window_start_ms, window_end_ms, knowledge_time_ms), exactly as the page sent them.
WINDOWS: dict[str, tuple[int, int, int]] = {
    "1m": (1_790_636_100_000, 1_790_981_640_000, 1_790_981_940_000),
    "1h": (1_790_373_600_000, 1_790_978_340_000, 1_790_978_640_000),
}


def _series_urls(base_url: str, interval: str) -> list[str]:
    start, end, knowledge = WINDOWS[interval]
    return [
        f"{base_url}/api/v1/series-history?series_key_id={key}&symbol=BTCUSDT"
        f"&interval={interval}&window_start_ms={start}&window_end_ms={end}"
        f"&knowledge_time_ms={knowledge}&bar_policy=final_only"
        for key in SERIES_KEY_IDS
    ]


def _fetch(url: str) -> int:
    """Read the whole body (the wall time must include transfer), return its size in bytes."""
    with urllib.request.urlopen(url, timeout=120) as response:
        return len(response.read())


def _one_api_run(urls: list[str]) -> tuple[float, int]:
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=len(urls)) as pool:
        sizes = list(pool.map(_fetch, urls))
    return time.perf_counter() - started, sum(sizes)


def _one_page_run(url: str) -> tuple[float, int]:
    started = time.perf_counter()
    size = _fetch(url)
    return time.perf_counter() - started, size


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--layer", choices=("api", "page"), default="api")
    parser.add_argument("--interval", choices=tuple(WINDOWS), default="1m")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--api-base", default="http://127.0.0.1:8000")
    parser.add_argument("--page-base", default="http://127.0.0.1:3000")
    args = parser.parse_args()

    walls: list[float] = []
    for run in range(1, args.runs + 1):
        load1 = os.getloadavg()[0]
        if args.layer == "api":
            wall, size = _one_api_run(_series_urls(args.api_base, args.interval))
        else:
            wall, size = _one_page_run(
                f"{args.page_base}/symbol/BTCUSDT?interval={args.interval}"
            )
        walls.append(wall)
        print(
            f"run={run} layer={args.layer} tf={args.interval} wall_s={wall:.3f} "
            f"bytes={size} load1={load1:.2f}"
        )
    print(
        f"SUMMARY layer={args.layer} tf={args.interval} n={len(walls)} "
        f"median_s={statistics.median(walls):.3f} min_s={min(walls):.3f} max_s={max(walls):.3f}"
    )


if __name__ == "__main__":
    main()
