"""`D4.10` — the taker-ratio lookahead is a REGRESSION to guard, not a defect this task fixes.

`plano 04` item 4.1 shifts `event_time` uniformly across the eight `daily/metrics` columns,
and `domain.metrics_shift.shift_to_event_time` says explicitly that it does not special-case
`sum_taker_long_short_vol_ratio` even though that column is KNOWN to describe the bucket it
gets shifted INTO rather than the one it closes — `PRD-001-plataforma-dados.md` P2 measures
that as `r = +0,5458` against the SPEC's own historical corpus. This module reproduces the
SAME shape of measurement against the fixtures THIS repository ships (`data/MANIFEST.md`),
so a future change that "fixes" the column with a second, silent shift breaks a test instead
of quietly erasing the anti-lookahead argument that `plano 04` item 4.6 (`R-1`/`R-2`,
`available_at`) exists to make instead.

The numbers below are `[MEDIDO 2026-08-29]` BY THIS TEST, not copied from the PRD — the PRD's
`n=864/862/862` corpus is not the corpus this repository has on disk (`data/MANIFEST.md`
tracks a different window), so an honest citation is "this repo's own three days" with its own
command, not somebody else's number pasted under a new date. Comando:
`bash backend/scripts/test.sh -k test_taker_lookahead_regression`, sobre
`data/binance/metrics/btcusdt/{2026-08-21,2026-08-22,2026-08-23}.csv` +
`data/binance/klines/tf2/BTCUSDT-1m-2026-08-{21,22}.csv` (reamostrado a 5 min pelo close) +
`data/binance/klines/g3/klines/BTCUSDT-5m-2026-08-23.csv` (nativo).
"""

from __future__ import annotations

import csv
import math
from pathlib import Path

import pytest

from src.modules.sentimento.infra.metrics_csv_reader import read_raw_metrics_rows
from tests.helpers.data_fixtures import require_fixture

_GRID_MS = 300_000

_METRICS_FIXTURES: tuple[tuple[str, str], ...] = (
    ("binance/metrics/btcusdt/2026-08-21.csv", "9d642820a446baf24cd53b88bb48fffc"),
    ("binance/metrics/btcusdt/2026-08-22.csv", "16479131da4ef898f62036e6737a50a5"),
    ("binance/metrics/btcusdt/2026-08-23.csv", "fc8c0fba983194cf356a7d172b3bd39e"),
)
_KLINES_1M_FIXTURES: tuple[tuple[str, str], ...] = (
    ("binance/klines/tf2/BTCUSDT-1m-2026-08-21.csv", "653eafda89a0c7b77ca6cc8e7f48cc97"),
    ("binance/klines/tf2/BTCUSDT-1m-2026-08-22.csv", "fe6397077bbe24305b63a31cde2e90f2"),
)
_KLINES_5M_NATIVE = (
    "binance/klines/g3/klines/BTCUSDT-5m-2026-08-23.csv",
    "2666ab85757ba23bcc539fc37f0ea192",
)


def _resample_1m_to_5m_close(path: Path) -> dict[int, float]:
    """Return `{grid bucket: last close in that bucket}` from a 1-minute kline file.

    The grid bucket is `open_time // 300_000`; `close[bucket]` approximates the price at the
    END of that 5-minute window (start of the next one), which is what the log-return pairing
    below needs.
    """
    by_bucket: dict[int, list[tuple[int, float]]] = {}
    with path.open(newline="", encoding="ascii") as handle:
        for record in csv.DictReader(handle):
            open_time = int(record["open_time"])
            bucket = open_time // _GRID_MS
            by_bucket.setdefault(bucket, []).append((open_time, float(record["close"])))
    return {
        bucket: max(candles, key=lambda candle: candle[0])[1]
        for bucket, candles in by_bucket.items()
    }


def _native_5m_close(path: Path) -> dict[int, float]:
    """Return `{grid bucket: close}` from a file already sampled at the 5-minute grid."""
    closes: dict[int, float] = {}
    with path.open(newline="", encoding="ascii") as handle:
        for record in csv.DictReader(handle):
            bucket = int(record["open_time"]) // _GRID_MS
            closes[bucket] = float(record["close"])
    return closes


def _log_return(closes: dict[int, float], bucket_from: int, bucket_to: int) -> float | None:
    """`ln(close[to] / close[from])`, or `None` when either side is outside the loaded range."""
    if bucket_from not in closes or bucket_to not in closes:
        return None
    price_from, price_to = closes[bucket_from], closes[bucket_to]
    if price_from <= 0 or price_to <= 0:
        return None
    return math.log(price_to / price_from)


def _pearson(pairs: list[tuple[float, float]]) -> tuple[float, int]:
    """Pearson `r` and `n` over a list of `(x, y)` pairs — no external dependency needed."""
    n = len(pairs)
    xs = [pair[0] for pair in pairs]
    ys = [pair[1] for pair in pairs]
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in pairs)
    denominator = math.sqrt(sum((x - mean_x) ** 2 for x in xs) * sum((y - mean_y) ** 2 for y in ys))
    return numerator / denominator, n


def _load_closes() -> dict[int, float]:
    closes: dict[int, float] = {}
    for relative_path, expected_md5 in _KLINES_1M_FIXTURES:
        fixture = require_fixture(relative_path, expected_md5=expected_md5)
        closes.update(_resample_1m_to_5m_close(fixture))
    native_path, native_md5 = _KLINES_5M_NATIVE
    closes.update(_native_5m_close(require_fixture(native_path, expected_md5=native_md5)))
    return closes


def _taker_ratio_by_bucket() -> dict[int, float]:
    ratios: dict[int, float] = {}
    for relative_path, expected_md5 in _METRICS_FIXTURES:
        raw_rows = read_raw_metrics_rows(require_fixture(relative_path, expected_md5=expected_md5))
        for row in raw_rows:
            ratio = float(row.sum_taker_long_short_vol_ratio)
            if ratio > 0:
                # `create_time_ms` is the bucket START, matching `open_time // grid` on the
                # kline side — no `+300000` here, this measurement is about the RAW label.
                ratios[row.create_time_ms // _GRID_MS] = ratio
    return ratios


def test_d4_10_taker_ratio_lookahead_signature_regression() -> None:
    """`[MEDIDO 2026-08-29]`: the canonical lookahead signature, on this repo's own fixtures.

    `r_future` (`ln(ratio)` against the return of `[T, T+5min)`) is an order of magnitude
    above `r_past` and `r_future_plus_1` — the same shape `PRD-001` P2 names, even though the
    exact figures differ from that corpus (different days, `n=863/862/863` here against
    `864/862/862` there). If a future change to `shift_to_event_time` special-cased this
    column and corrected the label, `r_future` would collapse toward zero and this assertion
    would catch it.
    """
    closes = _load_closes()
    ratios = _taker_ratio_by_bucket()

    future_pairs: list[tuple[float, float]] = []
    past_pairs: list[tuple[float, float]] = []
    future_plus_one_pairs: list[tuple[float, float]] = []
    for bucket, ratio in ratios.items():
        ln_ratio = math.log(ratio)
        future = _log_return(closes, bucket - 1, bucket)  # [T, T+5min)
        past = _log_return(closes, bucket - 2, bucket - 1)  # [T-5min, T)
        future_plus_one = _log_return(closes, bucket, bucket + 1)  # [T+5min, T+10min)
        if future is not None:
            future_pairs.append((ln_ratio, future))
        if past is not None:
            past_pairs.append((ln_ratio, past))
        if future_plus_one is not None:
            future_plus_one_pairs.append((ln_ratio, future_plus_one))

    r_future, n_future = _pearson(future_pairs)
    r_past, n_past = _pearson(past_pairs)
    r_future_plus_one, n_future_plus_one = _pearson(future_plus_one_pairs)

    assert n_future == 863
    assert n_past == 862
    assert n_future_plus_one == 863

    assert r_future == pytest.approx(0.5169, abs=0.0005)
    assert r_past == pytest.approx(0.0646, abs=0.0005)
    assert r_future_plus_one == pytest.approx(-0.0209, abs=0.0005)

    # The signature: contemporaneous-with-the-label correlation dwarfs both neighbours.
    assert r_future > 5 * abs(r_past)
    assert r_future > 5 * abs(r_future_plus_one)
