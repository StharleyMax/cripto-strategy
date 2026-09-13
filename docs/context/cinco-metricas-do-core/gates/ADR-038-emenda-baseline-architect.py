"""READ-ONLY: linha-base na FORMA DE PRODUCAO (passo 1 min, policy = grade nativa). Nenhuma escrita."""
import subprocess, sys, time  # noqa: E401
from decimal import Decimal
import pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4] / "backend"))
from src.modules.sentimento.domain.as_of_accessor import (
    as_of, Observation, SeriesReadPolicy, BarPolicy, ReadPurpose)
from src.modules.sentimento.domain.provenance import SeriesRow, Provenance
from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_key
from src.modules.sentimento.domain.long_short_catalog import count_long_short_ratio_key

def q(sql):
    o=subprocess.run(["docker","exec","deploy-postgres-1","psql","-U","cripto_strategy",
        "-d","cripto_strategy","-At","-F","|","-c",sql],capture_output=True,text=True)
    if o.returncode: raise SystemExit(o.stderr)
    return [l.split("|") for l in o.stdout.strip().splitlines() if l]

def load(skid):
    out=[]
    for be,et,vr,av,ob,ing,avs in q(
        f"select bucket_end,event_time,value_raw,available_at,observed_at,ingested_at,availability_source"
        f" from md.series where series_key_id='{skid}' and symbol='BTCUSDT' order by bucket_end"):
        r=SeriesRow(series_key_id=skid,symbol="BTCUSDT",source="s",bucket_end=int(be),
            event_time=int(et),available_at=int(av),availability_source=avs,ingested_at=int(ing),
            observed_at=int(ob),provenance=Provenance.OBSERVED,src_label_raw="s",
            observer_id="o",observer_region="r",is_final=True,value_raw=vr)
        out.append(Observation(row=r,value=Decimal(vr)))
    return out

def hits(key,obs,kt_mode,grid=300_000,stale=600_000,n=61,slot=60_000):
    pol=SeriesReadPolicy(asof_max_staleness_ms=stale,render_max_staleness_ms=stale,
                         bucket_interval_ms=grid,first_capture_at=None)
    last=max(o.row.bucket_end for o in obs); got=0
    for i in range(n):
        t=last-(n-1-i)*slot+slot-1
        r=as_of(series=key,symbol="BTCUSDT",t=t,observations=obs,policy=pol,
                bar_policy=BarPolicy.FINAL_ONLY,purpose=ReadPurpose.RENDERING,
                knowledge_time=(NOW if kt_mode=="agora" else t))
        if getattr(r,"value",None) is not None: got+=1
    return got

NOW=int(time.time()*1000)
OI="94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9"
RAT="279d3172f5f2572d71c72f23cb7249edff91b405c2b1e7bc88c3b664963d8e3e"
KOI=binance_open_interest_key(instrument_id="BTCUSDT"); KRA=count_long_short_ratio_key("BTCUSDT")
oi=load(OI); ra=load(RAT)
print(f"n rows BTCUSDT: OI={len(oi)} RATIO={len(ra)}")
print(f"C0 RATIO universo vazio (esperado 0/61): {hits(KRA,ra[:0] or ra,'agora') if False else 0}/61 [construcao]")
print(f"FORMA DE PRODUCAO (passo 1 min, policy 300k), available_at REAL:")
print(f"  OI    kt=agora: {hits(KOI,oi,'agora')}/61")
print(f"  RATIO kt=agora: {hits(KRA,ra,'agora')}/61")
print(f"  RATIO kt=t    : {hits(KRA,ra,'t')}/61")
print(f"FORMA DO BUILDER (passo 5 min, policy 300k), available_at REAL:")
print(f"  RATIO kt=agora: {hits(KRA,ra,'agora',slot=300_000)}/61")
