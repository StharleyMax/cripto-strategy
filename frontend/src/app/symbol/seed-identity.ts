/**
 * `T-01.F1` (`paineis-de-fluxo`, plan `01` item `1.F1`, `handoff/FIX-regressoes-fase05.md` §2) —
 * the IDENTITY of the seed `<SymbolClient>` is mounted from, as a React `key`.
 *
 * THE DEFECT THIS CLOSES: since `718cb1a` (`T-05.2`, which created `use-history-pager.ts`) the TF
 * bar was inert. Clicking `4h` `router.push`-ed `?interval=4h`, the server re-rendered with a
 * 24-candle `4h` seed, and the screen kept showing the 4583 `1m` candles it already had — the
 * pager reads its seed ONCE per mount (`use-history-pager.ts`, the `useState` initializers), and
 * `<SymbolClient>` had no `key`, so React reconciled the new render INTO the old instance and its
 * old state (`gates/DIAG-e2e-master.md` §2(c), bisect `0c9cb43` green 2/2 → `718cb1a` red 2/2).
 *
 * THE FIX: `[symbol]/page.tsx` passes `key={seedIdentityKey(...)}`. A different seed identity
 * is a different key, and React DISCARDS the old instance wholesale — every `useState`, every
 * ref, and any page still in flight for the old timeframe (it resolves onto an unmounted
 * instance, whose refs are not the new one's). That is why this is a `key` and not a hand-written
 * reset inside the hook (option 2 of `DIAG` §5.1, refused): a reset has to enumerate every piece
 * of state by hand, and forgetting one is the next `718cb1a`.
 *
 * THE THREE TERMS, and why each one is in:
 * - `interval` — the defect itself: a new TF is a new grid, a new seed.
 * - `knowledgeTimeMs` — `ADR-005/D1`, "o cache É o knowledge_time". The pager documents the
 *   instant as FIXED for the whole life of a mount; a server render with a new instant is another
 *   seed, and pages of two different `knowledge_time`s must never be merged into one window.
 * - `symbol` — the same dynamic route reuses the same component type at the same position
 *   between `/symbol/A` and `/symbol/B`, so without it React would reconcile across symbols too
 *   `[INFERRED: React reconciliation semantics for same type at same position]`.
 *
 * ⛔ WHAT THIS DOES NOT TOUCH: `SymbolClient.tsx` and `use-history-pager.ts` (the task's closed
 * scope — `T-01.5` rewrites both in the same batch). The COST, accepted in `FIX` §2: a TF change
 * remounts the chart, which is exactly what a direct load of `?interval=4h` already pays.
 *
 * `ADR-043` Leg 2 changes WHO produces the seed (client `pushState` instead of an RSC round trip);
 * the key stays the seed's identity, so that leg inherits this function rather than undoing it.
 */

/** The three terms that make two seeds the same seed. */
export interface SeedIdentity {
  readonly symbol: string;
  readonly interval: string;
  readonly knowledgeTimeMs: number;
}

/**
 * Deterministic, INJECTIVE string key for a seed identity: equal identities give equal keys, and
 * any difference in any term gives a different key.
 *
 * Injectivity comes from `JSON.stringify` of a fixed-order tuple — each string is quoted and
 * escaped, so no choice of `symbol`/`interval` can forge a separator and collide with another
 * pair. `knowledgeTimeMs` is required to be a finite number because `JSON.stringify` maps `NaN`,
 * `Infinity` and `-Infinity` all to `null`, which would make three distinct inputs one key.
 */
export function seedIdentityKey(identity: SeedIdentity): string {
  if (!Number.isFinite(identity.knowledgeTimeMs)) {
    throw new RangeError(
      `seedIdentityKey: knowledgeTimeMs must be a finite number, got ${String(identity.knowledgeTimeMs)}`,
    );
  }
  return JSON.stringify([identity.symbol, identity.interval, identity.knowledgeTimeMs]);
}
