"""Trimmed wall-clock + per-subagent cost distribution (tests the ~150-turn doctrine)."""
import json, os, glob, re, datetime as dt
from collections import defaultdict

ROOT = os.path.expanduser("~/.claude/projects/-home-stharley-Documentos-projects-cripto-strategy")
CAP = 1800  # calls longer than this are session-interrupt artifacts, not real execution

def ts(s):
    try: return dt.datetime.fromisoformat((s or "").replace("Z", "+00:00"))
    except Exception: return None

CD = re.compile(r'^\s*cd\s+[^\s&;|]+\s*(&&|;)\s*')
GATES = [(r'\bmake\s+verify\b','GATE make verify'),(r'\bmake\s+lint\b|scripts/lint\.sh','GATE make lint'),
 (r'\bmake\s+test\b|scripts/test\.sh|pytest','GATE test/pytest'),(r'\bmake\s+boundaries\b|boundaries\.sh','GATE boundaries'),
 (r'\bmake\s+natureza\b','GATE natureza'),(r'\bmake\s+setup\b|\bnpm\s+(ci|install)\b|uv\s+sync','SETUP npm/uv install'),
 (r'\bharness\s+corpus\b','GATE harness corpus'),(r'\bharness\b','harness (cli)'),
 (r'\bgit\s+push\b','git push (pre-push)'),(r'\bgh\s+pr\b','gh pr'),
 (r'\bnpm\s+(run\s+)?(lint|typecheck|test|build)\b|tsc\b|eslint\b|playwright','GATE npm lint/tsc/test'),
 (r'^\s*(until|while)\b','POLL until/while'),(r'\bgit\s+(log|diff|status|show|worktree|branch)\b','git leitura')]
def label(name, inp):
    if name != "Bash": return name
    c = (inp or {}).get("command","") or ""
    prev=None
    while prev!=c: prev=c; c=CD.sub('',c)
    for rx,lab in GATES:
        if re.search(rx,c): return lab
    t=[x for x in c.split() if not x.startswith('-')]
    return f"sh:{t[0].split('/')[-1][:20]}" if t else "sh:?"

def scan(path):
    turns=cr=cc=out=0; pend={}; d=defaultdict(float); n=defaultdict(int); trimmed=0; ctx_per_turn=[]
    with open(path, errors="replace") as f:
        for line in f:
            try: r=json.loads(line)
            except Exception: continue
            t=ts(r.get("timestamp")); m=r.get("message") or {}
            if not isinstance(m,dict): continue
            if r.get("type")=="assistant":
                u=m.get("usage") or {}
                if u:
                    turns+=1; cr+=u.get("cache_read_input_tokens",0) or 0
                    cc+=u.get("cache_creation_input_tokens",0) or 0; out+=u.get("output_tokens",0) or 0
                    ctx_per_turn.append((u.get("cache_read_input_tokens",0) or 0)+(u.get("cache_creation_input_tokens",0) or 0))
                for c in (m.get("content") or []):
                    if isinstance(c,dict) and c.get("type")=="tool_use": pend[c.get("id")]=(label(c.get("name","?"),c.get("input")),t)
            elif r.get("type")=="user":
                for c in (m.get("content") or []):
                    if isinstance(c,dict) and c.get("type")=="tool_result":
                        k=pend.pop(c.get("tool_use_id"),None)
                        if not k: continue
                        lab,t0=k; n[lab]+=1
                        if t0 and t:
                            s=(t-t0).total_seconds()
                            if 0<=s<=CAP: d[lab]+=s
                            elif s>CAP: trimmed+=1
    return dict(turns=turns,cr=cr,cc=cc,out=out,d=d,n=n,trimmed=trimmed,ctx=ctx_per_turn)

mains=sorted(glob.glob(os.path.join(ROOT,"*.jsonl")))
D=defaultdict(float); N=defaultdict(int); TRIM=0
subs_rows=[]; main_ctx=[]; sub_ctx=[]; main_turns=sub_turns=0; main_cr=sub_cr=0
for mp in mains:
    sid=os.path.basename(mp)[:-6]
    a=scan(mp)
    for k,v in a["d"].items(): D[k]+=v
    for k,v in a["n"].items(): N[k]+=v
    TRIM+=a["trimmed"]; main_ctx+=a["ctx"]; main_turns+=a["turns"]; main_cr+=a["cr"]
    for sp in glob.glob(os.path.join(ROOT,sid,"**","*.jsonl"),recursive=True):
        if os.path.basename(sp)=="journal.jsonl": continue
        b=scan(sp)
        for k,v in b["d"].items(): D[k]+=v
        for k,v in b["n"].items(): N[k]+=v
        TRIM+=b["trimmed"]; sub_ctx+=b["ctx"]; sub_turns+=b["turns"]; sub_cr+=b["cr"]
        if b["turns"]: subs_rows.append((sid[:8],os.path.basename(sp)[:-6][-8:],b["turns"],b["cr"]+b["cc"],b["out"]))

tot=sum(D.values())
print(f"WALL-CLOCK DE FERRAMENTA, aparado em {CAP}s ({TRIM} chamada(s) descartada(s) como artefato de interrupcao)")
print(f"\n{'bucket':28} {'n':>5} {'TOT_h':>7} {'%':>6} {'s/chamada':>10}")
for lab,v in sorted(D.items(),key=lambda kv:-kv[1])[:14]:
    print(f"{lab:28} {N[lab]:5d} {v/3600:7.2f} {v/tot*100:5.1f}% {v/max(N[lab],1):10.1f}")
print("-"*62); print(f"{'TOTAL':28} {sum(N.values()):5d} {tot/3600:7.2f} {'100%':>6}")
g=sum(v for k,v in D.items() if k.startswith(('GATE','SETUP'))) ; gp=D.get('git push (pre-push)',0)
print(f"\nportoes de qualidade (GATE+SETUP): {g/3600:.2f}h ({g/tot*100:.1f}%)  |  git push/pre-push: {gp/3600:.2f}h ({gp/tot*100:.1f}%)")
print(f"polling (until/while): {D.get('POLL until/while',0)/3600:.2f}h  |  espera do owner (AskUserQuestion): {D.get('AskUserQuestion',0)/3600:.2f}h")

def pct(v,q):
    v=sorted(v); return v[min(len(v)-1,int(len(v)*q))] if v else 0
print(f"\nCONTEXTO LIDO POR TURNO (cache_read+cache_write), o custo real por turno:")
print(f"  loop principal : n={main_turns:6d} turnos  p50={pct(main_ctx,.5)/1000:7.1f}k  p90={pct(main_ctx,.9)/1000:7.1f}k  max={max(main_ctx or [0])/1000:7.1f}k")
print(f"  subagentes     : n={sub_turns:6d} turnos  p50={pct(sub_ctx,.5)/1000:7.1f}k  p90={pct(sub_ctx,.9)/1000:7.1f}k  max={max(sub_ctx or [0])/1000:7.1f}k")

subs_rows.sort(key=lambda r:-r[3])
print(f"\nSUBAGENTES: {len(subs_rows)} com turnos. Doutrina do repo: morrer perto de ~150 turnos.")
over=[r for r in subs_rows if r[2]>150]; ctx_over=sum(r[3] for r in over); ctx_all=sum(r[3] for r in subs_rows)
print(f"  passaram de 150 turnos: {len(over)}/{len(subs_rows)} ({len(over)/len(subs_rows)*100:.0f}%) e consomem {ctx_over/1e9:.2f}G de {ctx_all/1e9:.2f}G ({ctx_over/ctx_all*100:.0f}% do contexto de subagente)")
print(f"\n  top-8 subagentes mais caros:")
print(f"  {'sessao':9} {'agente':9} {'turnos':>7} {'ctx_G':>7} {'out_k':>7} {'ctx/turno_k':>12}")
for s,a,t,c,o in subs_rows[:8]:
    print(f"  {s:9} {a:9} {t:7d} {c/1e9:7.3f} {o/1000:7.1f} {c/t/1000:12.1f}")
