"""QA READ-ONLY: is the 61/61 at kt=t caused by §7.1, or by live coverage? No writes."""
import os, sys, time, subprocess
from decimal import Decimal
BACKEND = os.environ["BACKEND_DIR"]; sys.path.insert(0, BACKEND)
from src.modules.sentimento.domain.as_of_accessor import (
    as_of, Observation, SeriesReadPolicy, BarPolicy, ReadPurpose)
from src.modules.sentimento.domain.provenance import SeriesRow, AvailabilitySource, Provenance
from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_key
from src.modules.sentimento.domain.modeled_availability import modeled_available_at_for_endpoint
OI = "/futures/data/openInterestHist"
def q(sql):
    o = subprocess.run(["docker","exec","deploy-postgres-1","psql","-U","cripto_strategy","-d",
        "cripto_strategy","-At","-F","|","-c",sql],capture_output=True,text=True)
    if o.returncode: raise SystemExit(o.stderr)
    return [l.split("|") for l in o.stdout.strip().splitlines() if l]
K = binance_open_interest_key(instrument_id="BTCUSDT"); k = K.series_key_id()
raw = q(f"select bucket_end,event_time,available_at,ingested_at,observed_at,value_raw from md.series "
        f"where series_key_id='{k}' and symbol='BTCUSDT' and src_label_raw='{OI}' order by bucket_end")
if not raw: raise SystemExit("ANOMALIA: universo vazio")
NOW = int(time.time()*1000)
LIVE_CUT = 1789257900000  # 2026-09-12T23:45:00Z — o instante em que o coletor ao vivo nasceu
def obs(rows, stamp, shift):
    out=[]
    for be,et,av,ing,ob,vr in rows:
        be=int(be); a = stamp(be) if stamp else int(av)
        src = AvailabilitySource.MODELED if stamp else AvailabilitySource.OBSERVED
        out.append(Observation(row=SeriesRow(series_key_id=k,symbol="BTCUSDT",source=OI,bucket_end=be,
            event_time=int(et),available_at=a,availability_source=src,ingested_at=int(ing),
            observed_at=(a if shift else int(ob)),provenance=Provenance.OBSERVED,src_label_raw=OI,
            observer_id="o",observer_region="r",is_final=True,value_raw=vr),value=Decimal(vr)))
    return out
def hits(o,anchor,kt_now,slot=60_000,n=61):
    pol=SeriesReadPolicy(asof_max_staleness_ms=600_000,render_max_staleness_ms=600_000,
                         bucket_interval_ms=300_000,first_capture_at=None)
    g=0
    for i in range(n):
        b=anchor-(n-1-i)*slot; t=b+slot-1
        r=as_of(series=K,symbol="BTCUSDT",t=t,observations=o,policy=pol,bar_policy=BarPolicy.FINAL_ONLY,
                purpose=ReadPurpose.RENDERING,knowledge_time=(NOW if kt_now else t))
        if getattr(r,"value",None) is not None: g+=1
    return g
st = lambda be: modeled_available_at_for_endpoint(endpoint=OI, bucket_end_ms=be)
bf = [r for r in raw if int(r[4]) < LIVE_CUT]           # so backfill, como em 23:41Z
print(f"linhas: total={len(raw)}  so-backfill={len(bf)}  ao-vivo={len(raw)-len(bf)}")
for nome, rows in (("POPULACAO SO-BACKFILL (a de 23:41Z)", bf), ("POPULACAO DE HOJE (com coletor ao vivo)", raw)):
    if not rows: continue
    A = max(int(r[0]) for r in rows)
    hoje = obs(rows, None, False); d1 = obs(rows, st, False); d1_71 = obs(rows, st, True)
    print(f"\n== {nome} == ancora bucket_end={A}")
    print(f"  kt=agora 1min : hoje {hits(hoje,A,True):>2}/61 -> D1 {hits(d1,A,True):>2}/61")
    print(f"  kt=agora 5min : hoje {hits(hoje,A,True,slot=300_000):>2}/61 -> D1 {hits(d1,A,True,slot=300_000):>2}/61")
    print(f"  F-2 kt=t 1min : D1 {hits(d1,A,False):>2}/61   | contraprova §7.1 {hits(d1_71,A,False):>2}/61")
    print(f"  F-2 kt=t 5min : D1 {hits(d1,A,False,slot=300_000):>2}/61   | contraprova §7.1 {hits(d1_71,A,False,slot=300_000):>2}/61")
print(f"\nobserved_at == do store em 100% das linhas? {all(o.row.observed_at==int(r[4]) for o,r in zip(obs(raw,st,False),raw))}")
print(f"LOOKAHEAD: linhas do store com available_at < bucket_end -> {q(f'''select count(*) from md.series where available_at < bucket_end''')[0][0]} de {q('select count(*) from md.series')[0][0]}")
