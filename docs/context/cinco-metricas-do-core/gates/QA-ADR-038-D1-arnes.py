"""QA READ-ONLY harness for ADR-038/D1. No writes. Identity is COMPUTED, never hardcoded."""
import os, subprocess, sys, time
from decimal import Decimal
from dataclasses import replace

BACKEND = os.environ["BACKEND_DIR"]
sys.path.insert(0, BACKEND)
from src.modules.sentimento.domain.as_of_accessor import (
    as_of, Observation, SeriesReadPolicy, BarPolicy, ReadPurpose, CARRY_FORWARD_BY_NATURE)
from src.modules.sentimento.domain.provenance import SeriesRow, AvailabilitySource, Provenance
from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_key
from src.modules.sentimento.domain.long_short_catalog import count_long_short_ratio_key

HAS_D1 = os.path.exists(os.path.join(BACKEND, "src/modules/sentimento/domain/modeled_availability.py"))
if HAS_D1:
    from src.modules.sentimento.domain.modeled_availability import modeled_available_at_for_endpoint

OI_EP = "/futures/data/openInterestHist"
RA_EP = "/futures/data/globalLongShortAccountRatio"
PI_EP = "/fapi/v1/premiumIndex"

def q(sql):
    out = subprocess.run(["docker","exec","deploy-postgres-1","psql","-U","cripto_strategy",
        "-d","cripto_strategy","-At","-F","|","-c",sql],capture_output=True,text=True)
    if out.returncode: raise SystemExit(out.stderr)
    return [l.split("|") for l in out.stdout.strip().splitlines() if l]

KOI = binance_open_interest_key(instrument_id="BTCUSDT")
KRA = count_long_short_ratio_key("BTCUSDT")

def load(skid, ep):
    return q(f"select bucket_end, event_time, available_at, ingested_at, observed_at, value_raw "
             f"from md.series where series_key_id='{skid}' and symbol='BTCUSDT' "
             f"and src_label_raw='{ep}' order by bucket_end")

def to_obs(raw, skid, ep, stamp=None, shift_obs=False):
    out = []
    for be, et, av, ing, ob, vr in raw:
        be = int(be); av = int(av); src = AvailabilitySource.OBSERVED
        if stamp is not None:
            av = stamp(be); src = AvailabilitySource.MODELED
        sr = SeriesRow(series_key_id=skid, symbol="BTCUSDT", source=ep, bucket_end=be,
            event_time=int(et), available_at=av, availability_source=src, ingested_at=int(ing),
            observed_at=(av if shift_obs else int(ob)), provenance=Provenance.OBSERVED,
            src_label_raw=ep, observer_id="o", observer_region="r", is_final=True, value_raw=vr)
        out.append(Observation(row=sr, value=Decimal(vr)))
    return out

def hits(key, obs, anchor_be, grid, stale, kt_now, n=61, slot=60_000):
    pol = SeriesReadPolicy(asof_max_staleness_ms=stale, render_max_staleness_ms=stale,
                           bucket_interval_ms=grid, first_capture_at=None)
    got = 0
    for i in range(n):
        g = anchor_be - (n-1-i)*slot
        t = g + slot - 1
        r = as_of(series=key, symbol="BTCUSDT", t=t, observations=obs, policy=pol,
                  bar_policy=BarPolicy.FINAL_ONLY, purpose=ReadPurpose.RENDERING,
                  knowledge_time=(NOW if kt_now else t))
        if getattr(r, "value", None) is not None: got += 1
    return got

def snap():
    return q("select src_label_raw, count(*), max(observed_at) from md.series "
             "where src_label_raw in ('/futures/data/openInterestHist',"
             "'/futures/data/globalLongShortAccountRatio','/fapi/v1/premiumIndex') group by 1 order by 1")

print("JANELA-INICIO", int(time.time()*1000), snap())
NOW = int(time.time()*1000)
koi, kra = KOI.series_key_id(), KRA.series_key_id()
print(f"IDENT  OI={koi[:12]} nature={KOI.nature.value} carry={CARRY_FORWARD_BY_NATURE[KOI.nature]}")
print(f"IDENT  RA={kra[:12]} nature={KRA.nature.value} carry={CARRY_FORWARD_BY_NATURE[KRA.nature]}")

raw_oi = load(koi, OI_EP); raw_ra = load(kra, RA_EP)
pi = q(f"select series_key_id, count(*) from md.series where src_label_raw='{PI_EP}' "
       f"and symbol='BTCUSDT' group by 1 order by 2 desc limit 1")
pi_skid = pi[0][0]; raw_pi = load(pi_skid, PI_EP)
print(f"IDENT-CONTROLE  linhas OI={len(raw_oi)} RATIO={len(raw_ra)} premiumIndex={len(raw_pi)}")
if not (raw_oi and raw_ra and raw_pi):
    raise SystemExit("ANOMALIA: identidade nao casou com o store — universo vazio nao intencional")

A_OI = max(int(r[0]) for r in raw_oi); A_RA = max(int(r[0]) for r in raw_ra)
A_PI = max(int(r[0]) for r in raw_pi)

oi_hoje = to_obs(raw_oi, koi, OI_EP)
ra_hoje = to_obs(raw_ra, kra, RA_EP)
# C1 relabels the premiumIndex rows onto KOI's id ON PURPOSE: `as_of` matches observations by
# `series_key_id`, and passing the OI key with premiumIndex ids is exactly the identity mismatch
# that makes a harness report a false `0/61`. The control exists to catch that, and it did.
pi_hoje = to_obs(raw_pi, koi, PI_EP)

print("\n--- CONTROLES ---")
print(f"C0 universo VAZIO (OI, 300k, kt=agora)          -> {hits(KOI,[],A_OI,300_000,600_000,True)}/61   esperado 0")
print(f"C1 premiumIndex ao vivo (60k, stale 120k)       -> {hits(KOI,pi_hoje,A_PI,60_000,120_000,True)}/61   esperado 61")

print("\n--- OI (STOCK) 61 slots 1min, kt=agora, grade 300k ---")
print(f"A  hoje (available_at do store)                 -> {hits(KOI,oi_hoje,A_OI,300_000,600_000,True)}/61")
if HAS_D1:
    st = lambda be: modeled_available_at_for_endpoint(endpoint=OI_EP, bucket_end_ms=be)
    oi_d1 = to_obs(raw_oi, koi, OI_EP, stamp=st)
    print(f"B  com o carimbo D1 desta PR                    -> {hits(KOI,oi_d1,A_OI,300_000,600_000,True)}/61")
    offs = sorted({o.row.available_at - o.row.bucket_end for o in oi_d1})
    print(f"   offsets distintos emitidos pelo carimbo      -> {offs}")
    print(f"   LOOKAHEAD: min(available_at-bucket_end)      -> {min(offs)}  (tem de ser >= 300000)")
    print(f"   carimbo na grade (mult de 300k)?             -> {all(o.row.available_at % 300_000 == 0 for o in oi_d1)}")
    print(f"   availability_source distintos                -> {sorted({o.row.availability_source.value for o in oi_d1})}")
    print(f"   observed_at == do store em todas?            -> {all(o.row.observed_at == int(r[4]) for o, r in zip(oi_d1, raw_oi))}")
    print(f"\n--- F-2 (kt = t, backtest) ---")
    print(f"F2 OI com carimbo D1, 1min                     -> {hits(KOI,oi_d1,A_OI,300_000,600_000,False)}/61   tem de ser 0-1")
    print(f"F2 OI com carimbo D1, slots de 5min            -> {hits(KOI,oi_d1,A_OI,300_000,600_000,False,slot=300_000)}/61   tem de ser 0-1")
    oi_71 = to_obs(raw_oi, koi, OI_EP, stamp=st, shift_obs=True)
    print(f"F2 CONTRAPROVA: se o §7.1 tivesse entrado      -> {hits(KOI,oi_71,A_OI,300_000,600_000,False)}/61   (mostra que o arnes MORDE)")
    print(f"\n--- RATIO: a recusa e honesta? (mesmas linhas) ---")
    ra_d1 = to_obs(raw_ra, kra, RA_EP, stamp=lambda be: -(-(be+300_000)//300_000)*300_000)
    print(f"R-hoje  grade 300k                             -> {hits(KRA,ra_hoje,A_RA,300_000,600_000,True)}/61")
    print(f"R-hoje  grade 60k                              -> {hits(KRA,ra_hoje,A_RA,60_000,600_000,True)}/61")
    print(f"R-D1    carimbo +1 grade (o que D1 emitiria)   -> {hits(KRA,ra_d1,A_RA,300_000,600_000,True)}/61")
    for off in (34_532, 66_712, 150_000, 299_999, 300_000, 600_000):
        r = to_obs(raw_ra, kra, RA_EP, stamp=lambda be, o=off: be+o)
        o_ = to_obs(raw_oi, koi, OI_EP, stamp=lambda be, o=off: be+o)
        print(f"   offset {off:>7}: OI {hits(KOI,o_,A_OI,300_000,600_000,True):>2}/61 | RATIO {hits(KRA,r,A_RA,300_000,600_000,True):>2}/61")
    print(f"\n--- grade de 5 min que o painel desenha, kt=agora ---")
    print(f"OI hoje {hits(KOI,oi_hoje,A_OI,300_000,600_000,True,slot=300_000)}/61 -> D1 {hits(KOI,oi_d1,A_OI,300_000,600_000,True,slot=300_000)}/61 | "
          f"RATIO hoje {hits(KRA,ra_hoje,A_RA,300_000,600_000,True,slot=300_000)}/61 -> D1 {hits(KRA,ra_d1,A_RA,300_000,600_000,True,slot=300_000)}/61")
print("\nJANELA-FIM", int(time.time()*1000), snap())
