// Disposable PILOT tool — not production code, outside the harness pipeline (scripts/** is not in
// code_paths). Generates ONE self-contained, OFFLINE HTML page (no server, no CDN, no Next.js) that
// implements the ADR-017 review loop over real BTCUSDT candles already ingested in data/.
//
// Chain of derivation (report §6.3, one link at a time):
//   swing  → fractal N, on klines_last, by wick, strict tie. N is per TF. CALIBRATED BY THE OWNER
//            on 2026-09-02 for 15m/N=5 and 1h/N=10 ("15 + 5 e 1h + 10 funcinou legal" — by eye,
//            JSON exported 2026-09-03 → docs/context/plataforma-dados/fixtures/). Other TFs stay UNCALIBRATED.
//   BOS    → close[t] > last CONFIRMED, still-active swing high (ADR-017/D6: break by CLOSE, one-shot).
//            wick[t] > ref with close[t] ≤ ref is a SWEEP: separate event, does not consume the reference.
//            break_by = wick stays behind the same flag, only for Pine parity (D3.4).
//   CHoCH  → first BOS against the trend state (2-state machine + undefined until the first BOS).
//   OB     → last opposite-colour candle before the displacement that produced a BOS/CHoCH; impulsive
//            iff |close_break − open_OB| ≥ k × ATR(14). Zone = [low, high]. Mitigation = touch.
//            OBs are CANDIDATES the human judges (accept / reject), same loop as swings.
//
// Keyboard is mandatory (T-08.9). Mouse only hovers / locks the crosshair (SPEC-001 §3.6 read mode).
//
// Usage:  node scripts/pilot-swing-marker/build.mjs
// Then:   open scripts/pilot-swing-marker/out/marcador.html (file://). Works OFFLINE: the chart
//         library is inlined from vendor/ (Lightweight Charts 5.2.1, Apache-2.0, TradingView).

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const OUT_DIR = join(HERE, "out");
const KLINES_DIR = join(REPO_ROOT, "data", "binance", "klines", "tf2");
const SYMBOL = "BTCUSDT";

const files = readdirSync(KLINES_DIR)
  .filter((f) => f.startsWith(`${SYMBOL}-1m-`) && f.endsWith(".csv"))
  .sort();
if (files.length === 0) throw new Error(`no ${SYMBOL}-1m-*.csv under ${KLINES_DIR}`);

const gridHasher = createHash("sha256");
const rows1m = [];
for (const f of files) {
  const text = readFileSync(join(KLINES_DIR, f), "utf8");
  gridHasher.update(text);
  const lines = text.trim().split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    const c = lines[i].split(",");
    // open_time,open,high,low,close,volume,close_time,...
    rows1m.push([Number(c[0]), Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4]), Number(c[5]), Number(c[6])]);
  }
}
rows1m.sort((a, b) => a[0] - b[0]);
const gridHash = gridHasher.digest("hex");
const knowledgeTimeMs = rows1m[rows1m.length - 1][6];

let gitRev = "unknown";
try {
  gitRev = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
} catch {
  /* not a git checkout */
}
const buildHash = createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex").slice(0, 12);
const codeVersion = `${gitRev}+build.${buildHash}`;

const LWC_SOURCE = readFileSync(join(HERE, "vendor", "lightweight-charts-5.2.1.standalone.production.js"), "utf8")
  .replace(/<\/script/gi, "<\\/script");

const meta = {
  schema: "q11-swing-review/2",
  symbol: SYMBOL,
  market: "binance-usdm-perp",
  price_source: "klines_last",
  grid: {
    tf_base: "1m",
    from: new Date(rows1m[0][0]).toISOString(),
    to: new Date(knowledgeTimeMs).toISOString(),
    bars_1m: rows1m.length,
    days: files.length,
    grid_hash: gridHash,
    knowledge_time: new Date(knowledgeTimeMs).toISOString(),
  },
  // Owner calibration, literal quote, 2026-09-02: "15 + 5 e 1h + 10 funcinou legal" (by eye).
  calibration: { "15m": { N: 5, by: "owner", date: "2026-09-02", method: "by_eye" }, "1h": { N: 10, by: "owner", date: "2026-09-02", method: "by_eye" } },
  code_version: codeVersion,
  source_files: files,
};

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Piloto Q11 — revisão de estrutura (ADR-017)</title>
<script>
${LWC_SOURCE}
</script>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; font-size: 13px; }
  header { padding: 6px 14px; border-bottom: 1px solid #30363d; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 14px; margin: 0; font-weight: 600; }
  .def { font-family: ui-monospace, monospace; font-size: 12px; color: #7ee787; }
  .warn { color: #ffa657; } .ok { color: #3fb950; }
  .muted { color: #8b949e; }
  kbd { font-family: ui-monospace, monospace; background: #21262d; border: 1px solid #30363d; border-radius: 4px; padding: 0 5px; font-size: 11px; }
  button.sel { padding: 3px 8px; border-radius: 5px; border: 1px solid #30363d; background: #161b22; color: #c9d1d9; cursor: pointer; font-size: 12px; margin-left: 3px; }
  button.sel.on { background: #388bfd33; border-color: #388bfd; color: #e6edf3; }
  #chart { width: 100%; height: 56vh; }
  #vol { width: 100%; height: 10vh; }
  #panel { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 12px; padding: 10px 14px; }
  .box { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 8px 10px; }
  .box h2 { font-size: 12px; margin: 0 0 6px; color: #8b949e; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  .mono { font-family: ui-monospace, monospace; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 2px 4px; border-bottom: 1px solid #21262d; }
  td:last-child { text-align: right; font-family: ui-monospace, monospace; }
  .row { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
  button.action { padding: 5px 9px; border-radius: 6px; border: 1px solid #30363d; background: #21262d; color: #e6edf3; cursor: pointer; font-size: 12px; }
  button.action:hover { background: #30363d; }
  input[type=text] { background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; padding: 4px 8px; font-size: 12px; }
  #help { position: fixed; inset: 0; background: rgba(1,4,9,.9); display: none; padding: 30px; overflow: auto; }
  #help.open { display: block; }
  #help .inner { max-width: 900px; margin: 0 auto; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 18px 24px; }
  #help td { border: none; padding: 3px 8px; }
  .acc { color: #3fb950; } .rej { color: #f85149; } .pend { color: #8b949e; } .add { color: #d2a8ff; } .cur { color: #f2cc60; }
  .layer-tab { padding: 3px 10px; border-radius: 5px; border: 1px solid #30363d; background: #161b22; color: #c9d1d9; cursor: pointer; font-size: 12px; }
  .layer-tab.on { background: #6e40c933; border-color: #8957e5; color: #e6edf3; }
</style>
</head>
<body>
<header>
  <h1>Piloto Q11 · estrutura</h1>
  <span class="muted">TF <span id="tf-buttons"></span></span>
  <span class="muted">N <span id="n-buttons"></span></span>
  <span class="muted">k·ATR <span id="k-buttons"></span></span>
  <span class="muted">camada <button class="layer-tab" data-layer="swing">swings <kbd>v</kbd></button><button class="layer-tab" data-layer="ob">order blocks</button></span>
  <span class="def" id="def-label"></span>
  <span class="muted" id="grid-label"></span>
  <span class="muted"><kbd>?</kbd> ajuda</span>
</header>
<div id="chart"></div>
<div id="vol"></div>
<div id="panel">
  <div class="box">
    <h2 id="current-title">candidato atual</h2>
    <div id="current" class="mono muted"></div>
    <div class="row">
      <button class="action" data-key="a">aceitar <kbd>a</kbd></button>
      <button class="action" data-key="r">rejeitar <kbd>r</kbd></button>
      <button class="action" data-key="x">limpar <kbd>x</kbd></button>
      <button class="action" data-key="u">desfazer <kbd>u</kbd></button>
      <button class="action" data-key="k">◀ <kbd>k</kbd></button>
      <button class="action" data-key="j">▶ <kbd>j</kbd></button>
      <button class="action" data-key="f">filtro: <span id="filter-label">todos</span> <kbd>f</kbd></button>
    </div>
    <div class="row muted">cursor: <span id="cursor-label" class="mono">—</span> · <kbd>Espaço</kbd> trava · <kbd>,</kbd>/<kbd>.</kbd> move · <kbd>h</kbd>/<kbd>l</kbd> acrescenta swing · <kbd>s</kbd> estrutura on/off</div>
  </div>
  <div class="box">
    <h2>métricas da camada (ADR-017/D3.3)</h2>
    <table id="metrics"></table>
  </div>
  <div class="box">
    <h2>estrutura derivada · saída</h2>
    <table id="structure"></table>
    <div class="row">
      <button class="action" id="btn-copy">Copiar JSON</button>
      <button class="action" id="btn-download">Baixar JSON</button>
      <button class="action" id="btn-import">Importar</button>
      <button class="action" id="btn-reset">Zerar definição</button>
      <input type="file" id="file-import" accept="application/json" hidden />
      <label class="muted">autor <input type="text" id="author" placeholder="quem julga" size="10" /></label>
    </div>
    <div id="out-summary" class="mono muted" style="margin-top:6px"></div>
  </div>
</div>

<div id="help"><div class="inner">
  <h2 style="margin-top:0">Como funciona (ADR-017, cadeia swing → BMS/CHoCH → OB)</h2>
  <p><b>Swing</b>: fractal N por pavio, em <code>klines_last</code>, empate estrito. Existe só no fechamento de <code>i+N</code>.
  15m/N=5 e 1h/N=10 estão <span class="ok">calibrados pelo owner (2026-09-02, a olho)</span>; os outros TFs não.
  <b>BMS</b> (= BOS): o <b>fechamento</b> de uma barra passa do último swing high confirmado e ainda ativo (one-shot). Pavio que passa e fecha dentro é <b>sweep</b>, evento separado que não consome a referência (ADR-017/D6).
  <b>CHoCH</b>: o primeiro BMS contra o estado de tendência. <b>OB</b>: o último candle de cor oposta antes do deslocamento que
  gerou o BMS/CHoCH, e só conta se <code>|close_rompimento − open_OB| ≥ k×ATR(14)</code>. Zona = [low, high]; mitigado ao primeiro toque.
  A estrutura é derivada dos swings <b>não rejeitados</b> + acréscimos: rejeitar um swing refaz BMS/CHoCH/OB.</p>
  <table>
    <tr><td><kbd>v</kbd></td><td>alterna camada de julgamento: swings ↔ order blocks</td><td><kbd>s</kbd></td><td>liga / desliga a camada de estrutura no gráfico</td></tr>
    <tr><td><kbd>j</kbd> / <kbd>k</kbd></td><td>próximo / anterior candidato da camada</td><td><kbd>g</kbd></td><td>primeiro pendente</td></tr>
    <tr><td><kbd>a</kbd> / <kbd>r</kbd></td><td>aceitar / rejeitar</td><td><kbd>x</kbd> / <kbd>u</kbd></td><td>limpar veredito / desfazer</td></tr>
    <tr><td><kbd>f</kbd></td><td>navegar só pendentes / todos</td><td><kbd>Espaço</kbd> <kbd>,</kbd> <kbd>.</kbd></td><td>travar cursor / mover ±1 barra</td></tr>
    <tr><td><kbd>h</kbd> / <kbd>l</kbd></td><td>acrescentar swing high / low no cursor</td><td><kbd>n</kbd> <kbd>N</kbd> · <kbd>t</kbd> <kbd>T</kbd></td><td>N · TF (5m·15m·1h·4h)</td></tr>
    <tr><td><kbd>[</kbd> / <kbd>]</kbd></td><td>k do impulso do OB (0,5 · 1 · 1,5 · 2 × ATR)</td><td><kbd>e</kbd></td><td>empate estrito ↔ inclusivo</td></tr>
    <tr><td><kbd>b</kbd></td><td>rompimento por <b>fechamento</b> (default, ADR-017/D6) ↔ pavio (só paridade Pine). Em fechamento, pavio que fecha dentro vira <b>sweep</b></td><td></td><td></td></tr>
  </table>
  <p class="muted">Métricas por camada: precision = aceitos ÷ (aceitos + rejeitados), com n. Na camada de swings, "recall relativo a N=k" =
  aceitos ÷ (aceitos + acréscimos), piso do que o gerador perdeu. Tudo fica salvo neste navegador por grade; baixe o JSON ao fim.</p>
</div></div>

<script>
const META = ${JSON.stringify(meta)};
const ROWS_1M = ${JSON.stringify(rows1m)};

const TFS = [["5m", 5], ["15m", 15], ["1h", 60], ["4h", 240]];
const NS = [2, 3, 5, 10, 20];
const KS = [0.5, 1, 1.5, 2];
const DEFAULT_N = { "5m": 5, "15m": 5, "1h": 10, "4h": 10 };
const STRUCT = { one_shot: true, initial_state: "undefined", atr_period: 14, atr_method: "sma", zone: "wick", mitigation: "touch", expiry_bars: 200, ob_lookback_bars: 30 };

const state = { tfIdx: 1, nIdx: NS.indexOf(5), kIdx: 1, tie: "strict", breakBy: "close", layer: "swing", showStructure: true,
  filterPending: false, cur: { swing: -1, ob: -1 }, lockedBar: null, hoverBar: null, undo: [] };
let rows = [], swings = [], structure = { events: [], sweeps: [], obs: [], labels: new Map() };
let store = { author: "", sessions: {} };

// ── resample (same bucketing as scripts/q11-swing-measure/measure_swings.py) ──
function resample(minutes) {
  const ms = minutes * 60000; const out = []; let cur = null;
  for (const r of ROWS_1M) {
    const k = r[0] - (r[0] % ms);
    if (!cur || cur[0] !== k) { cur = [k, r[1], r[2], r[3], r[4], r[5], r[6]]; out.push(cur); }
    else { cur[2] = Math.max(cur[2], r[2]); cur[3] = Math.min(cur[3], r[3]); cur[4] = r[4]; cur[5] += r[5]; cur[6] = r[6]; }
  }
  return out;
}

// ── swing detector: fractal N, wick, strict|inclusive. confirmed_at = close of bar i+N (no lookahead) ──
function fractal(bars, n, strict) {
  const out = [];
  for (let i = n; i < bars.length - n; i += 1) {
    let mh = -Infinity, ml = Infinity;
    for (let j = i - n; j <= i + n; j += 1) { if (j === i) continue; if (bars[j][2] > mh) mh = bars[j][2]; if (bars[j][3] < ml) ml = bars[j][3]; }
    const h = bars[i][2], lo = bars[i][3];
    if (h > mh || (!strict && h === mh)) out.push({ kind: "swing", type: "high", i, price: h, tie: h === mh });
    if (lo < ml || (!strict && lo === ml)) out.push({ kind: "swing", type: "low", i, price: lo, tie: lo === ml });
  }
  for (const c of out) { c.time = bars[c.i][0] / 1000; c.confirm_i = c.i + n; c.confirmed_at = new Date(bars[c.i + n][6]).toISOString(); }
  return out;
}

// ── ATR(14), simple mean of true range, causal ──
function atrSeries(bars, period) {
  const tr = bars.map((b, i) => i === 0 ? b[2] - b[3] : Math.max(b[2] - b[3], Math.abs(b[2] - bars[i - 1][4]), Math.abs(b[3] - bars[i - 1][4])));
  const out = new Array(bars.length).fill(null); let sum = 0;
  for (let i = 0; i < tr.length; i += 1) { sum += tr[i]; if (i >= period) sum -= tr[i - period]; if (i >= period - 1) out[i] = sum / period; }
  return out;
}

// ── structure: BOS/CHoCH state machine over the REVIEWED swing set, then OB candidates (report §6.3) ──
function deriveStructure(bars, reviewed, n, k, breakBy) {
  const atr = atrSeries(bars, STRUCT.atr_period);
  const byConfirm = [...reviewed].sort((a, b) => a.confirm_i - b.confirm_i);
  const events = [], sweeps = [], obs = [], labels = new Map();
  // HH/HL/LH/LL: each swing vs the previous swing of the same type, in bar order
  let prevH = null, prevL = null;
  for (const s of [...reviewed].sort((a, b) => a.i - b.i)) {
    if (s.type === "high") { labels.set(s.i + ":high", prevH == null ? "H" : s.price > prevH ? "HH" : "LH"); prevH = s.price; }
    else { labels.set(s.i + ":low", prevL == null ? "L" : s.price < prevL ? "LL" : "HL"); prevL = s.price; }
  }
  let trend = STRUCT.initial_state, refH = null, refL = null, p = 0;
  for (let t = 0; t < bars.length; t += 1) {
    // swings become KNOWN at their confirmation bar; the latest confirmed one is the active reference (Pine: UpdatedHigh/phActive)
    while (p < byConfirm.length && byConfirm[p].confirm_i <= t) { const s = byConfirm[p]; if (s.type === "high") refH = s; else refL = s; p += 1; }
    if (refH) {
      const byWick = bars[t][2] > refH.price, byClose = bars[t][4] > refH.price;
      if (breakBy === "close" ? byClose : byWick) {
        const kind = trend === "down" ? "CHoCH" : "BMS"; trend = "up";
        events.push({ kind, dir: "up", t, time: bars[t][0] / 1000, ref_i: refH.i, ref_time: refH.time, price: refH.price });
        pushOb(events[events.length - 1], "bull");
        refH = null; // one-shot
      } else if (breakBy === "close" && byWick) {
        sweeps.push({ dir: "up", t, time: bars[t][0] / 1000, ref_i: refH.i, price: refH.price }); // D6: rejection, keeps the reference
      }
    }
    if (refL) {
      const byWick = bars[t][3] < refL.price, byClose = bars[t][4] < refL.price;
      if (breakBy === "close" ? byClose : byWick) {
        const kind = trend === "up" ? "CHoCH" : "BMS"; trend = "down";
        events.push({ kind, dir: "down", t, time: bars[t][0] / 1000, ref_i: refL.i, ref_time: refL.time, price: refL.price });
        pushOb(events[events.length - 1], "bear");
        refL = null;
      } else if (breakBy === "close" && byWick) {
        sweeps.push({ dir: "down", t, time: bars[t][0] / 1000, ref_i: refL.i, price: refL.price });
      }
    }
  }
  function pushOb(ev, side) {
    // last opposite-colour candle before the displacement that produced the break
    const t = ev.t; let j = -1;
    for (let q = t - 1; q >= Math.max(0, t - STRUCT.ob_lookback_bars); q -= 1) {
      const bearish = bars[q][4] < bars[q][1], bullish = bars[q][4] > bars[q][1];
      if ((side === "bull" && bearish) || (side === "bear" && bullish)) { j = q; break; }
    }
    if (j < 0 || atr[t] == null) return;
    const move = Math.abs(bars[t][4] - bars[j][1]); const ratio = move / atr[t];
    if (ratio < k) return; // not impulsive
    const lo = bars[j][3], hi = bars[j][2]; let mitigated_i = null;
    for (let q = t + 1; q < Math.min(bars.length, t + 1 + STRUCT.expiry_bars); q += 1) {
      if ((side === "bull" && bars[q][3] <= hi) || (side === "bear" && bars[q][2] >= lo)) { mitigated_i = q; break; }
    }
    const end_i = mitigated_i ?? Math.min(bars.length - 1, t + STRUCT.expiry_bars);
    obs.push({ kind: "ob", side, i: j, time: bars[j][0] / 1000, low: lo, high: hi, event_kind: ev.kind, event_t: t, event_time: ev.time,
      impulse_atr: ratio, mitigated_i, mitigated_at: mitigated_i != null ? new Date(bars[mitigated_i][0]).toISOString() : null, end_i, end_time: bars[end_i][0] / 1000,
      confirmed_at: new Date(bars[t][6]).toISOString() });
  }
  return { events, sweeps, obs, labels };
}

// ── definitions & keys ──
function definition() {
  const [tf, minutes] = TFS[state.tfIdx]; const n = NS[state.nIdx];
  const cal = META.calibration[tf]; const calibrated = !!cal && cal.N === n;
  return { family: "fractal", N: n, tf, tf_minutes: minutes, extreme: "wick", tie_policy: state.tie, tol_ticks: 0,
    price_source: META.price_source, code_version: META.code_version, calibrated, calibration: calibrated ? cal : null };
}
function structDefinition() { return { ...STRUCT, break_by: state.breakBy, k_atr: KS[state.kIdx], swing_definition: defKey(definition()) }; }
function defKey(d) { return \`fractal:N\${d.N}:\${d.tf}:\${d.extreme}:\${d.tie_policy}:\${d.price_source}\`; }
function detectorKey(d) { return \`\${defKey(d)}|grid=\${META.grid.grid_hash.slice(0, 12)}|kt=\${META.grid.knowledge_time}\`; }
function candId(c) {
  if (c.kind === "swing") return \`\${c.type}@\${c.time}|\${defKey(definition())}\`;
  return \`ob:\${c.side}@\${c.time}|k\${KS[state.kIdx]}|\${state.breakBy}|\${defKey(definition())}\`;
}
function session() {
  const key = defKey(definition());
  if (!store.sessions[key]) store.sessions[key] = { swing_definition: definition(), detector_key: detectorKey(definition()), candidates_n: 0,
    verdicts: [], ob_verdicts: [], first_judged_at: null, last_judged_at: null };
  const s = store.sessions[key]; s.ob_verdicts ||= []; return s;
}
function verdictList(kind) { return kind === "swing" ? session().verdicts : session().ob_verdicts; }
function verdictOf(c) { return verdictList(c.kind).find((v) => v.candidate_id === candId(c)); }
function layerCands() { return state.layer === "swing" ? swings : structure.obs; }

const LS_KEY = "q11-swing-review:" + META.grid.grid_hash.slice(0, 16);
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch {} }
function load() { try { const s = localStorage.getItem(LS_KEY); if (s) store = JSON.parse(s); } catch {} }

// ── chart ──
const chart = LightweightCharts.createChart(document.getElementById("chart"), {
  layout: { background: { color: "#0d1117" }, textColor: "#c9d1d9" },
  grid: { vertLines: { color: "#161b22" }, horzLines: { color: "#161b22" } },
  timeScale: { timeVisible: true, secondsVisible: false }, crosshair: { mode: 0 },
});
const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, { upColor: "#26a69a", downColor: "#ef5350", borderVisible: false, wickUpColor: "#26a69a", wickDownColor: "#ef5350" });
const volChart = LightweightCharts.createChart(document.getElementById("vol"), {
  layout: { background: { color: "#0d1117" }, textColor: "#c9d1d9" }, grid: { vertLines: { color: "#161b22" }, horzLines: { color: "#161b22" } }, timeScale: { visible: false },
});
const volSeries = volChart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: "volume" } });
chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (r) volChart.timeScale().setVisibleLogicalRange(r); });
const markers = LightweightCharts.createSeriesMarkers(candleSeries, []);
const structSeries = new Map(); // id -> series (BMS/CHoCH lines and OB boxes)

function loadTf() {
  rows = resample(TFS[state.tfIdx][1]);
  candleSeries.setData(rows.map((r) => ({ time: r[0] / 1000, open: r[1], high: r[2], low: r[3], close: r[4] })));
  volSeries.setData(rows.map((r) => ({ time: r[0] / 1000, value: r[5], color: r[4] >= r[1] ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)" })));
  chart.timeScale().fitContent(); state.lockedBar = null; state.hoverBar = null; chart.clearCrosshairPosition();
}
function reviewedSwings() {
  const d = definition(); const rej = new Set(session().verdicts.filter((v) => v.verdict === "reject").map((v) => v.candidate_id));
  const kept = swings.filter((c) => !rej.has(candId(c)));
  const adds = session().verdicts.filter((v) => v.verdict === "add").map((v) => {
    const i = rows.findIndex((r) => r[0] === new Date(v.time).getTime()); if (i < 0) return null;
    return { kind: "swing", type: v.type, i, price: v.price, time: rows[i][0] / 1000, confirm_i: Math.min(rows.length - 1, i + d.N), added: true };
  }).filter(Boolean);
  return kept.concat(adds);
}
function runDetector() {
  const d = definition();
  swings = fractal(rows, d.N, d.tie_policy === "strict");
  const s = session(); s.candidates_n = swings.length; s.swing_definition = d; s.detector_key = detectorKey(d);
  rebuildStructure();
  state.cur.swing = swings.length ? 0 : -1; state.cur.ob = structure.obs.length ? 0 : -1;
  goFirstPending(true);
}
function rebuildStructure() {
  structure = deriveStructure(rows, reviewedSwings(), definition().N, KS[state.kIdx], state.breakBy);
  session().structure_definition = structDefinition();
  session().structure_summary = { events: structure.events.length, bms: structure.events.filter((e) => e.kind === "BMS").length,
    choch: structure.events.filter((e) => e.kind === "CHoCH").length, sweeps: structure.sweeps.length, ob_candidates: structure.obs.length };
  if (state.cur.ob >= structure.obs.length) state.cur.ob = structure.obs.length - 1;
}

// ── navigation ──
function visible(c) { return !state.filterPending || !verdictOf(c); }
function step(dir) {
  const cands = layerCands(); if (!cands.length) return;
  let i = state.cur[state.layer];
  for (let k = 0; k < cands.length; k += 1) { i = (i + dir + cands.length) % cands.length; if (visible(cands[i])) { state.cur[state.layer] = i; break; } }
  centerOnCurrent(); render();
}
function goFirstPending(centre = true) {
  const cands = layerCands(); const i = cands.findIndex((c) => !verdictOf(c));
  if (i >= 0) state.cur[state.layer] = i; else if (cands.length && state.cur[state.layer] < 0) state.cur[state.layer] = 0;
  if (centre) centerOnCurrent(); render();
}
function current() { const cands = layerCands(); return cands[state.cur[state.layer]]; }
function centerOnCurrent() {
  const c = current(); if (!c) return;
  const r = chart.timeScale().getVisibleLogicalRange();
  const half = r && r.to - r.from <= 300 ? Math.max(20, (r.to - r.from) / 2) : 60;
  const centre = c.kind === "ob" ? (c.i + c.event_t) / 2 : c.i;
  chart.timeScale().setVisibleLogicalRange({ from: centre - half, to: centre + half });
}

// ── judging ──
const nowIso = () => new Date().toISOString();
function touchSession(s) { s.first_judged_at = s.first_judged_at || nowIso(); s.last_judged_at = nowIso(); }
function judge(verdict) {
  const c = current(); if (!c) return;
  const s = session(); const list = verdictList(c.kind); const id = candId(c); const prev = list.find((v) => v.candidate_id === id);
  state.undo.push({ key: defKey(definition()), kind: c.kind, prev: prev ? { ...prev } : null, id });
  const kept = list.filter((v) => v.candidate_id !== id); list.length = 0; list.push(...kept);
  if (verdict) {
    const base = { candidate_id: id, verdict, provenance: "DETECTOR", judged_at: nowIso(), confirmed_at: c.confirmed_at };
    if (c.kind === "swing") list.push({ ...base, type: c.type, time: new Date(c.time * 1000).toISOString(), price: c.price });
    else list.push({ ...base, side: c.side, time: new Date(c.time * 1000).toISOString(), zone: [c.low, c.high], event_kind: c.event_kind,
      event_time: new Date(c.event_time * 1000).toISOString(), impulse_atr: c.impulse_atr, k_atr: KS[state.kIdx], mitigated_at: c.mitigated_at });
    touchSession(s);
  }
  save();
  if (c.kind === "swing") rebuildStructure(); // rejecting a swing reshapes BMS/CHoCH/OB
  if (verdict) step(+1); else render();
}
function addSwing(type) {
  if (state.layer !== "swing") { state.layer = "swing"; }
  const bar = state.lockedBar ?? state.hoverBar; if (bar == null || !rows[bar]) return;
  const time = rows[bar][0] / 1000;
  const existing = swings.findIndex((c) => c.time === time && c.type === type);
  if (existing >= 0) { state.cur.swing = existing; judge("accept"); return; }
  const s = session(); const id = \`\${type}@\${time}|ADD|\${defKey(definition())}\`;
  if (s.verdicts.some((v) => v.candidate_id === id)) return;
  state.undo.push({ key: defKey(definition()), kind: "swing", prev: null, id });
  s.verdicts.push({ candidate_id: id, verdict: "add", type, time: new Date(time * 1000).toISOString(), price: type === "high" ? rows[bar][2] : rows[bar][3],
    confirmed_at: null, provenance: "HUMANO", judged_at: nowIso() });
  touchSession(s); save(); rebuildStructure(); render();
}
function undo() {
  const u = state.undo.pop(); if (!u) return; const s = store.sessions[u.key]; if (!s) return;
  const list = u.kind === "swing" ? s.verdicts : (s.ob_verdicts ||= []);
  const kept = list.filter((v) => v.candidate_id !== u.id); list.length = 0; list.push(...kept); if (u.prev) list.push(u.prev);
  save(); if (u.kind === "swing") rebuildStructure(); render();
}

// ── cursor lock (SPEC-001 §3.6) ──
chart.subscribeCrosshairMove((p) => { if (p.logical != null) state.hoverBar = Math.round(p.logical); });
chart.subscribeClick(() => toggleLock());
function toggleLock() {
  if (state.lockedBar != null) { state.lockedBar = null; chart.clearCrosshairPosition(); }
  else if (state.hoverBar != null && rows[state.hoverBar]) { state.lockedBar = state.hoverBar; placeCursor(); }
  render();
}
function moveLocked(d) { if (state.lockedBar == null) return; state.lockedBar = Math.min(rows.length - 1, Math.max(0, state.lockedBar + d)); placeCursor(); render(); }
function placeCursor() { const r = rows[state.lockedBar]; chart.setCrosshairPosition(r[4], r[0] / 1000, candleSeries); }

// ── metrics per layer ──
function metrics(kind) {
  const s = session(); const list = kind === "swing" ? s.verdicts : s.ob_verdicts; const total = kind === "swing" ? swings.length : structure.obs.length;
  const acc = list.filter((v) => v.verdict === "accept").length, rej = list.filter((v) => v.verdict === "reject").length, adds = list.filter((v) => v.verdict === "add").length;
  const n = acc + rej; const pend = total - n;
  const el = s.first_judged_at && s.last_judged_at ? (new Date(s.last_judged_at) - new Date(s.first_judged_at)) / 60000 : 0;
  const all = s.verdicts.length + s.ob_verdicts.length; const rate = el > 0 ? all / el : null;
  return { candidates: total, accepted: acc, rejected: rej, pending: pend, adds, n, precision: n ? acc / n : null,
    recall_relative_to_generator: kind === "swing" && acc + adds ? acc / (acc + adds) : null, elapsed_min: el, judgments_per_min: rate,
    eta_pending_min: rate ? pend / rate : null };
}

// ── render ──
const fmtT = (sec) => new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + "Z";
const pct = (x) => (x == null ? "—" : (x * 100).toFixed(1) + " %");
function syncStructureSeries() {
  const want = new Map(); const cur = current();
  if (state.showStructure) {
    for (const e of structure.events) want.set(\`ev:\${e.dir}:\${e.time}\`, () => {
      const s = chart.addSeries(LightweightCharts.LineSeries, { color: e.kind === "CHoCH" ? "#f2cc60" : "#c9d1d9", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData([{ time: e.ref_time, value: e.price }, { time: e.time, value: e.price }]); return s;
    });
    for (const o of structure.obs) want.set(\`ob:\${o.side}:\${o.time}\`, () => {
      const s = chart.addSeries(LightweightCharts.BaselineSeries, { baseValue: { type: "price", price: o.low }, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        topLineColor: "transparent", bottomLineColor: "transparent", bottomFillColor1: "transparent", bottomFillColor2: "transparent" });
      const pts = []; for (let q = o.i; q <= o.end_i; q += 1) pts.push({ time: rows[q][0] / 1000, value: o.high }); s.setData(pts); return s;
    });
  }
  for (const [id, s] of structSeries) if (!want.has(id)) { chart.removeSeries(s); structSeries.delete(id); }
  for (const [id, mk] of want) if (!structSeries.has(id)) structSeries.set(id, mk());
  for (const o of structure.obs) {
    const s = structSeries.get(\`ob:\${o.side}:\${o.time}\`); if (!s) continue;
    const v = verdictOf(o); const isCur = state.layer === "ob" && cur === o;
    const rgb = isCur ? "242,204,96" : v?.verdict === "accept" ? (o.side === "bull" ? "63,185,80" : "248,81,73") : v?.verdict === "reject" ? "110,118,129" : (o.side === "bull" ? "121,192,255" : "255,161,152");
    const a = v?.verdict === "reject" ? 0.08 : isCur ? 0.35 : 0.18;
    s.applyOptions({ topFillColor1: \`rgba(\${rgb},\${a})\`, topFillColor2: \`rgba(\${rgb},\${a})\`, topLineColor: \`rgba(\${rgb},\${isCur ? 1 : 0.6})\` });
  }
}
function render() {
  const d = definition(); const m = metrics(state.layer); const s = session(); const cur = current();
  document.getElementById("def-label").textContent =
    \`fractal · N=\${d.N} · \${d.tf} · empate \${d.tie_policy === "strict" ? "estrito" : "inclusivo"} · pavio · \${d.price_source} · latência \${d.N * d.tf_minutes} min · rompimento por \${state.breakBy === "close" ? "FECHAMENTO" : "pavio (paridade Pine)"} · OB k=\${KS[state.kIdx]}×ATR14\`;
  const cal = d.calibrated ? \` · ✓ calibrado (owner \${d.calibration.date}, a olho)\` : " · ⚠ N não calibrado";
  const warn = d.tf === "4h" ? " · ⚠ 4h fora da calibração (8 dias ≈ 3 swings)" : "";
  document.getElementById("grid-label").textContent =
    \`\${META.symbol} · \${META.grid.days} dias (\${META.grid.from.slice(0, 10)}→\${META.grid.to.slice(0, 10)}) · \${rows.length} barras de \${d.tf}\${cal}\${warn}\`;
  document.getElementById("tf-buttons").innerHTML = TFS.map(([tf], i) => \`<button class="sel\${i === state.tfIdx ? " on" : ""}" data-tf="\${i}">\${tf}</button>\`).join("");
  document.getElementById("n-buttons").innerHTML = NS.map((n, i) => \`<button class="sel\${i === state.nIdx ? " on" : ""}" data-n="\${i}">\${n}</button>\`).join("");
  document.getElementById("k-buttons").innerHTML = KS.map((k, i) => \`<button class="sel\${i === state.kIdx ? " on" : ""}" data-k="\${i}">\${k}</button>\`).join("");
  document.querySelectorAll("button[data-tf]").forEach((b) => { b.onclick = () => { state.tfIdx = Number(b.dataset.tf); state.nIdx = NS.indexOf(DEFAULT_N[TFS[state.tfIdx][0]]); loadTf(); runDetector(); }; });
  document.querySelectorAll("button[data-n]").forEach((b) => { b.onclick = () => { state.nIdx = Number(b.dataset.n); runDetector(); }; });
  document.querySelectorAll("button[data-k]").forEach((b) => { b.onclick = () => { state.kIdx = Number(b.dataset.k); rebuildStructure(); goFirstPending(false); }; });
  document.querySelectorAll(".layer-tab").forEach((b) => { b.classList.toggle("on", b.dataset.layer === state.layer); b.onclick = () => { state.layer = b.dataset.layer; goFirstPending(true); }; });
  document.getElementById("filter-label").textContent = state.filterPending ? "só pendentes" : "todos";
  document.getElementById("cursor-label").textContent = state.lockedBar != null ? fmtT(rows[state.lockedBar][0] / 1000) : "—";

  // swing markers with HH/HL/LH/LL labels from the reviewed set
  const swingMarkers = swings.map((c, i) => {
    const v = verdictOf(c); const isCur = state.layer === "swing" && i === state.cur.swing; const lab = structure.labels.get(c.i + ":" + c.type) || (c.type === "high" ? "H" : "L");
    const color = isCur ? "#f2cc60" : v?.verdict === "accept" ? "#3fb950" : v?.verdict === "reject" ? "#6e7681" : (c.type === "high" ? "#79c0ff" : "#ffa198");
    return { time: c.time, position: c.type === "high" ? "aboveBar" : "belowBar", shape: v?.verdict === "reject" ? "square" : v ? (c.type === "high" ? "arrowDown" : "arrowUp") : "circle",
      color, size: isCur ? 2 : 1, text: v?.verdict === "reject" ? "" : (isCur ? "▶" : "") + (state.showStructure ? lab : (c.type === "high" ? "H" : "L")) };
  }).concat(s.verdicts.filter((v) => v.verdict === "add").map((v) => ({ time: new Date(v.time).getTime() / 1000, position: v.type === "high" ? "aboveBar" : "belowBar",
    shape: v.type === "high" ? "arrowDown" : "arrowUp", color: "#d2a8ff", text: v.type === "high" ? "+H" : "+L" })));
  const eventMarkers = state.showStructure ? structure.events.map((e) => ({ time: e.time, position: e.dir === "up" ? "aboveBar" : "belowBar", shape: "square", size: 0,
    color: e.kind === "CHoCH" ? "#f2cc60" : "#c9d1d9", text: e.kind + (e.dir === "up" ? "↑" : "↓") })) : [];
  const sweepMarkers = state.showStructure ? structure.sweeps.map((w) => ({ time: w.time, position: w.dir === "up" ? "aboveBar" : "belowBar", shape: "square", size: 0,
    color: "#8b949e", text: "sweep" })) : [];
  markers.setMarkers(swingMarkers.concat(eventMarkers, sweepMarkers).sort((a, b) => a.time - b.time));
  syncStructureSeries();

  document.getElementById("current-title").textContent = state.layer === "swing" ? "candidato atual · swing" : "candidato atual · order block";
  const vcur = cur && verdictOf(cur); const vtxt = vcur ? \`<span class="\${vcur.verdict === "accept" ? "acc" : "rej"}">\${vcur.verdict}</span>\` : '<span class="pend">pendente</span>';
  document.getElementById("current").innerHTML = !cur ? '<span class="muted">nenhum candidato nesta camada para esta definição</span>'
    : cur.kind === "swing" ? \`<div><span class="cur">#\${state.cur.swing + 1}/\${swings.length}</span> · <b>\${cur.type.toUpperCase()}</b> · rótulo \${structure.labels.get(cur.i + ":" + cur.type) || "—"} \${cur.tie ? '<span class="warn">(empate)</span>' : ""}</div>
       <div>barra \${fmtT(cur.time)} · preço \${cur.price}</div><div class="muted">confirmado em \${cur.confirmed_at.replace("T", " ").slice(0, 16)}Z (fechamento de i+N)</div><div>veredito: \${vtxt}</div>\`
    : \`<div><span class="cur">#\${state.cur.ob + 1}/\${structure.obs.length}</span> · <b>OB \${cur.side === "bull" ? "de alta" : "de baixa"}</b> · gerado por <b>\${cur.event_kind}</b> em \${fmtT(cur.event_time)}</div>
       <div>candle \${fmtT(cur.time)} · zona [\${cur.low}, \${cur.high}] · impulso \${cur.impulse_atr.toFixed(2)}×ATR (k=\${KS[state.kIdx]})</div>
       <div class="muted">\${cur.mitigated_at ? "mitigado em " + cur.mitigated_at.replace("T", " ").slice(0, 16) + "Z" : "não mitigado até o fim da grade / expiração"}</div><div>veredito: \${vtxt}</div>\`;

  document.getElementById("metrics").innerHTML = [
    [\`candidatos (\${state.layer === "swing" ? "swings" : "OBs"})\`, m.candidates], ["aceitos", m.accepted], ["rejeitados", m.rejected], ["pendentes", m.pending],
    ...(state.layer === "swing" ? [["acréscimos (HUMANO)", m.adds]] : []),
    [\`precision (n=\${m.n})\`, pct(m.precision)],
    ...(state.layer === "swing" ? [[\`recall <i>relativo a N=\${d.N}</i> (piso)\`, pct(m.recall_relative_to_generator)]] : []),
    ["tempo julgando (sessão)", m.elapsed_min.toFixed(1) + " min"], ["julgamentos / min", m.judgments_per_min ? m.judgments_per_min.toFixed(2) : "—"],
    ["ETA pendentes", m.eta_pending_min != null ? m.eta_pending_min.toFixed(0) + " min" : "—"],
  ].map(([k, v]) => \`<tr><td>\${k}</td><td>\${v}</td></tr>\`).join("");

  const ss = s.structure_summary || {}; const rejN = s.verdicts.filter((v) => v.verdict === "reject").length;
  document.getElementById("structure").innerHTML = [
    ["camada de estrutura", state.showStructure ? "ligada" : "desligada"], ["swings no conjunto revisado", swings.length - rejN + s.verdicts.filter((v) => v.verdict === "add").length],
    ["BMS", ss.bms ?? 0], ["CHoCH", ss.choch ?? 0], ["sweeps (pavio além, fecha dentro)", state.breakBy === "close" ? (ss.sweeps ?? 0) : "— (modo pavio funde com BMS)"], ["OB candidatos (k=" + KS[state.kIdx] + ")", ss.ob_candidates ?? 0],
    ["rompimento", (state.breakBy === "close" ? "fechamento (ADR-017/D6)" : "pavio, paridade Pine") + " · one-shot"], ["OB", "zona [low,high] · mitiga no toque · expira " + STRUCT.expiry_bars + " barras"],
  ].map(([k, v]) => \`<tr><td>\${k}</td><td>\${v}</td></tr>\`).join("");
  const sess = Object.values(store.sessions).filter((x) => x.verdicts.length || (x.ob_verdicts || []).length);
  document.getElementById("out-summary").textContent = \`\${sess.length} definição(ões) julgada(s) · \${sess.reduce((a, x) => a + x.verdicts.length + (x.ob_verdicts || []).length, 0)} vereditos · autor: \${store.author || "—"} · code \${META.code_version}\`;
}

// ── export / import ──
function exportJson() {
  return JSON.stringify({ ...META, author: store.author || null, exported_at: nowIso(),
    sessions: Object.values(store.sessions).map((x) => ({ ...x, metrics: x === session() ? { swing: metrics("swing"), ob: metrics("ob") } : undefined })) }, null, 2);
}
document.getElementById("btn-copy").onclick = () => navigator.clipboard.writeText(exportJson());
document.getElementById("btn-download").onclick = () => {
  const blob = new Blob([exportJson()], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = \`swing-review-\${META.symbol}-\${META.grid.grid_hash.slice(0, 8)}.json\`; a.click(); URL.revokeObjectURL(url);
};
document.getElementById("btn-import").onclick = () => document.getElementById("file-import").click();
document.getElementById("file-import").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return; const j = JSON.parse(await f.text());
  if (j.grid?.grid_hash !== META.grid.grid_hash) { alert("JSON de outra grade (grid_hash difere) — recusado"); return; }
  for (const x of j.sessions || []) store.sessions[defKey(x.swing_definition)] = x; if (j.author) store.author = j.author;
  save(); rebuildStructure(); render();
};
document.getElementById("btn-reset").onclick = () => { if (!confirm("Apagar os vereditos desta definição (swings e OBs)? As outras ficam.")) return; delete store.sessions[defKey(definition())]; save(); runDetector(); };
document.getElementById("author").onchange = (e) => { store.author = e.target.value.trim(); save(); render(); };

// ── keyboard (mandatory path) ──
document.querySelectorAll("button[data-key]").forEach((b) => { b.onclick = () => handleKey(b.dataset.key, false); });
document.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT") return; if (handleKey(e.key, e.shiftKey)) e.preventDefault(); });
function handleKey(key) {
  const help = document.getElementById("help");
  switch (key) {
    case "?": help.classList.toggle("open"); return true;
    case "Escape": help.classList.remove("open"); return true;
    case "j": case "ArrowRight": step(+1); return true;
    case "k": case "ArrowLeft": step(-1); return true;
    case "a": judge("accept"); return true;
    case "r": judge("reject"); return true;
    case "x": judge(null); return true;
    case "u": undo(); return true;
    case "f": state.filterPending = !state.filterPending; render(); return true;
    case "g": goFirstPending(); return true;
    case "v": state.layer = state.layer === "swing" ? "ob" : "swing"; goFirstPending(true); return true;
    case "s": state.showStructure = !state.showStructure; render(); return true;
    case " ": toggleLock(); return true;
    case ",": moveLocked(-1); return true;
    case ".": moveLocked(+1); return true;
    case "h": addSwing("high"); return true;
    case "l": addSwing("low"); return true;
    case "n": state.nIdx = (state.nIdx + 1) % NS.length; runDetector(); return true;
    case "N": state.nIdx = (state.nIdx - 1 + NS.length) % NS.length; runDetector(); return true;
    case "t": state.tfIdx = (state.tfIdx + 1) % TFS.length; state.nIdx = NS.indexOf(DEFAULT_N[TFS[state.tfIdx][0]]); loadTf(); runDetector(); return true;
    case "T": state.tfIdx = (state.tfIdx - 1 + TFS.length) % TFS.length; state.nIdx = NS.indexOf(DEFAULT_N[TFS[state.tfIdx][0]]); loadTf(); runDetector(); return true;
    case "[": state.kIdx = Math.max(0, state.kIdx - 1); rebuildStructure(); goFirstPending(false); return true;
    case "]": state.kIdx = Math.min(KS.length - 1, state.kIdx + 1); rebuildStructure(); goFirstPending(false); return true;
    case "e": state.tie = state.tie === "strict" ? "inclusive" : "strict"; runDetector(); return true;
    case "b": state.breakBy = state.breakBy === "close" ? "wick" : "close"; rebuildStructure(); goFirstPending(false); return true;
    default: return false;
  }
}

load();
document.getElementById("author").value = store.author || "";
loadTf();
runDetector();
</script>
</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "marcador.html");
writeFileSync(outPath, html);
console.log(`wrote ${outPath}`);
console.log(`  ${SYMBOL} 1m · ${files.length} days · ${rows1m.length} bars · grid_hash ${gridHash.slice(0, 16)}… · code ${codeVersion}`);
console.log(`  calibration: 15m/N=5, 1h/N=10 (owner, 2026-09-02, by eye) · knowledge_time ${meta.grid.knowledge_time}`);
