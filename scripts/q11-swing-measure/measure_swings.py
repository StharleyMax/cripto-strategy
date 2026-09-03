"""Measurements for Q11/Q20 handoff: fractal swing counts, klines-vs-mark divergence,
and "trapped money" candidate episodes. Pure stdlib; every number printed carries its universe."""
import csv
import glob
import os
import sys
from collections import defaultdict

ROOT = "/home/stharley/Documentos/projects/cripto-strategy/data/binance"


def load_klines(paths):
    rows = []
    for p in sorted(paths):
        with open(p, newline="") as fh:
            for r in csv.DictReader(fh):
                rows.append(
                    (
                        int(r["open_time"]),
                        float(r["open"]),
                        float(r["high"]),
                        float(r["low"]),
                        float(r["close"]),
                        float(r["volume"]),
                        int(r["close_time"]),
                    )
                )
    rows.sort()
    return rows


def resample(rows, minutes):
    ms = minutes * 60_000
    buckets = defaultdict(list)
    for r in rows:
        buckets[r[0] - r[0] % ms].append(r)
    out = []
    for k in sorted(buckets):
        b = buckets[k]
        out.append((k, b[0][1], max(x[2] for x in b), min(x[3] for x in b), b[-1][4], sum(x[5] for x in b), b[-1][6]))
    return out


def fractal_swings(rows, n, strict=True):
    """Pivot high/low with n bars each side. Returns (highs_idx, lows_idx, tie_highs, tie_lows).
    strict=True: center must be > every neighbour (ties are NOT swings).
    strict=False: center must be >= every neighbour (ties ARE swings)."""
    highs, lows, tie_h, tie_l = [], [], 0, 0
    for i in range(n, len(rows) - n):
        h = rows[i][2]
        lo = rows[i][3]
        win = rows[i - n : i + n + 1]
        nb_h = [w[2] for j, w in enumerate(win) if j != n]
        nb_l = [w[3] for j, w in enumerate(win) if j != n]
        mh = max(nb_h)
        ml = min(nb_l)
        if h > mh:
            highs.append(i)
        elif h == mh:
            tie_h += 1
            if not strict:
                highs.append(i)
        if lo < ml:
            lows.append(i)
        elif lo == ml:
            tie_l += 1
            if not strict:
                lows.append(i)
    return highs, lows, tie_h, tie_l


def section(title):
    print("\n" + "=" * 8 + " " + title + " " + "=" * 8)


# ---------------------------------------------------------------- 1. swing counts per TF / N
section("1. fractal swing counts, BTCUSDT tf2 1m 2026-08-16..23")
one_m = load_klines(glob.glob(f"{ROOT}/klines/tf2/BTCUSDT-1m-2026-08-*.csv"))
print(f"bars_1m={len(one_m)} first_open={one_m[0][0]} last_open={one_m[-1][0]}")
tfs = {"1m": one_m, "5m": resample(one_m, 5), "15m": resample(one_m, 15), "1h": resample(one_m, 60), "4h": resample(one_m, 240)}
print("tf,bars,N,swing_highs,swing_lows,tie_highs,tie_lows,confirm_delay_minutes")
for tf, rows in tfs.items():
    tf_min = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240}[tf]
    for n in (2, 5, 10, 20):
        hs, ls_, th, tl = fractal_swings(rows, n)
        print(f"{tf},{len(rows)},{n},{len(hs)},{len(ls_)},{th},{tl},{n * tf_min}")

# ---------------------------------------------------------------- 1b. how much of 15m structure is recoverable from 1m
section("1b. does 15m N=5 swing sit inside a 1m N=k swing bucket? (nesting)")
r15 = tfs["15m"]
h15, l15, _, _ = fractal_swings(r15, 5)
set15 = {r15[i][0] for i in h15} | {r15[i][0] for i in l15}
for k in (5, 10, 20, 40):
    h1, l1, _, _ = fractal_swings(one_m, k)
    set1 = {one_m[i][0] - one_m[i][0] % (15 * 60_000) for i in h1 + l1}
    inter = len(set15 & set1)
    print(f"15m_N5_swings={len(set15)} 1m_N{k}_swings={len(h1)+len(l1)} 15m_swings_with_1m_swing_in_same_bucket={inter} ({100*inter/len(set15):.1f}%)")

# ---------------------------------------------------------------- 2. klines vs markPrice (g3)
section("2. swing timestamp agreement klines_last vs mark_price, 5m")
pairs = [
    (f"{ROOT}/klines/g3/klines/BTCUSDT-5m-2026-08-23.csv", f"{ROOT}/klines/g3/markPriceKlines/BTCUSDT-5m-2026-08-23.csv", "2026-08-23"),
]
mp0821 = glob.glob(f"{ROOT}/klines/g3/mp_btc_0821/*.csv")
if mp0821:
    # last-price 5m for 08-21 is derived from tf2 1m (same venue, same day)
    last0821 = resample(load_klines([f"{ROOT}/klines/tf2/BTCUSDT-1m-2026-08-21.csv"]), 5)
    pairs.append((last0821, mp0821[0], "2026-08-21 (last=1m tf2 resampled)"))
print("day,N,last_highs,mark_highs,same_ts_highs,last_lows,mark_lows,same_ts_lows,jaccard_all")
for a, b, day in pairs:
    la = a if isinstance(a, list) else load_klines([a])
    mk = load_klines([b])
    assert len(la) == len(mk) and la[0][0] == mk[0][0], (len(la), len(mk))
    for n in (2, 3, 5, 10):
        ha, lo_a, _, _ = fractal_swings(la, n)
        hb, lo_b, _, _ = fractal_swings(mk, n)
        sa_h, sb_h = {la[i][0] for i in ha}, {mk[i][0] for i in hb}
        sa_l, sb_l = {la[i][0] for i in lo_a}, {mk[i][0] for i in lo_b}
        all_a, all_b = sa_h | sa_l, sb_h | sb_l
        jac = len(all_a & all_b) / len(all_a | all_b) if (all_a | all_b) else float("nan")
        print(f"{day},{n},{len(sa_h)},{len(sb_h)},{len(sa_h & sb_h)},{len(sa_l)},{len(sb_l)},{len(sa_l & sb_l)},{jac:.3f}")

# ---------------------------------------------------------------- 3. "trapped money" candidates: OI up in a tight range
section("3. trapped-money candidates: dOI_4h >= +1% AND price range_4h <= 1%, 5m grid, 2026-08-16..23")
import datetime as dt

oi = {}
for p in sorted(glob.glob(f"{ROOT}/metrics/btcusdt/2026-08-*.csv")):
    with open(p, newline="") as fh:
        for r in csv.DictReader(fh):
            t = dt.datetime.strptime(r["create_time"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)
            oi[int(t.timestamp() * 1000)] = float(r["sum_open_interest"])
five = tfs["5m"]
oi_ts = sorted(oi)
print(f"oi_points_in_window={sum(1 for t in oi_ts if five[0][0] <= t <= five[-1][0])} expected_5m_buckets={len(five)}")


def oi_asof(t_close):
    # last OI snapshot with create_time <= bar close_time (no lookahead)
    import bisect

    j = bisect.bisect_right(oi_ts, t_close) - 1
    return oi[oi_ts[j]] if j >= 0 else None


W = 48  # 4h in 5m buckets
cands = []
for i in range(W, len(five)):
    o_now = oi_asof(five[i][6])
    o_then = oi_asof(five[i - W][6])
    if not o_now or not o_then:
        continue
    d_oi = o_now / o_then - 1
    win = five[i - W + 1 : i + 1]
    rng = (max(w[2] for w in win) - min(w[3] for w in win)) / five[i][4]
    if d_oi >= 0.01 and rng <= 0.01:
        cands.append((i, d_oi, rng, max(w[2] for w in win), min(w[3] for w in win)))
# collapse consecutive buckets into episodes
episodes = []
for c in cands:
    if episodes and c[0] - episodes[-1][-1][0] == 1:
        episodes[-1].append(c)
    else:
        episodes.append([c])
print(f"candidate_buckets={len(cands)} episodes={len(episodes)}")
print("episode,start_utc,end_utc,len_buckets,max_dOI_pct,range_hi,range_lo,exit_dir,oi_change_4h_after_exit_pct,bars_to_exit")
for k, ep in enumerate(episodes):
    i_end = ep[-1][0]
    hi = max(e[3] for e in ep)
    lo = min(e[4] for e in ep)
    exit_dir, j_exit = "none", None
    for j in range(i_end + 1, min(i_end + 1 + W, len(five))):
        if five[j][2] > hi:
            exit_dir, j_exit = "up", j
            break
        if five[j][3] < lo:
            exit_dir, j_exit = "down", j
            break
    oi_after = "na"
    if j_exit is not None and j_exit + W < len(five):
        a0, a1 = oi_asof(five[j_exit][6]), oi_asof(five[j_exit + W][6])
        if a0 and a1:
            oi_after = f"{100*(a1/a0-1):+.2f}"
    s = dt.datetime.fromtimestamp(five[ep[0][0]][0] / 1000, dt.timezone.utc).strftime("%m-%d %H:%M")
    e = dt.datetime.fromtimestamp(five[i_end][0] / 1000, dt.timezone.utc).strftime("%m-%d %H:%M")
    print(f"{k},{s},{e},{len(ep)},{100*max(x[1] for x in ep):.2f},{hi:.1f},{lo:.1f},{exit_dir},{oi_after},{(j_exit - i_end) if j_exit else 'na'}")

# ---------------------------------------------------------------- 3b. 30-day distribution of 4h OI change (threshold must be a percentile)
section("3b. dOI_4h distribution, BTCUSDT metrics 5m, 30 days (2026-07-25..08-23)")
full = []
for p in sorted(glob.glob(f"{ROOT}/metrics/btcusdt/*.csv")):
    with open(p, newline="") as fh:
        for r in csv.DictReader(fh):
            full.append((r["create_time"], float(r["sum_open_interest"])))
print(f"oi_points_30d={len(full)} expected={30*288} first={full[0][0]} last={full[-1][0]}")
d = sorted(full[i][1] / full[i - W][1] - 1 for i in range(W, len(full)))
pct = lambda q: d[int(q * (len(d) - 1))]
print(f"dOI_4h n={len(d)} p50={100*pct(.5):.3f}% p90={100*pct(.9):.3f}% p95={100*pct(.95):.3f}% p99={100*pct(.99):.3f}% max={100*d[-1]:.3f}% min={100*d[0]:.3f}%")
print(f"share dOI_4h>=+1%: {100*sum(1 for x in d if x >= 0.01)/len(d):.2f}%")
