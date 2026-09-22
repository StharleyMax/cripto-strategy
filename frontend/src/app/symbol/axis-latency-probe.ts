/**
 * `T-02.7` (`CST-214`, `RNF-2`) — the ONLY place this feature writes a wall-clock timestamp for
 * an e2e gate to read back. `axis-sync.ts` stays free of `performance.now()` on purpose (see its
 * own docstring for `onRangeApplied`); this module is `web`'s side of that contract: it is what
 * `axis-sync-provider.tsx` calls FROM the hook, and it is what `frontend/e2e/16-*.spec.ts` reads
 * off `window` after driving a real drag against the production build (`make e2e` runs `next
 * build`/`next start`, never `next dev` — `scripts/e2e-env.sh`).
 *
 * Kept in its own module, separate from `axis-sync-provider.tsx`, for the same reason
 * `axis-sync.ts` is separate from that file: this is the one function in the whole `AxisSyncStore`
 * wiring that touches `window`, so `node --test` (`axis-latency-probe.test.ts`) can prove ITS
 * behaviour — guard against `window === undefined`, the cap, the identity of the array returned
 * across calls — without a DOM, and nothing else in this feature's latency path needs to import
 * `jsdom` to be tested at all.
 *
 * ⛔ WHY THIS RUNS IN PRODUCTION, ALWAYS, NOT BEHIND A BUILD FLAG: `T-02.7`'s gate measures the
 * bundle `make e2e` actually serves (`next build`), and a flag gating this out of that bundle
 * would make the gate measure code nobody ships. The cost is bounded on purpose (`MAX_SAMPLES`)
 * so a real operator's tab cannot grow this array without bound over a long session — it is a
 * ring buffer, not a log.
 */

/** Generous relative to `T-02.7`'s own `n >= 60` — enough for several drags in one page life
 * without ever becoming the kind of allocation a long-lived tab would notice. */
const MAX_SAMPLES = 2_000;

export interface AxisLatencyProbe {
  /** Wall-clock instants (`performance.now()`, monotonic, milliseconds) of every axis range
   * application that actually changed at least one OTHER panel — `axis-sync.ts`'s
   * `onRangeApplied`, never an echo or a guard-dropped reentrant notification. Oldest-first. */
  readonly samplesMs: number[];
  /** Empties the buffer without replacing the array's identity — a spec that captured a
   * reference to `window.__axisLatencyProbe` before calling this still sees it drain. */
  reset(): void;
}

declare global {
  interface Window {
    __axisLatencyProbe?: AxisLatencyProbe;
  }
}

/** Lazily creates and returns the ONE probe a page life ever has, or `null` outside a browser
 * (`node --test` has no `window` — this must never throw there, since `axis-sync-provider.tsx`
 * is imported, even if not mounted, by modules `test:app`'s glob can reach). */
function probe(): AxisLatencyProbe | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.__axisLatencyProbe === undefined) {
    const samplesMs: number[] = [];
    window.__axisLatencyProbe = {
      samplesMs,
      reset() {
        samplesMs.length = 0;
      },
    };
  }
  return window.__axisLatencyProbe;
}

/**
 * Records ONE axis-range-application instant. `axis-sync-provider.tsx` calls this, and only
 * this, from `createAxisSyncStore`'s `onRangeApplied` hook — the timestamp is read HERE, at the
 * moment the hook fires, not passed in, so there is exactly one clock in this path.
 */
export function recordAxisRangeApplied(): void {
  const p = probe();
  if (p === null) {
    return;
  }
  if (p.samplesMs.length >= MAX_SAMPLES) {
    // Ring-buffer eviction, oldest first — `shift()` over `MAX_SAMPLES = 2_000` is cheap enough
    // that a dedicated circular index would only add a second thing to get wrong for no
    // measured benefit at this size.
    p.samplesMs.shift();
  }
  p.samplesMs.push(performance.now());
}
