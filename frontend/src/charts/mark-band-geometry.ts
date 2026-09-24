/**
 * `mark-band-geometry.ts` — the geometry of the ABSENCE/ZERO mark band of a pane, anchored in the
 * pane's REAL height (`IPaneApi.getHeight()`), not in a chart-height constant (`T-01.3`, plan `01`
 * item `1.4`, `RN-4`, `ADR-003/FR-2`, `ADR-044/D1`).
 *
 * WHAT THE BAND IS. A FLOW pane draws its two marks (absence = "we do not know", legitimate
 * zero = "it was zero") as histograms on a price scale of their OWN, whose autoscale is pinned to
 * `[0, spanPx]`, where `spanPx` is the height, in CSS pixels, that the scale margins leave to that
 * scale inside the pane (minus the library's one-pixel inset, see `LIBRARY_SCALE_PIXEL_INSET`). A
 * mark of value `N` is then `N` pixels tall — the value IS the height.
 *
 * WHY IT MOVED HERE. Until `S-1`, each pane was its own `createChart` of `CHART_HEIGHT_PX = 220`
 * and `web` computed `bandPx = 220 * (1 - top)`. That was already ~15% off (the time axis ate part
 * of the 220 — the band was nominal, never measured), and with one chart holding six panes of
 * different stretch factors there is no chart height a pane can derive its band from. The pane's
 * own `getHeight()` is the only number that is true, and turning it into a band is geometry, which
 * `ADR-003/FR-2` puts in `charts`. `web` keeps passing the FORM (margins, nominal mark heights);
 * this module turns form + measured height into the numbers the series are fed.
 *
 * ⛔ `getHeight()` IS NOT KNOWN AT MOUNT. The `T-01.0` spike measured that the pane's DOM does not
 * exist in the tick of `addPane`/`addSeries` (`handoff/T-01.0-achados-para-a-F1.md`, item 1); a
 * height of `0` there is "not laid out yet", not "a pane of zero pixels". This module therefore
 * returns `unmeasured` for a non-positive or non-finite height instead of guessing a fallback —
 * a guessed band would draw marks of a height nobody decided, which is exactly the failure a
 * nominal constant already produced once.
 *
 * ⛔ WHEN THE BAND IS SMALLER THAN THE NOMINAL MARKS. A pane at the `72px` floor with a marks
 * margin of `top = 0.88` has a band of `8.64px` (span `7.64px`); the liquidation zero mark is nominally `18px`.
 * Fed unchanged, it would climb OUT of its band and into the bar band — the very collision the
 * disjoint margins exist to make inexpressible. So both marks are scaled by the SAME factor
 * (`spanPx / zeroMarkPx`), which keeps the zero mark inside the band and keeps the ratio between
 * the two marks (the height channel that separates "absent" from "zero"). If that shrink would
 * push the absence mark below one CSS pixel, the band cannot carry the distinction at all and the
 * result is `collapsed` — the caller has to see that, not a mark that exists only in a number.
 * ⚠️ The shrink rule is a geometry PROPOSAL, submitted to the `design_gate` with `T-01.5`: this
 * module does not decide how the marks look, only that they cannot leave their band.
 */

/** The FORM of a mark band — owned by `web` (the `ui-designer` with the `ux-ui-mastery` verdict),
 * consumed here. `scaleMargins` are the margins of the marks' own price scale. */
export interface MarkBandSpec {
  readonly scaleMargins: { readonly top: number; readonly bottom: number };
  /** Nominal height of the absence mark, in CSS pixels, when the band has room for it. */
  readonly absenceMarkPx: number;
  /** Nominal height of the legitimate-zero mark, in CSS pixels. Must be taller than absence. */
  readonly zeroMarkPx: number;
}

/** The one method of `IPaneApi` this module reads — structural, so the geometry stays testable
 * without a chart and `charts` does not hand a library object across its boundary. */
export interface PaneHeightSource {
  getHeight(): number;
}

/** The autoscale range the marks' price scale must be pinned to — the shape an
 * `autoscaleInfoProvider` returns as `priceRange`. */
export interface MarkBandPriceRange {
  readonly minValue: 0;
  readonly maxValue: number;
}

export type MarkBandGeometry =
  | {
      /** The pane has not been laid out yet (height `0`, negative or non-finite). Nothing to draw
       * from; ask again after the first frame. */
      readonly kind: "unmeasured";
      readonly paneHeightPx: number;
    }
  | {
      readonly kind: "band";
      readonly paneHeightPx: number;
      /** Height, in CSS pixels, of the marks' scale inside the pane. */
      readonly bandPx: number;
      /** The pixels the library actually spreads the range over: `bandPx - LIBRARY_SCALE_PIXEL_INSET`. */
      readonly spanPx: number;
      /** Pin the marks' scale autoscale to this (`maxValue = spanPx`); a mark of value `N` is
       * then `N` px tall. */
      readonly priceRange: MarkBandPriceRange;
      /** Value to feed `absenceMarkSeries` — equal to its height in CSS pixels. */
      readonly absenceMarkValue: number;
      /** Value to feed `zeroMarkSeries` — equal to its height in CSS pixels. */
      readonly zeroMarkValue: number;
      /** `true` when the nominal marks did not fit and both were scaled down by the same factor. */
      readonly shrunk: boolean;
    }
  | {
      /** The band exists but is too short to keep the absence mark at >= 1 CSS pixel while it
       * stays shorter than the zero mark: the height channel cannot separate the two here. */
      readonly kind: "collapsed";
      readonly paneHeightPx: number;
      readonly bandPx: number;
    };

/** `lightweight-charts@5.2.1` maps a price range onto `internalHeight() - 1` pixels, not onto
 * `internalHeight()` (`dist/lightweight-charts.development.mjs`, `priceToCoordinate` path:
 * `const ih = (this._internal_internalHeight() - 1)`). Pinning the range to the full band would
 * make every mark `(band - 1) / band` of its value — measured against the library: a fed `17.16`
 * drew `16.16px` in a `143px` pane (`mark-band-geometry.test.ts`). The range is pinned to the
 * SPAN, so value `N` draws `N` px. */
export const LIBRARY_SCALE_PIXEL_INSET = 1;

/** Below one CSS pixel a canvas mark is, to the eye, the same as no mark — the argument the
 * volume sub-axis `BLOCKER-1` already measured (`SymbolClient.tsx`, volume log base comment). */
export const MIN_DRAWABLE_MARK_PX = 1;

function assertValidSpec(spec: MarkBandSpec): void {
  const { top, bottom } = spec.scaleMargins;
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || top < 0 || bottom < 0 || top + bottom >= 1) {
    throw new RangeError(
      `scale margins top=${top} bottom=${bottom} leave no band — each must be >= 0 and their sum < 1`,
    );
  }
  if (!Number.isFinite(spec.absenceMarkPx) || spec.absenceMarkPx < MIN_DRAWABLE_MARK_PX) {
    throw new RangeError(
      `absence mark of ${spec.absenceMarkPx}px is not drawable — it must be >= ${MIN_DRAWABLE_MARK_PX}px`,
    );
  }
  if (!Number.isFinite(spec.zeroMarkPx) || spec.zeroMarkPx <= spec.absenceMarkPx) {
    throw new RangeError(
      `zero mark of ${spec.zeroMarkPx}px must be strictly taller than the absence mark ` +
        `(${spec.absenceMarkPx}px) — height is the channel that tells them apart`,
    );
  }
}

/**
 * Turns a pane's measured height and the band's form into the numbers the mark series are fed.
 * Pure: same inputs, same output, no library, no DOM.
 */
export function markBandGeometry(paneHeightPx: number, spec: MarkBandSpec): MarkBandGeometry {
  assertValidSpec(spec);
  if (!Number.isFinite(paneHeightPx) || paneHeightPx <= 0) {
    return { kind: "unmeasured", paneHeightPx };
  }
  const bandPx = paneHeightPx * (1 - spec.scaleMargins.top - spec.scaleMargins.bottom);
  const spanPx = bandPx - LIBRARY_SCALE_PIXEL_INSET;
  if (spanPx <= 0) {
    return { kind: "collapsed", paneHeightPx, bandPx };
  }
  const shrunk = spec.zeroMarkPx > spanPx;
  const factor = shrunk ? spanPx / spec.zeroMarkPx : 1;
  const absenceMarkValue = spec.absenceMarkPx * factor;
  const zeroMarkValue = spec.zeroMarkPx * factor;
  if (absenceMarkValue < MIN_DRAWABLE_MARK_PX) {
    return { kind: "collapsed", paneHeightPx, bandPx };
  }
  return {
    kind: "band",
    paneHeightPx,
    bandPx,
    spanPx,
    priceRange: { minValue: 0, maxValue: spanPx },
    absenceMarkValue,
    zeroMarkValue,
    shrunk,
  };
}

/** `markBandGeometry` over `IPaneApi.getHeight()`. Call it after the first frame (and again on
 * every pane resize); before that the answer is `unmeasured`. */
export function markBandGeometryOfPane(pane: PaneHeightSource, spec: MarkBandSpec): MarkBandGeometry {
  return markBandGeometry(pane.getHeight(), spec);
}
