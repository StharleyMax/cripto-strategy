"""READ-ONLY remeasurement of E1 against the production Postgres, using the REAL as_of."""
import subprocess, sys
from decimal import Decimal
sys.path.insert(0, "/home/stharley/Documentos/projects/cripto-strategy/backend")
from src.modules.sentimento.domain.as_of_accessor import (
    as_of, Observation, SeriesReadPolicy, BarPolicy, ReadPurpose)
from src.modules.sentimento.domain.provenance import SeriesRow, AvailabilitySource, Provenance
from src.modules.sentimento.domain.series_key import SeriesKey, Nature, TsConvention, Reduction, QuantityField

def q(sql):
    out = subprocess.run(["docker","exec","deploy-postgres-1","psql","-U","cripto_strategy",
        "-d","cripto_strategy","-At","-F","|","-c",sql],capture_output=True,text=True)
    if out.returncode: raise SystemExit(out.stderr)
    return [l.split("|") for l in out.stdout.strip().splitlines() if l]

def key(nature):
    return SeriesKey(provider="binance", venue="usdm_futures", instrument_id="BTCUSDT",
        metric="m", cohort="all", interval="5m", unit="U", denom="base", nature=nature,
        ts_convention=TsConvention.POINT_AT_BUCKET_END, reduction=Reduction.POINT,
        quantity_field=QuantityField.Q, label_shift=0, aggregation_scope="Symbol",
        verified_by="remede.py")

def rows(skid, shift=None, kid=None, shift_obs=False):
    r = q(f"select bucket_end, event_time, available_at, ingested_at, observed_at, value_raw "
          f"from md.series where series_key_id='{skid}' and symbol='BTCUSDT' order by bucket_end")
    obs = []
    for be, et, av, ing, ob, vr in r:
        be, av = int(be), int(av)
        avail = be + shift if shift is not None else av
        src = AvailabilitySource.MODELED if shift is not None else AvailabilitySource.OBSERVED
        sr = SeriesRow(series_key_id=(kid or skid), symbol="BTCUSDT", source="s", bucket_end=be,
            event_time=int(et), available_at=avail, availability_source=src,
            ingested_at=int(ing), observed_at=(avail if shift_obs else int(ob)), provenance=Provenance.OBSERVED,
            src_label_raw="s", observer_id="o", observer_region="r", is_final=True,
            value_raw=vr)
        obs.append(Observation(row=sr, value=Decimal(vr)))
    return obs

def slots(obs, grid, n=61):
    last = max(o.row.bucket_end for o in obs)
    return [last - (n-1-i)*grid for i in range(n)]

def hits(obs, grid, nature, stale, n=61, universe=None, kt=None):
    k = key(nature)
    pol = SeriesReadPolicy(asof_max_staleness_ms=stale, render_max_staleness_ms=stale,
                           bucket_interval_ms=grid, first_capture_at=None)
    got = 0
    for g in slots(universe or obs, grid, n):
        t = g + grid - 1
        r = as_of(series=k, symbol="BTCUSDT", t=t, observations=obs, policy=pol,
                  bar_policy=BarPolicy.FINAL_ONLY, purpose=ReadPurpose.RENDERING,
                  knowledge_time=(kt or t))
        if getattr(r, "value", None) is not None: got += 1
    return got

OI  = "94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9"
RAT = "279d3172f5f2572d71c72f23cb7249edff91b405c2b1e7bc88c3b664963d8e3e"
MK  = "539495b4a8382cb297b5be28de028dc2358897841f2d443de6eb59136225967c"

KOI=key(Nature.STOCK).series_key_id(); KRA=key(Nature.RATIO).series_key_id()
oi = rows(OI,kid=KOI); ra = rows(RAT,kid=KRA); mk = rows(MK,kid=KOI)
print(f"n_linhas OI={len(oi)} RATIO={len(ra)} premiumIndex={len(mk)}")
print("--- CONTROLES (valor esperado conhecido) ---")
print(f"C0 universo VAZIO, grade 300k, STOCK           -> {hits([], 300_000, Nature.STOCK, 600_000, universe=oi)}/61   (esperado 0)")
print(f"C1 premiumIndex ao vivo, grade 60k, STOCK      -> {hits(mk, 60_000, Nature.STOCK, 120_000)}/61   (esperado ~61: coletor alinhado a grade)")
print("--- OI (STOCK, grade nativa 300k, stale 600k) ---")
print(f"A  como esta hoje                              -> {hits(oi, 300_000, Nature.STOCK, 600_000)}/61")
print(f"B  E1 simulado  available_at=bucket_end+300000 -> {hits(rows(OI,300_000,kid=KOI), 300_000, Nature.STOCK, 600_000, universe=oi)}/61")
print(f"C  E1 simulado  available_at=bucket_end+34532  -> {hits(rows(OI,34_532,kid=KOI), 300_000, Nature.STOCK, 600_000, universe=oi)}/61")
print("--- RATIO (grade nativa 300k; ADR-037/M3 estimou 4/61 -> 48/61) ---")
print(f"D  como esta hoje, bucket_interval=300k        -> {hits(ra, 300_000, Nature.RATIO, 600_000)}/61")
print(f"E  como esta hoje, bucket_interval=60k (hoje)  -> {hits(ra, 60_000, Nature.RATIO, 600_000)}/61")
print(f"F  E1 +66712, bucket_interval=300k             -> {hits(rows(RAT,66_712,kid=KRA), 300_000, Nature.RATIO, 600_000, universe=ra)}/61")

import time
NOW = int(time.time()*1000)
print("--- knowledge_time = AGORA (semantica do painel ao vivo / RENDERING) ---")
print(f"A' OI como esta hoje                           -> {hits(oi, 300_000, Nature.STOCK, 600_000, kt=NOW)}/61")
print(f"B' OI E1 available_at=bucket_end+300000        -> {hits(rows(OI,300_000,kid=KOI), 300_000, Nature.STOCK, 600_000, universe=oi, kt=NOW)}/61")
print(f"C' OI E1 available_at=bucket_end+34532         -> {hits(rows(OI,34_532,kid=KOI), 300_000, Nature.STOCK, 600_000, universe=oi, kt=NOW)}/61")
print(f"D' RATIO hoje, grade 300k                      -> {hits(ra, 300_000, Nature.RATIO, 600_000, kt=NOW)}/61")
print(f"F' RATIO E1 +66712, grade 300k                 -> {hits(rows(RAT,66_712,kid=KRA), 300_000, Nature.RATIO, 600_000, universe=ra, kt=NOW)}/61")
print(f"G' RATIO E1 +66712, grade 60k (largura de hoje)-> {hits(rows(RAT,66_712,kid=KRA), 60_000, Nature.RATIO, 600_000, universe=ra, kt=NOW)}/61")
print("--- knowledge_time = t  (semantica de BACKTEST) + observed_at TAMBEM reconstruido ---")
print(f"B'' OI available_at E observed_at = be+300000  -> {hits(rows(OI,300_000,kid=KOI,shift_obs=True), 300_000, Nature.STOCK, 600_000, universe=oi)}/61")
print(f"F'' RATIO available_at E observed_at = be+66712-> {hits(rows(RAT,66_712,kid=KRA,shift_obs=True), 300_000, Nature.RATIO, 600_000, universe=ra)}/61")

# ---- reproducao LITERAL do universo de ADR-037/M3: 61 slots de 1 min, t = slot+59.999 ----
def hits_m3(obs, grid, nature, stale, universe, kt=None, n=61):
    k = key(nature)
    pol = SeriesReadPolicy(asof_max_staleness_ms=stale, render_max_staleness_ms=stale,
                           bucket_interval_ms=grid, first_capture_at=None)
    last = max(o.row.bucket_end for o in universe); got = 0
    for i in range(n):
        g = last - (n-1-i)*60_000; t = g + 59_999
        r = as_of(series=k, symbol="BTCUSDT", t=t, observations=obs, policy=pol,
                  bar_policy=BarPolicy.FINAL_ONLY, purpose=ReadPurpose.RENDERING,
                  knowledge_time=(kt or t))
        if r.value is not None: got += 1
    return got
print("--- universo LITERAL de ADR-037/M3: 61 slots de 1 min, kt=agora ---")
print(f"RATIO grade 60k (hoje)        -> {hits_m3(ra,60_000,Nature.RATIO,600_000,ra,NOW)}/61   (ADR-037 disse 0/61)")
print(f"RATIO grade 300k (nativa)     -> {hits_m3(ra,300_000,Nature.RATIO,600_000,ra,NOW)}/61   (ADR-037 disse 4/61)")
print(f"RATIO grade 300k + E1 +66712  -> {hits_m3(rows(RAT,66_712,kid=KRA),300_000,Nature.RATIO,600_000,ra,NOW)}/61   (ADR-037 disse 48/61)")
print(f"OI    grade 60k               -> {hits_m3(oi,60_000,Nature.STOCK,600_000,oi,NOW)}/61   (ADR-037 disse 1/61)")
print(f"OI    grade 300k + E1 +34532  -> {hits_m3(rows(OI,34_532,kid=KOI),300_000,Nature.STOCK,600_000,oi,NOW)}/61   (ADR-037 disse 61/61)")
