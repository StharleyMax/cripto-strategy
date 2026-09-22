/**
 * `T-03.9` (`CST-224`, plan `03` item `3.6`, `RF-6`) — the ONE list the TF bar renders from.
 *
 * `ADR-040/D1`: **"A barra de TF de `web` passa a ter um conjunto SERVIDO pelo backend, não
 * escrito à mão no front — senão o front oferece um TF que a rota recusa, e o `422` vira defeito
 * de tela."** The backend's own set is `SUPPORTED_INTERVALS`
 * (`backend/src/modules/sentimento/use_cases/series_history.py:75`, a `frozenset[str]`) plus its
 * per-member width, `_INTERVAL_STEP_MS` (same file, `:83-89`) — both `Final`, both literal Python
 * data, not served by any HTTP endpoint today (`series-catalog` carries per-SERIES metadata, not
 * the route's own accepted-`interval` domain; `openapi.json` would technically carry the
 * `Literal`'s enum, but parsing a generated schema for five strings is a heavier, more fragile
 * dependency than the ONE thing this module actually needs to guarantee — see below).
 *
 * `SUPPORTED_TIMEFRAMES` below is a **transcription** of that Python literal, same discipline
 * `[symbol]/page.tsx`'s own `PILOT_SYMBOLS` already uses for `AVAILABILITY_PROBE_SYMBOLS`
 * ("read — never re-derived"). What makes THIS transcription safe against the exact divergence
 * `ADR-040/D1` names is `supported-timeframes.test.ts`: it reads the backend `.py` SOURCE FILE
 * as text (never imports Python, never runs it) and fails the moment this array and that file
 * disagree, on either the SET of intervals or their `stepMs`. That test is the mechanism —
 * without it, "transcribed with a citation" is exactly the "escrito à mão" pattern `ADR-040/D1`
 * warns is a 422-behind-a-live-button waiting to happen; the sync test is what turns a comment
 * into a guarantee.
 *
 * `TimeframeBar` (`SymbolClient.tsx`) renders ONE button per entry of `SUPPORTED_TIMEFRAMES`,
 * via `.map()` — never one hand-written `<button>` per label. That is the DoD this task states
 * literally: *"remover um TF do conjunto servido remove o botão, sem tocar no componente"* —
 * shrink THIS array (kept honest by the sync test) and the render shrinks with it, no second
 * edit anywhere else. `timeframe-bar-dom-contract.test.ts` is the source-scan that proves the
 * component actually maps rather than duplicating the list a second time in JSX.
 *
 * ✅ `T-03.11` (`CST-226`) CLOSED THE GAP THIS SECTION USED TO DESCRIBE. `interval` now threads
 * through `page.tsx`'s `fetchPanelRows`/`resolveRouteWindow` (`?interval=`, validated against
 * this module's own `isSupportedTimeframe`) — the two backend prerequisites named below are both
 * merged on that branch, and `T-03.11`'s own DoD (`plan 03` DoD 6/7/8) is the falsifier that
 * re-verified the wire-grid/staircase counts under a non-`1m` interval before the wiring landed.
 * Left below, UNEDITED, as the record of the decision that DEFERRED it past `T-03.9`:
 *
 * ⛔ WHAT THIS MODULE DID NOT DO YET, AS OF `T-03.9`: thread `interval` through `page.tsx`'s
 * `fetchPanelRows`/`resolveRouteWindow`, so selecting a TF changed the BAR's own selection state
 * and nothing else on screen. Wiring the actual reaggregated refetch was deliberately left to a
 * later task — the two backend prerequisites `ADR-040/D3`'s partial-coverage marks (`T-03.4`,
 * `{present, expected}`) and the `coverage` envelope field (`T-03.6`, `sentimento`) were NOT on
 * that branch yet (`git log`, 2026-09-22: only `T-03.1`/`T-03.3`/`T-03.5` merged), and the
 * wire-grid/staircase counts several panels already published (`GA-2`, "5× native-bars") were
 * PROVEN correct only for `interval=1m` at that point — `T-03.11`'s own DoD (`plan 03 DoD 8`) was
 * named, in advance, as the falsifier for what changes once a NON-default `interval` reaches
 * those counts. Wiring a real refetch at `T-03.9`, against prerequisites not yet merged and a
 * correctness matrix not yet proven, would have been exactly the "alargar só o literal sem
 * religar" shortcut `T-03.3`'s own gate report names as the shape of the defect `ADR-034/D6`
 * exists to forbid.
 */

/** One entry of the backend's `SUPPORTED_INTERVALS` — the wire value the route's `interval`
 * query param expects verbatim, and its width in epoch-ms (mirrors `_INTERVAL_STEP_MS`). */
export interface TimeframeOption {
  readonly interval: string;
  readonly stepMs: number;
}

/**
 * Verbatim transcription of `SUPPORTED_INTERVALS`/`_INTERVAL_STEP_MS`
 * (`series_history.py:75,83-89`) — ORDER matches the backend's own `sorted()` presentation
 * (ascending width), which is also the natural reading order for a TF bar. Every `stepMs` below
 * is an integer multiple of `_GRID_STEP_MS` (60 000 ms), same invariant the backend dict's own
 * comment states — UTC-aligned bucket boundaries, no calendar parsing.
 */
export const SUPPORTED_TIMEFRAMES: readonly TimeframeOption[] = [
  { interval: "1m", stepMs: 60_000 },
  { interval: "5m", stepMs: 5 * 60_000 },
  { interval: "15m", stepMs: 15 * 60_000 },
  { interval: "1h", stepMs: 60 * 60_000 },
  { interval: "4h", stepMs: 4 * 60 * 60_000 },
];

/** The route's pre-`T-03.9` behaviour, and the bar's initial selection — the ONE member that
 * was ever servable before `ADR-040/D1` (`ADR-034/D6`), so defaulting to it changes nothing about
 * what the screen already shows on first paint. */
export const DEFAULT_TIMEFRAME = "1m";

/** Whether `candidate` is a member of the backend's served set — same predicate the route itself
 * applies (`interval not in SUPPORTED_INTERVALS`), read off THIS module's own array so the two
 * checks can never drift relative to each other even if they drift from the backend (which the
 * sync test alone guards). */
export function isSupportedTimeframe(candidate: string): boolean {
  return SUPPORTED_TIMEFRAMES.some((option) => option.interval === candidate);
}
