"""Mutation checks for the Q11 v1 fixture (ADR-017/D3.2): break comparison strict -> inclusive,
and fractal tie policy strict -> inclusive. Same grid as break_by_measure.py."""
import glob, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import break_by_measure as m

one_m = m.load_klines(glob.glob(f"{m.ROOT}/data/binance/klines/tf2/BTCUSDT-1m-2026-08-*.csv"))
tfs = {"15m": m.resample(one_m, 15), "1h": m.resample(one_m, 60)}
for tf, n, k in [("15m", 5, 1.5), ("1h", 10, 1.0), ("15m", 10, 1.5)]:
    bars = tfs[tf]; sw = m.fractal(bars, n)
    for by in ("wick", "close"):
        a = {(e["t"], e["dir"]) for e in m.derive(bars, sw, k, by)[0]}
        b = {(e["t"], e["dir"]) for e in m.derive(bars, sw, k, by, inclusive=True)[0]}
        print(f"{tf}/N={n}/{by}: events_strict={len(a)} events_inclusive={len(b)} symmetric_diff={len(a ^ b)}")
for tf, n in [("15m", 5), ("1h", 10)]:
    s = len(m.fractal(tfs[tf], n, True)); i = len(m.fractal(tfs[tf], n, False))
    print(f"{tf}/N={n}: swings_strict={s} swings_inclusive={i} delta={i - s}")
