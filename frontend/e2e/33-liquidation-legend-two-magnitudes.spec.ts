/**
 * `paineis-de-fluxo` `T-04.3` (plan `04` item `4.3`; `RF-10`, `RN-3`, `RN-4`; `SPEC-009` §7.3 and
 * `C-7` of `gates/DESIGN-LAYOUT-ux-critique-r2.md`) — THE LEGEND OF THE FUSED LIQUIDATION PANE, READ
 * IN THE REAL APP, IN PIXELS, WITH AND WITHOUT `forced-colors`, WITH THE ABLATIONS.
 *
 * Same arrangement as `e2e/32`: the production page (`next start` of the gate's build) served by a
 * stub API that returns the REAL catalog of the e2e API and synthetic values — **nothing is seeded in
 * the shared Postgres**. The stub gives each leg its OWN pattern of the three states (`RN-4`, `SPEC-009`
 * §7.3: bar / zero / absent, per bucket AND per leg), on periods 3 and 5 so every combination of the
 * two legs is on screen within 15 minutes: `long` is absent on `m % 3 = 1` and zero on `m % 3 = 2`;
 * `short` is absent on `m % 5 = 2` and zero on `m % 5 = 4`. Where both are present, `short` is in the
 * `50.000` range and `long` in `2..12`, so `|long − short|` and `long + short` are numbers nobody can
 * mistake for either leg.
 *
 * ── WHAT THE SPEC ASSERTS ───────────────────────────────────────────────────────────────────────
 *
 *   (a) the square: each leg's value is led by an 8×8 CSS px square, the numeral's immediate
 *       predecessor; the upper leg's (`short`) is HOLLOW in the rise token, the lower leg's (`long`)
 *       FILLED in the fall token — read in the PIXELS of a screenshot, not in the style attribute;
 *   (b) `C-7`: with `forced-colors: active`, the filled square is still filled, the hollow one still
 *       hollow, each still in its leg's ink and at `>= 3:1` against the plot (WCAG 1.4.11) — the
 *       square sits on the chart's canvas, which forced colours never repaint. TWO ABLATIONS, each
 *       also a proof that the emulation reached the renderer: (1) a filled square made the obvious way
 *       (1px border + `background`, no `forced-color-adjust`) passes the plain reading and is REJECTED
 *       under forced colours (Chromium repaints the fill white); (2) the right geometry with the ink
 *       left to the system is REJECTED (black border on `#131722`, ~1.2:1);
 *   (c) the numeral is in NEUTRAL ink: its computed colour is `on-surface`, and 0 of its pixels are in
 *       either direction token (`STITCH_CONTEXT.md` D14);
 *   (d) two magnitudes, per leg: under the crosshair, each leg's numeral is the stub's value for THAT
 *       leg at THAT bucket — `0` where the leg served a zero, `ausente` where it served no row — never
 *       signed; every state of each leg is seen, and a bucket with one leg absent and the other present;
 *   (e) no third number: exactly 2 visible numerals in the pane; the other numeric tokens of its
 *       visible text do not move with the crosshair (they are not readings); none equals
 *       `|long − short|` or `long + short`. ABLATION: the difference, injected into a legend line, is
 *       REJECTED by the same check.
 */

import http from "node:http";

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { colorTokens } from "../src/charts/color-tokens.ts";
import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";
import { showView } from "./view.ts";

const SPEC = "33-liquidation-legend-two-magnitudes";
const SYMBOL_PATH = "/symbol/BTCUSDT";
const CHART_HOST_TESTID = "symbol-chart-host";
const PANE_TESTID = "liquidation-pane";
const ONE_MINUTE_MS = 60_000;
const SWATCH_PX = 8;
/** `--color-on-surface` (`globals.css`) = `provenanceStrong`. */
const NEUTRAL_INK = colorTokens().provenanceStrong;
const UP_INK = colorTokens().directionUpFill;
const DOWN_INK = colorTokens().directionDownFill;
const PIXEL_TOLERANCE = 28;
const ABSENCE_WORD = "ausente";
const SWEEP_STEP_PX = 0.5;
/** The ablation of `C-7`: the filled square drawn with a background, the way `C-7` warns against. */
const FILLED_BY_BACKGROUND_CSS = `[data-liquidation-swatch="filled"] { border-width: 1px !important; background-color: ${DOWN_INK} !important; forced-color-adjust: auto !important; }`;
/** The ablation of the ink: the right geometry, colours left to the system. */
const REPAINTED_INK_CSS = `[data-liquidation-swatch] { forced-color-adjust: auto !important; }`;
/** WCAG 1.4.11 (non-text contrast): a mark that carries meaning needs 3:1 against its backdrop. */
const MIN_MARK_CONTRAST = 3;

type Cohort = "short" | "long";
const COHORTS: readonly Cohort[] = ["short", "long"];

interface CatalogEnvelope {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly { readonly key: SeriesKey; readonly [field: string]: unknown }[];
}

function wave(minute: number, salt: number): number {
  return (((minute * 37 + salt * 101) % 997) + 997) % 997;
}

/** What the stub serves for one leg at one bucket: no row (`null`) or the value. */
function liquidationLeg(cohort: Cohort, bucketMs: number): number | null {
  const minute = Math.round(bucketMs / ONE_MINUTE_MS);
  if (cohort === "long") {
    const phase = ((minute % 3) + 3) % 3;
    if (phase === 1) return null;
    if (phase === 2) return 0;
    return 2 + wave(minute, 4) / 100;
  }
  const phase = ((minute % 5) + 5) % 5;
  if (phase === 2) return null;
  if (phase === 4) return 0;
  return 50_000 + wave(minute, 5);
}

/** Every other series of the page on every minute, so no pane is empty (as `e2e/32`). */
function syntheticValue(key: SeriesKey, bucketMs: number): string | null {
  const minute = Math.round(bucketMs / ONE_MINUTE_MS);
  const close = (m: number) => 100 + wave(m, 1) / 4;
  switch (key.metric) {
    case "klines_ohlc": {
      const open = close(minute - 1);
      const last = close(minute);
      if (key.reduction === "OPEN") return String(open);
      if (key.reduction === "HIGH") return String(Math.max(open, last) + 0.5);
      if (key.reduction === "LOW") return String(Math.min(open, last) - 0.5);
      return String(last);
    }
    case "klines_volume":
      return String(10 + wave(minute, 2) / 4);
    case "cvd_source":
      return String(wave(minute, 3) - 498);
    case "sum_liquidation": {
      const value = liquidationLeg(key.cohort === "short" ? "short" : "long", bucketMs);
      return value === null ? null : String(value);
    }
    case "sum_open_interest":
      return String(50_000 + wave(Math.floor(minute / 5) * 5, 6) / 4);
    case "count_long_short_ratio":
      return String(0.5 + wave(Math.floor(minute / 5) * 5, 7) / 512);
    default:
      return String(wave(minute, 9) / 4);
  }
}

interface StubHandle {
  readonly url: string;
  close(): Promise<void>;
}

async function startStub(catalog: CatalogEnvelope): Promise<StubHandle> {
  const keysById = new Map<string, SeriesKey>(catalog.entries.map((entry) => [computeSeriesKeyId(entry.key), entry.key]));
  const server = http.createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    const incoming = new URL(request.url ?? "/", "http://placeholder");
    if (incoming.pathname.endsWith("/series-catalog")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (incoming.pathname.endsWith("/series-history")) {
      const startMs = Number(incoming.searchParams.get("window_start_ms"));
      const endMsInclusive = Number(incoming.searchParams.get("window_end_ms"));
      const knowledgeTimeMs = Number(incoming.searchParams.get("knowledge_time_ms"));
      const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "";
      const key = keysById.get(seriesKeyId);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive) || key === undefined) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end(`T-04.3 stub: bad request (${seriesKeyId || "no series_key_id"})`);
        return;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        const value = syntheticValue(key, t);
        if (value !== null) rows.push({ event_time: t, available_at: t, value, absence: null, coverage: null });
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: seriesKeyId,
            source: "T-04.3-synthetic-values",
            nature: key.nature,
            unit: key.unit,
            coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
          },
          rows,
          knowledge_time: Number.isFinite(knowledgeTimeMs) ? knowledgeTimeMs : Date.now(),
          bar_policy: "final_only",
        }),
      );
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("T-04.3 stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-04.3 stub: no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ── pixels ───────────────────────────────────────────────────────────────────────────────────

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`hexToRgb: ${hex} is not #rrggbb`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function near(a: Rgb, b: Rgb, tolerance = PIXEL_TOLERANCE): boolean {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance && Math.abs(a[2] - b[2]) <= tolerance;
}

interface Bitmap {
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
}

function pixelAt(bitmap: Bitmap, x: number, y: number): Rgb {
  const at = (y * bitmap.width + x) * 4;
  return [bitmap.data[at]!, bitmap.data[at + 1]!, bitmap.data[at + 2]!];
}

/** A screenshot of one element's box, decoded by the browser itself (no PNG decoder in the repo). */
async function captureBox(page: Page, locator: Locator): Promise<Bitmap> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("captureBox: the element has no box");
  const png = await page.screenshot({ clip: box, scale: "device", animations: "disabled", caret: "hide" });
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    return { width: bitmap.width, height: bitmap.height, data: Array.from(data) };
  }, png.toString("base64"));
}

interface SwatchPixels {
  readonly form: "hollow" | "filled" | "ambiguous";
  /** The median colour of the ring (one device px in from each edge, middle half of each edge). */
  readonly ring: Rgb;
  /** Fraction of the interior (the central 4×4 CSS px) in the ring's colour. */
  readonly interiorInRing: number;
  /** The median colour of that interior. */
  readonly interior: Rgb;
  readonly width: number;
  readonly height: number;
}

function medianColor(pixels: readonly Rgb[]): Rgb {
  const channel = (i: 0 | 1 | 2) => pixels.map((p) => p[i]).sort((a, b) => a - b)[Math.floor(pixels.length / 2)] ?? 0;
  return [channel(0), channel(1), channel(2)];
}

/** WCAG relative-luminance contrast ratio. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [r, g, bl] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function classifySwatch(bitmap: Bitmap): SwatchPixels {
  const scale = bitmap.width / SWATCH_PX;
  const ring: Rgb[] = [];
  const inset = Math.max(1, Math.floor(scale / 2));
  for (let t = Math.floor(bitmap.width / 4); t < Math.ceil((3 * bitmap.width) / 4); t += 1) {
    ring.push(pixelAt(bitmap, t, inset), pixelAt(bitmap, t, bitmap.height - 1 - inset));
    ring.push(pixelAt(bitmap, inset, t), pixelAt(bitmap, bitmap.width - 1 - inset, t));
  }
  const ringColor = medianColor(ring);
  let inside = 0;
  let matches = 0;
  const interiorPixels: Rgb[] = [];
  const from = Math.round(2 * scale);
  const to = Math.round((SWATCH_PX - 2) * scale);
  for (let y = from; y < to; y += 1) {
    for (let x = from; x < to; x += 1) {
      inside += 1;
      interiorPixels.push(pixelAt(bitmap, x, y));
      if (near(pixelAt(bitmap, x, y), ringColor)) matches += 1;
    }
  }
  const interiorInRing = inside === 0 ? 0 : matches / inside;
  const form = interiorInRing >= 0.9 ? "filled" : interiorInRing <= 0.1 ? "hollow" : "ambiguous";
  return { form, ring: ringColor, interiorInRing, interior: medianColor(interiorPixels), width: bitmap.width, height: bitmap.height };
}

// ── the page ─────────────────────────────────────────────────────────────────────────────────

async function openPage(page: Page, baseUrl: string): Promise<void> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH} did not answer ok`).toBe(true);
  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", {
    timeout: 120_000,
  });
  await expect(page.locator(`[data-testid="${PANE_TESTID}"]`)).toHaveCount(1);
  await page.waitForTimeout(1_000);
}

function legValue(page: Page, cohort: Cohort): Locator {
  return page.locator(`[data-testid="liquidation-cohort-${cohort}"] [data-legend-value="liquidation_${cohort}"]`);
}

interface LegReading {
  readonly kind: string;
  readonly source: string;
  readonly bucketMs: number | null;
  readonly raw: string;
  readonly numeral: string;
}

interface Snapshot {
  readonly legs: Readonly<Record<Cohort, LegReading>>;
  /** Visible `[data-legend-numeral]` of the pane. */
  readonly visibleNumerals: number;
  /** Numeric tokens of the pane's VISIBLE text outside the numerals, in document order. */
  readonly otherTokens: readonly string[];
  /** Every numeric token of the pane's visible text, numerals included. */
  readonly allTokens: readonly string[];
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(
    ({ paneTestId, cohorts }) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${paneTestId}"]`)!;
      const legs: Record<string, LegReading> = {};
      for (const cohort of cohorts) {
        const value = layer.querySelector<HTMLElement>(`[data-legend-value="liquidation_${cohort}"]`)!;
        const bucket = value.dataset.legendBucketMs ?? "";
        legs[cohort] = {
          kind: value.dataset.legendKind ?? "",
          source: value.dataset.legendSource ?? "",
          bucketMs: bucket === "" ? null : Number(bucket),
          raw: value.dataset.legendRaw ?? "",
          numeral: value.querySelector("[data-legend-numeral]")?.textContent ?? "",
        };
      }
      const visible = (element: Element | null): boolean => {
        if (element === null || element.closest(".sr-only") !== null) return false;
        if (!(element as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      };
      const numerals = Array.from(layer.querySelectorAll("[data-legend-numeral]")).filter(visible);
      const otherTokens: string[] = [];
      const allTokens: string[] = [];
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!visible(parent)) continue;
        const tokens = (node.textContent ?? "").match(/[-−]?\d+(?:\.\d+)?/g) ?? [];
        allTokens.push(...tokens);
        if (parent!.closest("[data-legend-numeral]") === null) otherTokens.push(...tokens);
      }
      return { legs: legs as Record<Cohort, LegReading>, visibleNumerals: numerals.length, otherTokens, allTokens };
    },
    { paneTestId: PANE_TESTID, cohorts: COHORTS },
  );
}

/** Criterion (e) on one snapshot: the defect, or `null`. */
function thirdNumberDefect(shot: Snapshot): string | null {
  if (shot.visibleNumerals !== 2) return `${shot.visibleNumerals} visible numerals in the pane, not 2`;
  const long = shot.legs.long.raw === "" ? null : Number(shot.legs.long.raw);
  const short = shot.legs.short.raw === "" ? null : Number(shot.legs.short.raw);
  if (long === null || short === null || long <= 0 || short <= 0 || long === short) return null;
  const combined = [Math.abs(long - short), long + short];
  for (const token of shot.allTokens) {
    const number = Math.abs(Number(token.replace("−", "-")));
    if (combined.some((c) => Math.abs(number - c) <= 1e-6 * Math.max(1, c))) {
      return `the screen shows ${token}, a combination of the two legs (long ${long}, short ${short})`;
    }
  }
  return null;
}

/** Criterion (d) on one leg: the defect, or `null`. */
function legDefect(cohort: Cohort, leg: LegReading): string | null {
  if (/[-−]/.test(leg.numeral)) return `${cohort}: signed numeral ${leg.numeral}`;
  if (leg.bucketMs === null) return `${cohort}: no bucket under the crosshair`;
  const served = liquidationLeg(cohort, leg.bucketMs);
  if (served === null) {
    return leg.kind === "absent" && leg.raw === "" && leg.numeral === ABSENCE_WORD
      ? null
      : `${cohort}@${leg.bucketMs}: served NO row, legend shows ${leg.kind}/${leg.raw}/${leg.numeral}`;
  }
  // `raw` is the served number digit for digit; the painted numeral drops IEEE-754 noise
  // (`formatLegendNumeral`, 15 significant digits), so it is compared at that precision.
  const painted = Number(served.toPrecision(15));
  if (leg.kind === "absent" || Number(leg.raw) !== served || Number(leg.numeral) !== painted) {
    return `${cohort}@${leg.bucketMs}: served ${served}, legend shows ${leg.kind}/${leg.raw}/${leg.numeral}`;
  }
  return null;
}

/**
 * `paineis-de-fluxo` `T-06.1` — the sweep below (70%..90% of the width) reads the LAST
 * `SWEEP_VIEW_BARS` slots, put there explicitly (`view.ts::showView`), not wherever the mount frames
 * (`VIEW_BARS`). `T-05.1` made the mount 120 bars (2 h at `1m`): the sweep crossed only ~25 buckets
 * and the spec reported itself blind (`too few buckets under the sweep`, 25 < 40). The fix then was a
 * private zoom-out to the library's floor (~2.400 slots, "~2 minutes per CSS px", the geometry
 * `SWEEP_STEP_PX` was measured on); 2.000 keeps it (~1,7 minutes per px) under the floor of a 1280-px
 * plot, far from the paging trigger (`showView` throws on a page).
 */
const SWEEP_VIEW_BARS = 2_000;
/** Below this the view did not leave the 120-bar mount geometry. */
const MIN_SWEEP_SPAN_SLOTS = 1_000;

async function showSweepView(page: Page): Promise<void> {
  const view = await showView(page, { kind: "lastBars", bars: SWEEP_VIEW_BARS });
  fact(SPEC, "view", { iterations: view.iterations, from: view.fromLogical, to: view.toLogical, spacingPx: view.barSpacingPx });
  expect(view.toLogical - view.fromLogical, "a vista da varredura é estreita demais").toBeGreaterThanOrEqual(MIN_SWEEP_SPAN_SLOTS);
}

/** Sweeps the crosshair over the liquidation pane and returns every snapshot taken. */
async function sweep(page: Page): Promise<Snapshot[]> {
  const layer = page.locator(`[data-testid="${PANE_TESTID}"]`);
  const box = await layer.boundingBox();
  if (box === null) throw new Error("sweep: the liquidation pane has no box");
  const y = box.y + box.height * 0.7;
  const shots: Snapshot[] = [];
  // Half a CSS px per step: at `1m` the default view packs ~2 minutes per CSS px, and a coarser step
  // aliases onto every other minute — a 1 px step saw ONLY odd minutes (363 of them), so a pattern of
  // even period never showed one of its states [MEDIDO 2026-09-27, first runs of this spec].
  for (let x = box.x + box.width * 0.7; x < box.x + box.width * 0.9; x += SWEEP_STEP_PX) {
    await page.mouse.move(x, y);
    await expect(legValue(page, "short")).toHaveAttribute("data-legend-source", "crosshair");
    shots.push(await snapshot(page));
  }
  return shots;
}

test.use({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 2 });

test.describe(`T-04.3: the liquidation legend, two magnitudes led by the leg's square (${SPEC})`, () => {
  let stub: StubHandle | undefined;
  let instance: NextInstanceHandle | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${sentimentoApiBaseUrl()}/series-catalog`);
    if (!response.ok) throw new Error(`GET /series-catalog on the e2e API answered ${response.status}`);
    const catalog = (await response.json()) as CatalogEnvelope;
    fact(SPEC, "real_catalog_entries", catalog.entries.length);
    stub = await startStub(catalog);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  test("(a)+(c): short hollow in the rise token, long filled in the fall token, numeral in neutral ink", async ({ page }) => {
    await openPage(page, instance!.baseUrl);
    const expected: Readonly<Record<Cohort, { form: string; ink: string; side: string }>> = {
      short: { form: "hollow", ink: UP_INK, side: "up" },
      long: { form: "filled", ink: DOWN_INK, side: "down" },
    };
    // Find a slot where both legs carry a positive number, so both numerals are painted in ink.
    const layer = await page.locator(`[data-testid="${PANE_TESTID}"]`).boundingBox();
    let found = false;
    for (let x = layer!.x + layer!.width * 0.5; x < layer!.x + layer!.width * 0.9 && !found; x += SWEEP_STEP_PX) {
      await page.mouse.move(x, layer!.y + layer!.height * 0.7);
      const shot = await snapshot(page);
      found = COHORTS.every((c) => shot.legs[c].raw !== "" && Number(shot.legs[c].raw) > 0);
    }
    expect(found, "no slot with both legs > 0 — the instrument is blind").toBe(true);

    for (const cohort of COHORTS) {
      const value = legValue(page, cohort);
      const swatch = value.locator("[data-liquidation-swatch]");
      await expect(swatch).toHaveCount(1);
      await expect(swatch).toHaveAttribute("data-liquidation-swatch", expected[cohort].form);
      await expect(swatch).toHaveAttribute("data-liquidation-swatch-side", expected[cohort].side);
      const geometry = await swatch.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const next = element.nextElementSibling;
        const nextRect = next?.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          nextIsNumeral: next?.hasAttribute("data-legend-numeral") ?? false,
          nextLeft: nextRect?.left ?? null,
          nextTop: nextRect?.top ?? null,
          nextBottom: nextRect?.bottom ?? null,
        };
      });
      fact(SPEC, `swatch_geometry_${cohort}`, geometry);
      expect(geometry.width, `${cohort}: the square is not 8px wide`).toBeCloseTo(SWATCH_PX, 2);
      expect(geometry.height, `${cohort}: the square is not 8px tall`).toBeCloseTo(SWATCH_PX, 2);
      expect(geometry.nextIsNumeral, `${cohort}: the square does not immediately precede the numeral`).toBe(true);
      expect(geometry.right, `${cohort}: the square is not before the numeral`).toBeLessThanOrEqual(geometry.nextLeft! + 0.01);
      expect(geometry.top, `${cohort}: the square is not on the numeral's line`).toBeGreaterThanOrEqual(geometry.nextTop! - 0.01);
      expect(geometry.bottom, `${cohort}: the square is not on the numeral's line`).toBeLessThanOrEqual(geometry.nextBottom! + 0.01);

      // The crosshair's lines must not cross the square in the screenshot; the square does not
      // depend on the slot under it.
      await page.mouse.move(2, 2);
      const pixels = classifySwatch(await captureBox(page, swatch));
      fact(SPEC, `swatch_pixels_${cohort}`, pixels);
      expect(pixels.form, `${cohort}: the square reads ${pixels.form} in the pixels`).toBe(expected[cohort].form);
      expect(near(pixels.ring, hexToRgb(expected[cohort].ink)), `${cohort}: ring ${pixels.ring} is not ${expected[cohort].ink}`).toBe(true);
    }

    // (c) the numeral in neutral ink — computed, and in pixels. Re-hover the slot with two numbers.
    for (let x = layer!.x + layer!.width * 0.5, done = false; x < layer!.x + layer!.width * 0.9 && !done; x += SWEEP_STEP_PX) {
      await page.mouse.move(x, layer!.y + layer!.height * 0.7);
      const shot = await snapshot(page);
      done = COHORTS.every((c) => shot.legs[c].raw !== "" && Number(shot.legs[c].raw) > 0);
    }
    for (const cohort of COHORTS) {
      const numeral = legValue(page, cohort).locator("[data-legend-numeral]");
      const color = await numeral.evaluate((element) => getComputedStyle(element).color);
      fact(SPEC, `numeral_color_${cohort}`, color);
      const [r, g, b] = hexToRgb(NEUTRAL_INK);
      expect(color, `${cohort}: the numeral is not in the neutral ink`).toBe(`rgb(${r}, ${g}, ${b})`);
      const bitmap = await captureBox(page, numeral);
      let directional = 0;
      let neutral = 0;
      for (let y = 0; y < bitmap.height; y += 1) {
        for (let x = 0; x < bitmap.width; x += 1) {
          const p = pixelAt(bitmap, x, y);
          if (near(p, hexToRgb(UP_INK), 20) || near(p, hexToRgb(DOWN_INK), 20)) directional += 1;
          if (near(p, hexToRgb(NEUTRAL_INK), 40)) neutral += 1;
        }
      }
      fact(SPEC, `numeral_pixels_${cohort}`, { directional, neutral, width: bitmap.width, height: bitmap.height });
      expect(neutral, `${cohort}: no neutral-ink pixel in the numeral — the instrument is blind`).toBeGreaterThan(0);
      expect(directional, `${cohort}: numeral pixels in a direction token (D14)`).toBe(0);
    }
  });

  test("(b) C-7: under forced-colors the squares keep their form and their ink; a background fill and a repainted ink do not", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openPage(page, instance!.baseUrl);
    const forced = await page.evaluate(() => matchMedia("(forced-colors: active)").matches);
    expect(forced, "the forced-colors emulation did not reach the page").toBe(true);
    const read = async () => {
      const short = classifySwatch(await captureBox(page, legValue(page, "short").locator("[data-liquidation-swatch]")));
      const long = classifySwatch(await captureBox(page, legValue(page, "long").locator("[data-liquidation-swatch]")));
      // The backdrop is what shows through the hollow square: the chart's canvas, never repainted.
      return { short, long, contrast: { short: contrastRatio(short.ring, short.interior), long: contrastRatio(long.ring, short.interior) } };
    };
    const verdict = (reading: Awaited<ReturnType<typeof read>>): string | null => {
      if (reading.short.form !== "hollow") return `the hollow square reads ${reading.short.form}`;
      if (reading.long.form !== "filled") return `the filled square reads ${reading.long.form}`;
      const inks: Readonly<Record<Cohort, string>> = { short: UP_INK, long: DOWN_INK };
      for (const cohort of COHORTS) {
        if (!near(reading[cohort].ring, hexToRgb(inks[cohort]))) {
          return `${cohort}: the square lost its leg's ink (reads rgb ${reading[cohort].ring.join(",")}, not ${inks[cohort]})`;
        }
        if (reading.contrast[cohort] < MIN_MARK_CONTRAST) {
          return `${cohort}: the square's ink is ${reading.contrast[cohort].toFixed(2)}:1 against the plot, below ${MIN_MARK_CONTRAST}:1`;
        }
      }
      return null;
    };

    const production = await read();
    fact(SPEC, "forced_colors_production", production);
    expect(verdict(production), "forced-colors: production").toBeNull();

    // ABLATION 1 — the filled square drawn with a background. Without forced colours it looks right …
    await page.emulateMedia({ forcedColors: "none" });
    const byBackground = await page.addStyleTag({ content: FILLED_BY_BACKGROUND_CSS });
    await page.waitForTimeout(200);
    const ablatedPlain = await read();
    fact(SPEC, "ablation_background_plain", ablatedPlain);
    expect(ablatedPlain.long.form, "the ablated square must pass the plain-colour reading").toBe("filled");
    // … and under forced colours the system repaints it: the SAME verdict must reject it. Chromium's
    // emulated palette repaints a background in its Canvas colour (white here) — the form may survive,
    // the leg's ink does not; under a dark palette the same fill would be dark on the dark plot.
    await page.emulateMedia({ forcedColors: "active" });
    await page.waitForTimeout(200);
    const ablatedForced = await read();
    fact(SPEC, "ablation_background_forced", ablatedForced);
    expect(verdict(ablatedForced), "MORDE: a background-filled square must be rejected under forced-colors").toMatch(/long: the square lost its leg's ink|filled square reads/);
    await byBackground.evaluate((element) => element.remove());

    // ABLATION 2 — the right geometry, but the ink left to the system (`forced-color-adjust: auto`).
    // The forced palette is applied when the media state changes, so the style goes in first and
    // the emulation is re-entered after it (as for ablation 1).
    await page.emulateMedia({ forcedColors: "none" });
    await page.addStyleTag({ content: REPAINTED_INK_CSS });
    await page.emulateMedia({ forcedColors: "active" });
    await page.waitForTimeout(200);
    const repainted = await read();
    fact(SPEC, "ablation_repainted_ink_forced", repainted);
    // The system border (black in Chromium's palette) sits on the canvas's `#131722` at ~1.2:1: the
    // hollow square's ring is indistinguishable from its interior, so it even reads "filled".
    const repaintedVerdict = verdict(repainted);
    fact(SPEC, "ablation_repainted_ink_verdict", repaintedVerdict);
    expect(repaintedVerdict, "MORDE: a system-coloured square on the canvas must be rejected").not.toBeNull();
  });

  test("(d)+(e): two magnitudes, each its own leg's, absence and zero per leg, and no third number", async ({ page }) => {
    await openPage(page, instance!.baseUrl);
    await showSweepView(page);
    const shots = await sweep(page);
    const defects: string[] = [];
    const seen: Record<Cohort, { absent: number; zero: number; positive: number }> = {
      short: { absent: 0, zero: 0, positive: 0 },
      long: { absent: 0, zero: 0, positive: 0 },
    };
    let oneAbsentOtherPositive = 0;
    let bothPositiveDistinct = 0;
    const otherTokenSets = new Set<string>();
    const buckets = new Set<number>();
    for (const shot of shots) {
      for (const cohort of COHORTS) {
        const leg = shot.legs[cohort];
        const defect = legDefect(cohort, leg);
        if (defect !== null) defects.push(defect);
        if (leg.bucketMs !== null) buckets.add(leg.bucketMs);
        if (leg.kind === "absent") seen[cohort].absent += 1;
        else if (Number(leg.raw) === 0) seen[cohort].zero += 1;
        else seen[cohort].positive += 1;
      }
      const [s, l] = [shot.legs.short, shot.legs.long];
      if ((s.kind === "absent" && Number(l.raw) > 0) || (l.kind === "absent" && Number(s.raw) > 0)) oneAbsentOtherPositive += 1;
      if (Number(s.raw) > 0 && Number(l.raw) > 0 && s.raw !== l.raw) bothPositiveDistinct += 1;
      const third = thirdNumberDefect(shot);
      if (third !== null) defects.push(third);
      otherTokenSets.add(shot.otherTokens.join(" "));
    }
    fact(SPEC, "sweep", { snapshots: shots.length, buckets: buckets.size, seen, oneAbsentOtherPositive, bothPositiveDistinct });
    fact(SPEC, "other_numeric_tokens", [...otherTokenSets]);
    fact(SPEC, "sweep_defects", defects.slice(0, 20));

    expect(buckets.size, "too few buckets under the sweep — the instrument is blind").toBeGreaterThanOrEqual(40);
    for (const cohort of COHORTS) {
      expect(seen[cohort].absent, `${cohort}: no absent bucket seen`).toBeGreaterThan(0);
      expect(seen[cohort].zero, `${cohort}: no zero bucket seen`).toBeGreaterThan(0);
      expect(seen[cohort].positive, `${cohort}: no positive bucket seen`).toBeGreaterThan(0);
    }
    expect(oneAbsentOtherPositive, "no bucket with one leg absent and the other present").toBeGreaterThan(0);
    expect(bothPositiveDistinct, "(e) no bucket with both legs > 0 and distinct — inconclusive").toBeGreaterThan(0);
    expect(defects, "(d)/(e) defects under the crosshair").toEqual([]);
    expect(otherTokenSets.size, "(e) a numeric token outside the two numerals moves with the crosshair").toBe(1);

    // ABLATION of (e): the difference of the legs, injected in a visible legend line, is rejected.
    const target = shots.find((shot) => Number(shot.legs.short.raw) > 0 && Number(shot.legs.long.raw) > 0)!;
    const bucket = target.legs.short.bucketMs!;
    const box = (await page.locator(`[data-testid="${PANE_TESTID}"]`).boundingBox())!;
    for (let x = box.x + box.width * 0.7; x < box.x + box.width * 0.9; x += SWEEP_STEP_PX) {
      await page.mouse.move(x, box.y + box.height * 0.7);
      if ((await legValue(page, "short").getAttribute("data-legend-bucket-ms")) === String(bucket)) break;
    }
    const before = await snapshot(page);
    expect(thirdNumberDefect(before)).toBeNull();
    const difference = Math.abs(Number(before.legs.long.raw) - Number(before.legs.short.raw));
    await page.evaluate(
      ({ paneTestId, text }) => {
        const line = document.querySelector(`[data-testid="${paneTestId}"] [data-legend-value="liquidation_short"]`)!.parentElement!;
        const span = document.createElement("span");
        span.textContent = text;
        line.appendChild(span);
      },
      { paneTestId: PANE_TESTID, text: String(Number(difference.toPrecision(15))) },
    );
    const ablated = await snapshot(page);
    fact(SPEC, "ablation_difference", { difference, tokens: ablated.allTokens });
    expect(thirdNumberDefect(ablated), "MORDE: |long − short| on screen must be rejected").toMatch(/combination of the two legs/);
  });
});
