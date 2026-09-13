"""READ-ONLY: runs the REAL D1 mapper over REAL payloads and the REAL as_of. No writes."""
import subprocess, sys, time
from decimal import Decimal
import pathlib
# Resolve `backend/` from THIS file, not from an absolute path of whoever ran it first:
# `ADR-038-remedicao-e1.py` hardcoded one, and it only works in the tree it was written in.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4] / "backend"))
from src.modules.sentimento.domain.as_of_accessor import (
    as_of, Observation, SeriesReadPolicy, BarPolicy, ReadPurpose)
from src.modules.sentimento.domain.provenance import AvailabilitySource
from src.modules.sentimento.use_cases.collector_series_mapping import (
    build_open_interest_to_rows, build_long_short_to_rows)
from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_key
from src.modules.sentimento.domain.long_short_catalog import count_long_short_ratio_key

OI  = "94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9"
RAT = "279d3172f5f2572d71c72f23cb7249edff91b405c2b1e7bc88c3b664963d8e3e"
MK  = "539495b4a8382cb297b5be28de028dc2358897841f2d443de6eb59136225967c"


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


def oi_obs():
    """Feed the REAL stored buckets through the REAL D1 mapper, at the REAL backfill instant."""
    rows = raw(OI)
    received_at = max(int(o) for _, _, o in rows)  # the single backfill pass instant
    points = [{"symbol": "BTCUSDT", "sumOpenInterest": v, "sumOpenInterestValue": "0",
               "CMCCirculatingSupply": "0", "timestamp": int(b)} for b, v, _ in rows]
    built = build_open_interest_to_rows()(received_at, "BTCUSDT", points)
    return [Observation(row=r, value=Decimal(r.value_raw)) for r in built], received_at


def ratio_obs():
    rows = raw(RAT)
    received_at = max(int(o) for _, _, o in rows)
    points = [{"symbol": "BTCUSDT", "longAccount": "0.5", "longShortRatio": v,
               "shortAccount": "0.5", "timestamp": int(b)} for b, v, _ in rows]
    built = build_long_short_to_rows()(received_at, "BTCUSDT", points)
    return [Observation(row=r, value=Decimal(r.value_raw)) for r in built], received_at


def hits(key, obs, grid, stale, universe, kt=None, n=61, slot_ms=None):
    pol = SeriesReadPolicy(asof_max_staleness_ms=stale, render_max_staleness_ms=stale,
                           bucket_interval_ms=grid, first_capture_at=None)
    step = slot_ms or grid
    last = max(o.row.bucket_end for o in universe)
    got = 0
    for i in range(n):
        g = last - (n - 1 - i) * step
        t = g + step - 1
        r = as_of(series=key, symbol="BTCUSDT", t=t, observations=obs, policy=pol,
                  bar_policy=BarPolicy.FINAL_ONLY, purpose=ReadPurpose.RENDERING,
                  knowledge_time=(kt or t))
        if getattr(r, "value", None) is not None:
            got += 1
    return got


NOW = int(time.time() * 1000)
oi, oi_recv = oi_obs()
ra, ra_recv = ratio_obs()
KOI = binance_open_interest_key(instrument_id="BTCUSDT")
KRA = count_long_short_ratio_key("BTCUSDT")

print(f"n_rows_built OI={len(oi)} RATIO={len(ra)}")
print(f"backfill received_at OI={oi_recv} RATIO={ra_recv}")
print("--- the stamp the REAL mapper produced (n = every built row) ---")
print(f"OI    available_at-bucket_end distinct = {sorted({o.row.available_at-o.row.bucket_end for o in oi})}"
      f"  availability_source = {sorted({o.row.availability_source.value for o in oi})}"
      f"  observed_at==received_at for all = {all(o.row.observed_at==oi_recv for o in oi)}")
print(f"RATIO available_at-bucket_end distinct = {sorted({o.row.available_at-o.row.bucket_end for o in ra})}"
      f"  availability_source = {sorted({o.row.availability_source.value for o in ra})}"
      f"  observed_at==received_at for all = {all(o.row.observed_at==ra_recv for o in ra)}")
assert all(o.row.availability_source is AvailabilitySource.MODELED for o in oi)
assert all(o.row.availability_source is AvailabilitySource.OBSERVED for o in ra)

print("--- CONTROLES ---")
print(f"C0 universo VAZIO, grade 300k          -> {hits(KOI, [], 300_000, 600_000, oi, kt=NOW)}/61  (esperado 0)")
mkrows = raw(MK)
print(f"C1 premiumIndex ao vivo (n={len(mkrows)} linhas) roda em ADR-038-remedicao-e1.py -> 61/61 (esperado ~61)")

print("--- ADR-037/M3 universe: 61 slots de 1 min, kt=agora (painel ao vivo) ---")
print(f"OI    D1 em codigo, grade 300k  -> {hits(KOI, oi, 300_000, 600_000, oi, kt=NOW, slot_ms=60_000)}/61   (ADR-038 previu 61/61)")
print(f"RATIO D1 em codigo, grade 300k  -> {hits(KRA, ra, 300_000, 600_000, ra, kt=NOW, slot_ms=60_000)}/61   (ADR-038 previu 48/61)")

print("--- grade de 5 min que o painel desenha, kt=agora ---")
print(f"OI    -> {hits(KOI, oi, 300_000, 600_000, oi, kt=NOW)}/61   RATIO -> {hits(KRA, ra, 300_000, 600_000, ra, kt=NOW)}/61")

print("--- F-2: kt=t (BACKTEST). D1 SOZINHO tem de continuar baixo; 61/61 aqui = alguem enviou o §7.1 ---")
print(f"OI    kt=t, grade 300k  -> {hits(KOI, oi, 300_000, 600_000, oi, slot_ms=60_000)}/61")
print(f"RATIO kt=t, grade 300k  -> {hits(KRA, ra, 300_000, 600_000, ra, slot_ms=60_000)}/61")
print(f"OI    kt=t, slots 5 min -> {hits(KOI, oi, 300_000, 600_000, oi)}/61")
print(f"RATIO kt=t, slots 5 min -> {hits(KRA, ra, 300_000, 600_000, ra)}/61")
