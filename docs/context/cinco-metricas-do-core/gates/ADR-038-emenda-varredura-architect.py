"""READ-ONLY: how the slot count depends on the stamp offset, per Nature. No writes."""
import subprocess, sys, time  # noqa: E401
from dataclasses import replace
from decimal import Decimal
import pathlib
# Resolve `backend/` from THIS file, not from an absolute path of whoever ran it first:
# `ADR-038-remedicao-e1.py` hardcoded one, and it only works in the tree it was written in.
import pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4] / "backend"))
from src.modules.sentimento.domain.as_of_accessor import (
    as_of, Observation, SeriesReadPolicy, BarPolicy, ReadPurpose, CARRY_FORWARD_BY_NATURE)
from src.modules.sentimento.domain.provenance import AvailabilitySource
from src.modules.sentimento.use_cases.collector_series_mapping import (
    build_open_interest_to_rows, build_long_short_to_rows)
from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_key
from src.modules.sentimento.domain.long_short_catalog import count_long_short_ratio_key

OI = "94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9"
RAT = "279d3172f5f2572d71c72f23cb7249edff91b405c2b1e7bc88c3b664963d8e3e"


def q(sql):
    out = subprocess.run(["docker", "exec", "deploy-postgres-1", "psql", "-U", "cripto_strategy",
                          "-d", "cripto_strategy", "-At", "-F", "|", "-c", sql],
                         capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(out.stderr)
    return [l.split("|") for l in out.stdout.strip().splitlines() if l]


def raw(skid):
    return q(f"select bucket_end, value_raw, observed_at from md.series "
             f"where series_key_id='{skid}' and symbol='BTCUSDT' order by bucket_end")


def build(kind):
    rows = raw(OI if kind == "OI" else RAT)
    recv = max(int(o) for _, _, o in rows)
    if kind == "OI":
        pts = [{"symbol": "BTCUSDT", "sumOpenInterest": v, "sumOpenInterestValue": "0",
                "CMCCirculatingSupply": "0", "timestamp": int(b)} for b, v, _ in rows]
        built = build_open_interest_to_rows()(recv, "BTCUSDT", pts)
    else:
        pts = [{"symbol": "BTCUSDT", "longAccount": "0.5", "longShortRatio": v,
                "shortAccount": "0.5", "timestamp": int(b)} for b, v, _ in rows]
        built = build_long_short_to_rows()(recv, "BTCUSDT", pts)
    return built


def obs_with_offset(built, offset):
    return [Observation(row=replace(r, available_at=r.bucket_end + offset),
                        value=Decimal(r.value_raw)) for r in built]


def hits(key, obs, universe, kt, grid=300_000, stale=600_000, n=61, slot_ms=60_000):
    pol = SeriesReadPolicy(asof_max_staleness_ms=stale, render_max_staleness_ms=stale,
                           bucket_interval_ms=grid, first_capture_at=None)
    last = max(r.bucket_end for r in universe)
    got = 0
    for i in range(n):
        g = last - (n - 1 - i) * slot_ms
        t = g + slot_ms - 1
        r = as_of(series=key, symbol="BTCUSDT", t=t, observations=obs, policy=pol,
                  bar_policy=BarPolicy.FINAL_ONLY, purpose=ReadPurpose.RENDERING,
                  knowledge_time=kt)
        if getattr(r, "value", None) is not None:
            got += 1
    return got


NOW = int(time.time() * 1000)
oi_built, ra_built = build("OI"), build("RATIO")
KOI = binance_open_interest_key(instrument_id="BTCUSDT")
KRA = count_long_short_ratio_key("BTCUSDT")
print(f"carry_forward: STOCK={CARRY_FORWARD_BY_NATURE[KOI.nature]} RATIO={CARRY_FORWARD_BY_NATURE[KRA.nature]}")
print(f"n rows: OI={len(oi_built)} RATIO={len(ra_built)}")
print()
print("offset_ms |  OI (STOCK) 61 slots 1min kt=agora | RATIO 61 slots 1min kt=agora")
for off in (0, 34_532, 59_999, 60_000, 76_685, 119_999, 120_000, 179_999, 180_000, 299_999, 300_000):
    o = hits(KOI, obs_with_offset(oi_built, off), oi_built, NOW)
    r = hits(KRA, obs_with_offset(ra_built, off), ra_built, NOW)
    print(f"{off:>9} |  {o:>2}/61 | {r:>2}/61")
print()
print("Mesma varredura na grade de 5 min que o painel desenha:")
for off in (59_999, 120_000, 299_999, 300_000):
    o = hits(KOI, obs_with_offset(oi_built, off), oi_built, NOW, slot_ms=300_000)
    r = hits(KRA, obs_with_offset(ra_built, off), ra_built, NOW, slot_ms=300_000)
    print(f"{off:>9} |  OI {o:>2}/61 | RATIO {r:>2}/61")
