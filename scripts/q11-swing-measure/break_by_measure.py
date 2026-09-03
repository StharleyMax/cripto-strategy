"""Q11 v1 validation: BOS/CHoCH/OB state machine (port of scripts/pilot-swing-marker/build.mjs
deriveStructure) with break_by in {wick, close}. Pure stdlib. Every number prints its universe."""
import csv, glob, json, sys
from collections import defaultdict

ROOT = "/home/stharley/Documentos/projects/cripto-strategy"
FIX = f"{ROOT}/docs/context/plataforma-dados/fixtures/swing-review-BTCUSDT-1b96c671-2026-09-03.json"
STRUCT = dict(atr_period=14, expiry_bars=200, ob_lookback_bars=30, initial_state="undefined")


def load_klines(paths):
    rows = []
    for p in sorted(paths):
        with open(p, newline="") as fh:
            for r in csv.DictReader(fh):
                rows.append((int(r["open_time"]), float(r["open"]), float(r["high"]), float(r["low"]),
                             float(r["close"]), float(r["volume"]), int(r["close_time"])))
    rows.sort()
    return rows


def resample(rows, minutes):
    ms = minutes * 60_000
    buckets = defaultdict(list)
    for r in rows:
        buckets[r[0] - r[0] % ms].append(r)
    return [(k, b[0][1], max(x[2] for x in b), min(x[3] for x in b), b[-1][4], sum(x[5] for x in b), b[-1][6])
            for k, b in sorted(buckets.items())]


def fractal(bars, n, strict=True):
    out = []
    for i in range(n, len(bars) - n):
        mh = max(bars[j][2] for j in range(i - n, i + n + 1) if j != i)
        ml = min(bars[j][3] for j in range(i - n, i + n + 1) if j != i)
        h, lo = bars[i][2], bars[i][3]
        if h > mh or (not strict and h == mh):
            out.append(dict(type="high", i=i, price=h, confirm_i=i + n))
        if lo < ml or (not strict and lo == ml):
            out.append(dict(type="low", i=i, price=lo, confirm_i=i + n))
    return out


def atr_series(bars, period):
    tr = [bars[0][2] - bars[0][3]] + [max(b[2] - b[3], abs(b[2] - bars[i - 1][4]), abs(b[3] - bars[i - 1][4]))
                                      for i, b in enumerate(bars) if i > 0]
    out, s = [None] * len(bars), 0.0
    for i, v in enumerate(tr):
        s += v
        if i >= period:
            s -= tr[i - period]
        if i >= period - 1:
            out[i] = s / period
    return out


def derive(bars, swings, k, break_by, inclusive=False):
    """Returns events, obs, sweeps. break_by='wick': high/low crosses ref (pilot). 'close': close crosses ref.
    sweep (close mode only): wick crosses ref but close does not; ref is NOT consumed.
    inclusive=True mutates the break comparison from strict (>, <) to (>=, <=) — ADR-017/D3.2 mutation check."""
    atr = atr_series(bars, STRUCT["atr_period"])
    by_confirm = sorted(swings, key=lambda s: s["confirm_i"])
    events, obs, sweeps = [], [], []
    trend, refH, refL, p = STRUCT["initial_state"], None, None, 0

    def push_ob(ev, side):
        t = ev["t"]; j = -1
        for q in range(t - 1, max(0, t - STRUCT["ob_lookback_bars"]) - 1, -1):
            bearish, bullish = bars[q][4] < bars[q][1], bars[q][4] > bars[q][1]
            if (side == "bull" and bearish) or (side == "bear" and bullish):
                j = q; break
        if j < 0 or atr[t] is None:
            return
        ratio = abs(bars[t][4] - bars[j][1]) / atr[t]
        if ratio < k:
            return
        lo, hi, mit = bars[j][3], bars[j][2], None
        for q in range(t + 1, min(len(bars), t + 1 + STRUCT["expiry_bars"])):
            if (side == "bull" and bars[q][3] <= hi) or (side == "bear" and bars[q][2] >= lo):
                mit = q; break
        obs.append(dict(side=side, i=j, open_time=bars[j][0], low=lo, high=hi, event_kind=ev["kind"], event_t=t,
                        impulse_atr=ratio, mitigated_i=mit))

    for t in range(len(bars)):
        while p < len(by_confirm) and by_confirm[p]["confirm_i"] <= t:
            s = by_confirm[p]
            if s["type"] == "high": refH = s
            else: refL = s
            p += 1
        up_px = bars[t][2] if break_by == "wick" else bars[t][4]
        dn_px = bars[t][3] if break_by == "wick" else bars[t][4]
        if refH is not None:
            if up_px > refH["price"] or (inclusive and up_px == refH["price"]):
                kind = "CHoCH" if trend == "down" else "BMS"; trend = "up"
                events.append(dict(kind=kind, dir="up", t=t, open_time=bars[t][0], ref_i=refH["i"], price=refH["price"]))
                push_ob(events[-1], "bull"); refH = None
            elif break_by == "close" and bars[t][2] > refH["price"]:
                sweeps.append(dict(dir="up", t=t, ref_i=refH["i"], price=refH["price"]))
        if refL is not None:
            if dn_px < refL["price"] or (inclusive and dn_px == refL["price"]):
                kind = "CHoCH" if trend == "up" else "BMS"; trend = "down"
                events.append(dict(kind=kind, dir="down", t=t, open_time=bars[t][0], ref_i=refL["i"], price=refL["price"]))
                push_ob(events[-1], "bear"); refL = None
            elif break_by == "close" and bars[t][3] < refL["price"]:
                sweeps.append(dict(dir="down", t=t, ref_i=refL["i"], price=refL["price"]))
    return events, obs, sweeps


def summary(events, obs):
    return dict(events=len(events), bms=sum(e["kind"] == "BMS" for e in events),
                choch=sum(e["kind"] == "CHoCH" for e in events), ob=len(obs))


if __name__ == "__main__":
    one_m = load_klines(glob.glob(f"{ROOT}/data/binance/klines/tf2/BTCUSDT-1m-2026-08-*.csv"))
    print(f"bars_1m={len(one_m)} from={one_m[0][0]} to_close={one_m[-1][6]}")
    # grid invariant: resampled 15m == native 15m csv?
    nat15 = load_klines(glob.glob(f"{ROOT}/data/binance/klines/tf2/BTCUSDT-15m-2026-08-*.csv"))
    rs15 = resample(one_m, 15)
    diff = sum(1 for a, b in zip(nat15, rs15) if (a[0], a[1], a[2], a[3], a[4]) != (b[0], b[1], b[2], b[3], b[4]))
    print(f"grid_check: native_15m={len(nat15)} resampled_15m={len(rs15)} ohlc_mismatch={diff}")

    fx = json.load(open(FIX))
    fx_ob = {}
    for s in fx["sessions"]:
        if s.get("ob_verdicts"):
            fx_ob[s["detector_key"].split("|")[0]] = {int(v["candidate_id"].split("@")[1].split("|")[0]) * 1000 for v in s["ob_verdicts"]}
    fx_sum = {s["detector_key"].split("|")[0]: s.get("structure_summary") for s in fx["sessions"]}

    tfs = {"15m": rs15, "1h": resample(one_m, 60)}
    configs = [("15m", 5, 1.5), ("15m", 5, 1.0), ("1h", 10, 1.0), ("1h", 10, 1.5), ("15m", 10, 1.5)]
    print("\n== structure counts by break_by (BTCUSDT tf2 1m -> resampled, 2026-08-16..23, 8 days) ==")
    print(f"{'tf':>4} {'N':>3} {'k':>4} {'by':>6} {'swings':>6} {'events':>6} {'BMS':>4} {'CHoCH':>5} {'OB':>3} {'sweeps':>6} {'pilot_json(ev/bms/choch/ob)':>28}")
    detail = {}
    for tf, n, k in configs:
        bars = tfs[tf]; sw = fractal(bars, n)
        key = f"fractal:N{n}:{tf}:wick:strict:klines_last"
        for by in ("wick", "close"):
            ev, ob, sweeps = derive(bars, sw, k, by)
            s = summary(ev, ob); detail[(tf, n, k, by)] = (ev, ob, sweeps)
            pj = fx_sum.get(key)
            pj_s = f"{pj['events']}/{pj['bms']}/{pj['choch']}/{pj['ob_candidates']}" if (pj and by == "wick" and fx["sessions"][[x['detector_key'].split('|')[0] for x in fx['sessions']].index(key)]["structure_definition"]["k_atr"] == k) else "-"
            print(f"{tf:>4} {n:>3} {k:>4} {by:>6} {len(sw):>6} {s['events']:>6} {s['bms']:>4} {s['choch']:>5} {s['ob']:>3} {len(sweeps):>6} {pj_s:>28}")
        if key in fx_ob and k == 1.5:
            mine = {o["open_time"] for o in detail[(tf, n, k, "wick")][1]}
            print(f"   OB parity vs owner JSON ({key}, k={k}): json_judged={len(fx_ob[key])} mine={len(mine)} json_subset_of_mine={fx_ob[key] <= mine} mine_minus_json={sorted(mine - fx_ob[key])}")

    print("\n== wick vs close: same events? (match = same ref swing AND same direction) ==")
    for tf, n, k in [("15m", 5, 1.5), ("1h", 10, 1.0), ("15m", 10, 1.5)]:
        evw, obw, _ = detail[(tf, n, k, "wick")]; evc, obc, swp = detail[(tf, n, k, "close")]
        kw = {(e["ref_i"], e["dir"]): e for e in evw}; kc = {(e["ref_i"], e["dir"]): e for e in evc}
        common = set(kw) & set(kc)
        delays = [kc[x]["t"] - kw[x]["t"] for x in common]
        kind_flip = sum(1 for x in common if kw[x]["kind"] != kc[x]["kind"])
        only_w = set(kw) - set(kc); only_c = set(kc) - set(kw)
        print(f"{tf}/N={n}: wick_events={len(evw)} close_events={len(evc)} common_ref={len(common)} only_wick={len(only_w)} only_close={len(only_c)} "
              f"kind_flips_on_common={kind_flip} delay_bars(close-wick) min/med/max={min(delays) if delays else '-'}/{sorted(delays)[len(delays)//2] if delays else '-'}/{max(delays) if delays else '-'} "
              f"sweeps_close_mode={len(swp)} sweeps_later_closed={sum(1 for s in swp if (s['ref_i'], s['dir']) in kc)}")
        ow = {o["open_time"] for o in obw}; oc = {o["open_time"] for o in obc}
        print(f"   OB(k={k}): wick={len(ow)} close={len(oc)} same_candle={len(ow & oc)} jaccard={len(ow & oc)/len(ow | oc) if ow | oc else float('nan'):.2f}")

    print("\n== per-day klines size (cost basis for history depth) ==")
    import os
    for tf in ("1m", "15m"):
        fs = sorted(glob.glob(f"{ROOT}/data/binance/klines/tf2/BTCUSDT-{tf}-2026-08-*.csv"))
        sizes = [os.path.getsize(f) for f in fs]
        print(f"{tf}: files={len(fs)} csv_bytes/day mean={sum(sizes)/len(sizes):,.0f} min={min(sizes):,} max={max(sizes):,}")
    zs = sorted(glob.glob(f"{ROOT}/data/binance/klines/tf2/1m-2026-08-*.zip"))
    print(f"1m zip: files={len(zs)} zip_bytes/day mean={sum(os.path.getsize(f) for f in zs)/len(zs):,.0f}")
