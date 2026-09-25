/**
 * `T-05.9` (`CST-242`, plan `05` DoD 7) — the ONLY place this feature writes a wall-clock
 * timestamp for the history-paging latency gate to read back. Same split `axis-latency-probe.ts`
 * already establishes for `T-02.7`'s sibling ceiling (`p95 <= 16 ms` per pan frame): the DECISION
 * of what counts as "the border was detected" / "the new bar is drawn" lives where the event
 * actually happens (`use-history-pager.ts`'s `onCandidateRange`, `SymbolClient.tsx`'s price-panel
 * `build` callback) — this module is only the clock, kept in its own file so `node --test`
 * (`history-page-latency-probe.test.ts`) can prove its `window === undefined` guard and its
 * ring-buffer cap without a DOM.
 *
 * ── THE TWO INSTANTS, AND WHY THEY ARE TWO SEPARATE ARRAYS, NEVER ONE PAIR RECORDED TOGETHER ──
 *
 * `requestedMs` — `use-history-pager.ts`'s `onCandidateRange`, the instant `historyRequest`
 * decided a page is actually warranted (`req !== null`), BEFORE `fetchPage` is even invoked. This
 * is "a borda é detectada" (plan `05` DoD 7's own words) — never the instant `fetch()` resolves,
 * which is what `[MEDIDO]`-labelled discipline in this repo exists to prevent someone from
 * measuring instead (`MEMORY.md`: "Assert de DOM não prova pixel" — here the analogous mistake
 * would be "resposta HTTP não prova pixel").
 *
 * `drawnMs` — `SymbolClient.tsx`'s price-panel `build` callback, the instant
 * `candleSeries.setData(...)` is CALLED with the panel's current (possibly page-widened) slots.
 * `useLightweightChart`'s own contract (see its docstring) is that `build` only re-runs when the
 * `AxisSyncStore` identity itself changes — which `use-history-pager.ts`'s successful page does,
 * on purpose (`axis-sync-provider.tsx`'s own docstring: "a widened window after a page arrives is
 * a new `axis`, on purpose"), tearing down and rebuilding all six `IChartApi` instances. So this
 * instant is, for the PRICE panel specifically, the earliest JS-observable moment the NEW bar
 * exists in the chart library's own data — the literal `setData` the plan's DoD 7 names as the
 * difference between "resposta chegou" and "pixel".
 *
 * Recording them as two independent arrays (not one struct per page) mirrors
 * `axis-latency-probe.ts`'s own `samplesMs` shape and keeps this module ignorant of PAIRING —
 * `use-history-pager.ts`'s own serial, one-in-flight discipline (`D-C3.5`) is what makes
 * `requestedMs[i]`/`drawnMs[i]` a valid pair for the caller that reads them back
 * (`frontend/e2e/20-*.spec.ts`), not something this probe enforces or could enforce (it has no
 * visibility into whether a fetch it wasn't told about is still in flight).
 *
 * ⛔ WHY THIS RUNS IN PRODUCTION, ALWAYS, NOT BEHIND A BUILD FLAG: same reasoning
 * `axis-latency-probe.ts` already states for its own sibling gate — a flag gating this out of the
 * bundle `make e2e` serves (`next build`) would make the gate measure code nobody ships. The cost
 * is bounded (`MAX_SAMPLES`) for the same "ring buffer, not a log" reason.
 */

/** Generous relative to plan `05` DoD 7's own `n >= 10` — enough for several drag sessions in one
 * page life without the kind of unbounded allocation a long-lived tab would notice. */
const MAX_SAMPLES = 2_000;

export interface HistoryPageLatencyProbe {
  /** Wall-clock instants (`performance.now()`, monotonic, milliseconds) of every instant
   * `use-history-pager.ts`'s `onCandidateRange` decided a page was warranted (`historyRequest`
   * returned non-`null`) — "a borda é detectada", oldest-first. */
  readonly requestedMs: number[];
  /** Wall-clock instants of every `candleSeries.setData(...)` call in the price panel's `build`
   * callback — "a barra nova está desenhada", oldest-first. Includes the INITIAL mount's own
   * `setData` (there is no page request behind it); a caller that wants only page-triggered pairs
   * calls `reset()` once the initial paint has settled, before driving any drag. */
  readonly drawnMs: number[];
  /** `T-01.10` (`handoff/T-01.10-desenho.md` §3 item 6) — the DURATION, in milliseconds, of the
   * chart host's page application (every `setData` of one page, carrier first), one per page, in
   * the same order as `drawnMs`. It is `F-B`'s measure: less sensitive to machine load than the
   * interval between gestures, and comparable across `?e2eDenseSeries=1` in the same run. */
  readonly applyMs: number[];
  /** Empties every buffer without replacing either array's identity — a spec that captured a
   * reference to `window.__historyPageLatencyProbe` before calling this still sees both drain. */
  reset(): void;
}

declare global {
  interface Window {
    __historyPageLatencyProbe?: HistoryPageLatencyProbe;
  }
}

/** Lazily creates and returns the ONE probe a page life ever has, or `null` outside a browser
 * (`node --test` has no `window` — this must never throw there, since both call sites below are
 * reached by modules `test:app`'s glob imports even when nothing mounts). */
function probe(): HistoryPageLatencyProbe | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.__historyPageLatencyProbe === undefined) {
    const requestedMs: number[] = [];
    const drawnMs: number[] = [];
    const applyMs: number[] = [];
    window.__historyPageLatencyProbe = {
      requestedMs,
      drawnMs,
      applyMs,
      reset() {
        requestedMs.length = 0;
        drawnMs.length = 0;
        applyMs.length = 0;
      },
    };
  }
  return window.__historyPageLatencyProbe;
}

function pushCapped(samples: number[], instantMs: number): void {
  if (samples.length >= MAX_SAMPLES) {
    // Ring-buffer eviction, oldest first — same `shift()` choice `axis-latency-probe.ts` makes
    // at the same cap size, for the same reason: cheap enough here that a circular index would
    // only add a second thing to get wrong for no measured benefit.
    samples.shift();
  }
  samples.push(instantMs);
}

/** Records ONE "borda detectada" instant. `use-history-pager.ts` calls this, and only this, from
 * `onCandidateRange` at the moment `historyRequest` returns non-`null` — before `fetchPage` is
 * invoked, so the clock reads the DECISION, never the network. */
export function recordHistoryPageRequested(): void {
  const p = probe();
  if (p === null) {
    return;
  }
  pushCapped(p.requestedMs, performance.now());
}

/** Records ONE "barra desenhada" instant. `SymbolClient.tsx`'s price-panel `build` callback
 * calls this, and only this, right after its own `candleSeries.setData(...)` call. */
export function recordHistoryPageDrawn(): void {
  const p = probe();
  if (p === null) {
    return;
  }
  pushCapped(p.drawnMs, performance.now());
}

/** `T-01.10` — records ONE page application's duration. The chart host (`SymbolClient.tsx`) calls
 * this, and only this, on every page, with the `performance.now()` difference around its apply loop. */
export function recordHistoryPageApplied(durationMs: number): void {
  const p = probe();
  if (p === null) {
    return;
  }
  pushCapped(p.applyMs, durationMs);
}
