"""Runs the falsifier of docs/protocolo-de-despacho.md: avg context per subagent, per session."""
import json, os, glob, statistics as st
ROOT = os.path.expanduser("~/.claude/projects/-home-stharley-Documentos-projects-cripto-strategy")

def scan(p):
    t = ctx = 0
    with open(p, errors="replace") as f:
        for line in f:
            try: r = json.loads(line)
            except Exception: continue
            if r.get("type") == "assistant":
                u = (r.get("message") or {}).get("usage") or {}
                if u:
                    t += 1
                    ctx += (u.get("cache_read_input_tokens", 0) or 0) + (u.get("cache_creation_input_tokens", 0) or 0)
    return t, ctx

rows = []
for mp in sorted(glob.glob(os.path.join(ROOT, "*.jsonl"))):
    sid = os.path.basename(mp)[:-6]
    mt, mctx = scan(mp)
    subs = [scan(p) for p in glob.glob(os.path.join(ROOT, sid, "**", "*.jsonl"), recursive=True)
            if os.path.basename(p) != "journal.jsonl"]
    subs = [s for s in subs if s[0] > 0]
    if not subs and mt == 0: continue
    start = os.path.getmtime(mp)
    rows.append((sid, os.path.getctime(mp), len(subs),
                 (sum(c for _, c in subs) / len(subs)) if subs else 0,
                 st.median([t for t, _ in subs]) if subs else 0,
                 max([t for t, _ in subs]) if subs else 0,
                 mctx / mt if mt else 0, mt))
rows.sort(key=lambda r: r[1])
print(f"{'sessao':10} {'subs':>5} {'ctx_medio/sub':>14} {'turnos_p50':>11} {'max':>5} {'main_ctx/turno':>15} {'main_turnos':>12}")
print(f"{'BASE b227a990 (doc, n=45)':10} {45:5d} {'18.3M':>14} {137:11d} {376:5d} {'275.0k':>15}")
print("-" * 80)
allsubs = []
for sid, _, n, avg, p50, mx, mpt, mt in rows:
    if n == 0: continue
    flag = "  <-- abaixo da base" if avg < 18.3e6 else "  ACIMA da base"
    print(f"{sid[:8]:10} {n:5d} {avg/1e6:13.1f}M {p50:11.0f} {mx:5d} {mpt/1000:14.1f}k {mt:12d}{flag}")
    allsubs.append((n, avg))
tot_n = sum(n for n, _ in allsubs)
tot_ctx = sum(n * a for n, a in allsubs)
print("-" * 80)
print(f"GLOBAL: {tot_n} subagentes, contexto medio por subagente = {tot_ctx/tot_n/1e6:.1f}M (base do doc: 18.3M)")
