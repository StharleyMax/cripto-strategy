// `T-02.4`, `CA-F2-5` — "eixo aguenta a carga real (RNF-2, herdado, [GAP G4]): coordenadas X
// vs event_time reais, janela de 4 dias — tolerância > 0,5 px ⇒ reprova, escalado como risco
// técnico maior". This is the SAME methodology `charts/s2-axis-integration.test.ts` already
// proves (`D8.19`, `axis-fidelity.ts`'s affine-anchor definition) — run here, under
// `src/app/symbol/`, because that is where `ADR-034/D8`'s barrel exception lives and this
// route's own falsifier belongs to `T-02.4`'s DoD, not `charts`'.
//
// `axis-fidelity.ts` itself is NOT imported: `ADR-034/D8`'s exception is "the barrel, and
// ONLY the barrel" — `eslint.config.mjs`'s `src/app/symbol/**` block applies to every file
// under this directory, `.test.ts` included (unlike the unrelated `ADR-005/D6.3` block, which
// DOES exclude tests) — so a deep `charts/axis-fidelity.ts` import here would be exactly the
// morde-1 case `eslint-boundary.test.ts` proves refused. The affine-anchor formula is
// therefore REIMPLEMENTED below, verbatim in spirit (same two-anchor calibration, same
// 0.5 px constant) — a ~15-line pure function, not a second geometry engine.
//
// DATA: this environment has no `data/binance/*` (raw data is gitignored,
// `CLAUDE.md`/"Dado bruto não é versionado" — confirmed absent here,
// `ls data/binance 2>&1` → ENOENT), so this test cannot read the real klines CSVs
// `s2-axis-integration.test.ts` uses. It builds a FULL-COVERAGE synthetic candle series
// instead — every one of the real 4-day/1-minute grid's 5,760 instants present, none
// fabricated as a value (a synthetic input, not a synthetic RESULT: the coordinates measured
// below are the library's own real output for that input) — at the EXACT SAME density and
// SPAN the real page requests (`resolveRouteWindow`, `request-window.ts`), so the axis is
// exercised under the real load this falsifier names, even though the VALUES are synthetic.
//
// The window is built HERE from a fixed clock reading instead of imported as a constant: the
// three constants this file used to import (`DAYS`/`RANGE_START_MS`/`RANGE_END_MS_EXCLUSIVE`)
// are gone, because a live route inheriting them asked `/series-history` for four days of
// 2026-08 while the data starts at 2026-09-04 (`ACHADO-SERIES-HISTORY-SEM-PONTO.md`, second
// defect). A test may pin its clock; production may not pin its window.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildS2Panels,
  candlestickSeriesColors,
  candlestickSeriesLossless,
  FIVE_MINUTES_MS,
  ONE_MINUTE_MS,
  resolveTrailingWindow,
  runHeadlessChart,
  S2_PRICE_USE,
  S2_WINDOW_SPAN_MS,
  type CandlestickItem,
  type WhitespaceItem,
} from "../../charts/index.ts";

/** The same 4-day span the route asks for, over a pinned clock reading — see this file's
 * header for why the window is derived here instead of imported. */
const WINDOW = resolveTrailingWindow({
  nowMs: Date.UTC(2026, 7, 24, 0, 0, 0),
  lagMs: 0,
  spanMs: S2_WINDOW_SPAN_MS,
  alignmentMs: FIVE_MINUTES_MS,
});
const DAYS = WINDOW.days;
const RANGE_START_MS = WINDOW.startMs;
const RANGE_END_MS_EXCLUSIVE = WINDOW.endMsExclusive;

const TOLERANCE_PX = 0.5;

interface CoordinateSample {
  readonly time: number;
  readonly actualX: number;
}

/** `charts/axis-fidelity.ts::expectedCoordinate`, reimplemented (not imported — see this
 * file's own header comment for why): the affine map from time to pixels calibrated on the
 * two EXTREME samples, so any non-zero error can only come from non-linearity, never from the
 * library's own padding/margins. */
function expectedCoordinate(time: number, early: CoordinateSample, late: CoordinateSample): number {
  return early.actualX + ((time - early.time) / (late.time - early.time)) * (late.actualX - early.actualX);
}

function worstErrorPx(samples: readonly CoordinateSample[]): number {
  const sorted = [...samples].sort((left, right) => left.time - right.time);
  const early = sorted[0]!;
  const late = sorted[sorted.length - 1]!;
  return Math.max(...sorted.map((sample) => Math.abs(sample.actualX - expectedCoordinate(sample.time, early, late))));
}

/** Full-coverage synthetic candles over the REAL 4-day/1-minute grid — every instant present,
 * value = an arbitrary-but-real number (the instant's own index), never a placeholder `0`
 * (irrelevant to axis fidelity, which only reads `time`, but kept honest anyway). */
function buildFullCoverageCandles(): { readonly openTimeMs: number; readonly open: number; readonly high: number; readonly low: number; readonly close: number; readonly volume: number }[] {
  const candles = [];
  let index = 0;
  for (let t = RANGE_START_MS; t < RANGE_END_MS_EXCLUSIVE; t += ONE_MINUTE_MS) {
    const value = 100 + index;
    candles.push({ openTimeMs: t, open: value, high: value, low: value, close: value, volume: 0 });
    index += 1;
  }
  return candles;
}

test("CA-F2-5: X coordinates for real event_time instants stay within 0.5px across the real 4-day/1-minute window", async () => {
  const candles = buildFullCoverageCandles();
  const expectedSlotCount = (RANGE_END_MS_EXCLUSIVE - RANGE_START_MS) / ONE_MINUTE_MS;
  assert.equal(candles.length, expectedSlotCount, `full coverage means exactly ${expectedSlotCount} candles, one per grid minute`);

  const pricePanel = buildS2Panels({
    window: WINDOW,
    candles,
    priceUse: S2_PRICE_USE,
    oiPoints: [],
    oiMissingDays: [...DAYS],
    cvdDeltas: [],
    cvdMissingDays: [...DAYS],
    cvdCoveredDays: [],
  }).price;
  assert.equal(pricePanel.series.slots.length, expectedSlotCount, "no gap: this is the full-coverage case");

  const items = candlestickSeriesLossless(pricePanel.series.slots);
  assert.equal(items.length, expectedSlotCount);
  assert.ok(
    items.every((item) => "close" in (item as CandlestickItem | WhitespaceItem)),
    "full coverage must produce zero WhitespaceItem — every slot is real here",
  );

  const handle = await runHeadlessChart([
    {
      label: "price",
      kind: "candlestick",
      items: items as unknown as readonly Record<string, unknown>[],
      style: candlestickSeriesColors("light"),
    },
  ]);
  try {
    assert.equal(handle.distinctTimeCount, expectedSlotCount);

    // Sample REAL `event_time` instants across the whole window — first, last, every day
    // boundary (`DAYS`), and the midpoint — rather than every one of the 5,760 slots: the
    // affine definition's worst case is always found strictly between the two anchors
    // (`axis-fidelity.ts`'s own documented corollary), and a handful of well-spread real
    // instants is enough to catch a non-linear axis without re-measuring all 5,760 points.
    const sampleTimesMs = [
      RANGE_START_MS,
      ...DAYS.map((day) => Date.parse(`${day}T00:00:00Z`)),
      RANGE_START_MS + Math.floor((RANGE_END_MS_EXCLUSIVE - RANGE_START_MS) / 2),
      RANGE_END_MS_EXCLUSIVE - ONE_MINUTE_MS,
    ].filter((t) => t >= RANGE_START_MS && t < RANGE_END_MS_EXCLUSIVE);

    const samples: CoordinateSample[] = sampleTimesMs.map((timeMs) => {
      const timeSeconds = timeMs / 1000;
      const actualX = handle.coordinateOf(timeSeconds);
      assert.ok(actualX !== null, `event_time ${timeMs} (a REAL grid instant) must resolve to a coordinate`);
      return { time: timeSeconds, actualX };
    });

    const worst = worstErrorPx(samples);
    assert.ok(
      worst <= TOLERANCE_PX,
      `worst X-coordinate error ${worst}px exceeds the ${TOLERANCE_PX}px tolerance (CA-F2-5) — universe: ` +
        `${samples.length} real event_time samples over ${expectedSlotCount} grid instants`,
    );
  } finally {
    handle.close();
  }
});
