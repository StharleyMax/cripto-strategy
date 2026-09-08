"""Aggregate Claude Code JSONL transcripts: tokens, turns, wall clock, per session."""
import json, sys, os, glob, datetime as dt
from collections import defaultdict

ROOT = os.path.expanduser("~/.claude/projects/-home-stharley-Documentos-projects-cripto-strategy")

def parse_ts(s):
    try:
        return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def scan(path):
    a = dict(turns=0, inp=0, out=0, cc=0, cr=0, first=None, last=None,
             tools=defaultdict(int), tool_bytes=defaultdict(int), models=defaultdict(int))
    try:
        with open(path, "r", errors="replace") as f:
            for line in f:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                ts = parse_ts(r.get("timestamp") or "")
                if ts:
                    if a["first"] is None or ts < a["first"]: a["first"] = ts
                    if a["last"] is None or ts > a["last"]: a["last"] = ts
                m = r.get("message") or {}
                if r.get("type") == "assistant" and isinstance(m, dict):
                    u = m.get("usage") or {}
                    if u:
                        a["turns"] += 1
                        a["inp"] += u.get("input_tokens", 0) or 0
                        a["out"] += u.get("output_tokens", 0) or 0
                        a["cc"] += u.get("cache_creation_input_tokens", 0) or 0
                        a["cr"] += u.get("cache_read_input_tokens", 0) or 0
                        if m.get("model"): a["models"][m["model"]] += 1
                    for c in (m.get("content") or []):
                        if isinstance(c, dict) and c.get("type") == "tool_use":
                            a["tools"][c.get("name", "?")] += 1
                if r.get("type") == "user" and isinstance(m, dict):
                    for c in (m.get("content") or []):
                        if isinstance(c, dict) and c.get("type") == "tool_result":
                            cc = c.get("content")
                            n = len(cc) if isinstance(cc, str) else len(json.dumps(cc, default=str))
                            a["tool_bytes"]["_total"] += n
    except FileNotFoundError:
        pass
    return a

def h(n):
    for u in ["", "k", "M", "G"]:
        if abs(n) < 1000: return f"{n:.1f}{u}"
        n /= 1000
    return f"{n:.1f}T"

sessions = sorted(glob.glob(os.path.join(ROOT, "*.jsonl")))
rows = []
for s in sessions:
    sid = os.path.basename(s)[:-6]
    main = scan(s)
    subs = glob.glob(os.path.join(ROOT, sid, "**", "*.jsonl"), recursive=True)
    subs = [p for p in subs if os.path.basename(p) != "journal.jsonl"]
    sub_agg = dict(turns=0, inp=0, out=0, cc=0, cr=0, n=len(subs))
    for p in subs:
        b = scan(p)
        for k in ("turns", "inp", "out", "cc", "cr"): sub_agg[k] += b[k]
    rows.append((sid, main, sub_agg))

rows.sort(key=lambda r: (r[1]["cr"] + r[2]["cr"]), reverse=True)
print(f"{'sessao':10} {'inicio':16} {'horas':>5} {'turnos':>7} {'sub':>4} {'subturn':>8} "
      f"{'cacheRD':>9} {'cacheWR':>8} {'input':>7} {'output':>7} {'TOTAL_ctx':>10}")
tot = defaultdict(float)
for sid, m, s in rows:
    hrs = ((m["last"] - m["first"]).total_seconds() / 3600) if m["first"] and m["last"] else 0
    cr, cc, inp, out = m["cr"] + s["cr"], m["cc"] + s["cc"], m["inp"] + s["inp"], m["out"] + s["out"]
    if m["turns"] + s["turns"] == 0: continue
    print(f"{sid[:8]:10} {str(m['first'])[:16]:16} {hrs:5.1f} {m['turns']:7d} {s['n']:4d} "
          f"{s['turns']:8d} {h(cr):>9} {h(cc):>8} {h(inp):>7} {h(out):>7} {h(cr+cc+inp+out):>10}")
    for k, v in (("cr", cr), ("cc", cc), ("inp", inp), ("out", out),
                 ("turns", m["turns"]), ("subturns", s["turns"]), ("subs", s["n"]),
                 ("main_cr", m["cr"]), ("sub_cr", s["cr"]), ("main_out", m["out"]), ("sub_out", s["out"]),
                 ("main_cc", m["cc"]), ("sub_cc", s["cc"])):
        tot[k] += v
print("-" * 100)
T = tot["cr"] + tot["cc"] + tot["inp"] + tot["out"]
print(f"TOTAL      {'':16} {'':5} {int(tot['turns']):7d} {int(tot['subs']):4d} {int(tot['subturns']):8d} "
      f"{h(tot['cr']):>9} {h(tot['cc']):>8} {h(tot['inp']):>7} {h(tot['out']):>7} {h(T):>10}")
print(f"\nshare: cacheRD {tot['cr']/T*100:.1f}% | cacheWR {tot['cc']/T*100:.1f}% | "
      f"input {tot['inp']/T*100:.1f}% | output {tot['out']/T*100:.1f}%")
sub_tot = tot["sub_cr"] + tot["sub_cc"] + tot["sub_out"]
main_tot = tot["main_cr"] + tot["main_cc"] + tot["main_out"]
print(f"subagente vs loop principal (cacheRD+cacheWR+out): sub {h(sub_tot)} ({sub_tot/(sub_tot+main_tot)*100:.1f}%) "
      f"| main {h(main_tot)} ({main_tot/(sub_tot+main_tot)*100:.1f}%)")
print(f"turnos: main {int(tot['turns'])} | sub {int(tot['subturns'])} em {int(tot['subs'])} subagentes")
