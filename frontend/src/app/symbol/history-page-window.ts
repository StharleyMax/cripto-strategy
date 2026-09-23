/**
 * `T-05.2` — the PURE window arithmetic `D-C3.5` names as its own item: "teto de ~5.000 slots
 * por grade, descartando a ponta direita — nunca crescimento ilimitado."
 * (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:291-308`).
 *
 * `charts/time-axis-controller.ts`'s `historyRequest` (`T-05.1`) already decided WHICH window to
 * ask for next (the edge predicate, the page width) — this module is what happens AFTER the
 * fetch answers: widening the loaded window to include the new page, and capping the result so
 * the accumulated grid never grows past `DEFAULT_MAX_ACCUMULATED_SLOTS`. The judgment's own
 * measurement is why the cap exists at all: `setData` of `129.600` slots × 6 panels costs
 * `752,6 ms` of main-thread time — `47×` the `16 ms` pan-frame budget (fase `02`, DoD 7) and
 * `~1,9×` the `400 ms` paging budget (fase `05`, DoD 7). At `~500` slots/page and a `~5.000`-slot
 * cap (`~10` pages), the remount stays around `~50 ms` (the SAME measurement's own linear
 * extrapolation from `5.760 -> 48,2 ms`).
 *
 * PURE, same discipline every `charts`/`axis-sync.ts` module in this feature follows: no
 * `IChartApi`, no `fetch`, no `Date.now()` — every instant is a parameter.
 */

/** A half-open window over the canonical grid, in epoch milliseconds — the same shape
 * `charts`' `S2Window` carries (`startMs`/`endMsExclusive`), minus the `days` list this module
 * has no use for (unlike `S2Window`, an accumulated paging window is not naturally aligned to
 * UTC day boundaries once it has been capped, so `.days` would be a claim this module cannot
 * back). Callers that need an `S2Window` (`buildS2Panels`) attach `days: []` themselves — see
 * `panel-assembly.ts` (`T-05.2`) — since nothing this widened window feeds actually reads it
 * (`s2-panels.ts`'s builders take `startMs`/`endMsExclusive` as separate arguments, never the
 * whole `S2Window` object).
 */
export interface AccumulatedWindow {
  readonly startMs: number;
  readonly endMsExclusive: number;
}

/** `D-C3.5`'s own number, and its own reasoning — see this module's docstring. Exported so a
 * caller (and its own tests) can pin a different cap without touching this module's logic,
 * same discipline `time-axis-controller.ts`'s `DEFAULT_PAGE_TRIGGER_SLOTS` already follows. */
export const DEFAULT_MAX_ACCUMULATED_SLOTS = 5_000;

/**
 * `D-C3.5`'s own number for how many slots ONE page asks for — "~500 velas por página" is the
 * assumption the `~5.000`-slot / `~10`-page cap is sized against. `historyRequest`
 * (`time-axis-controller.ts`) takes this as a REQUIRED argument (its own docstring: "how much to
 * request per page is `D-C3.5`/`T-05.2` territory, not decided there") — this is where it is
 * finally decided, as a named constant rather than a literal at the call site.
 */
export const DEFAULT_PAGE_SLOTS = 500;

/**
 * Widens `current` to include a just-fetched page `[page.fromMs, page.toMs)`, then caps the
 * result at `maxSlots` by trimming the RIGHT edge — never the left, which is the edge the page
 * just extended and the one the operator dragged toward. `page.toMs` MUST equal
 * `current.startMs` exactly: that is `historyRequest`'s own contract (`time-axis-controller.ts`,
 * "o range de tempo sobrevive ao remonte") — a page that does not abut the loaded window would
 * mean this function was called with a request `historyRequest` never produced, and accepting it
 * silently would let a gap open in the middle of the grid instead of at a known, capped edge.
 */
export function widenAndCapWindow(
  current: AccumulatedWindow,
  page: { readonly fromMs: number; readonly toMs: number },
  stepMs: number,
  maxSlots: number = DEFAULT_MAX_ACCUMULATED_SLOTS,
): AccumulatedWindow {
  if (!(stepMs > 0)) {
    throw new RangeError(`widenAndCapWindow: stepMs must be positive, received ${stepMs}`);
  }
  if (!(maxSlots > 0) || !Number.isInteger(maxSlots)) {
    throw new RangeError(`widenAndCapWindow: maxSlots must be a positive integer, received ${maxSlots}`);
  }
  if (page.toMs !== current.startMs) {
    throw new RangeError(
      `widenAndCapWindow: page.toMs (${page.toMs}) must equal current.startMs (${current.startMs}) — ` +
        "a page that does not abut the loaded window is not one historyRequest produced",
    );
  }
  if (!(page.fromMs < page.toMs)) {
    throw new RangeError(`widenAndCapWindow: page.fromMs (${page.fromMs}) must precede page.toMs (${page.toMs})`);
  }
  const widenedStartMs = page.fromMs;
  const totalSlots = (current.endMsExclusive - widenedStartMs) / stepMs;
  if (totalSlots <= maxSlots) {
    return { startMs: widenedStartMs, endMsExclusive: current.endMsExclusive };
  }
  // Discard the right edge — the far side from where the operator just dragged, per `D-C3.5`
  // ("descartando a ponta direita — nunca crescimento ilimitado"). The window SLIDES as a whole
  // rather than growing forever: each accepted page keeps the total at exactly `maxSlots`.
  return { startMs: widenedStartMs, endMsExclusive: widenedStartMs + maxSlots * stepMs };
}

/** Keeps only the rows landing inside `window` — the trim `widenAndCapWindow`'s right-edge
 * discard requires on every row array a page merge touches: capping the WINDOW without also
 * dropping the rows it no longer covers would leave `setData` fed points past the axis's own
 * declared right edge. `event_time` is read structurally (never assumes a concrete row type),
 * so this serves every one of the ten series `T-05.2` pages without a copy per series. */
export function trimRowsToWindow<T extends { readonly event_time: number }>(
  rows: readonly T[],
  window: AccumulatedWindow,
): readonly T[] {
  return rows.filter((row) => row.event_time >= window.startMs && row.event_time < window.endMsExclusive);
}

/**
 * Prepends `olderRows` (a just-fetched page, strictly earlier in time) to `existingRows` —
 * never re-sorts, never dedupes: `D-C3.5`'s own contract is that a page covers
 * `[fromMs, toMs)` with `toMs === axis.startMs`, i.e. exactly the gap immediately before what is
 * already loaded, so a correct pair of arrays is ALREADY in order once concatenated. The
 * boundary check below is what catches a violation of that contract at the earliest possible
 * point — a silently mis-ordered merge would not fail until a chart drew a candle out of time
 * order, which is a rendering symptom several layers away from its actual cause.
 */
export function mergeOlderPage<T extends { readonly event_time: number }>(
  olderRows: readonly T[],
  existingRows: readonly T[],
): readonly T[] {
  const lastOlder = olderRows.at(-1);
  const firstExisting = existingRows[0];
  if (lastOlder !== undefined && firstExisting !== undefined && lastOlder.event_time >= firstExisting.event_time) {
    throw new RangeError(
      "mergeOlderPage: the new page's last row " +
        `(event_time=${lastOlder.event_time}) is not strictly before the existing rows' first ` +
        `(event_time=${firstExisting.event_time}) — the two row sets overlap or are out of order`,
    );
  }
  return [...olderRows, ...existingRows];
}
