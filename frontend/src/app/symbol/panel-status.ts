/**
 * `T-02.4` — the ONE discriminant `page.tsx` computes per panel (price/OI/CVD) and hands to
 * `SymbolClient.tsx` (`"use client"`) by props. Mirrors `console/source-state.ts`'s own
 * reasoning field-for-field: `page.tsx` never throws a `TransportError` past itself, it
 * catches it and turns it into this typed value, which crosses the Server/Client boundary as a
 * plain, serializable object (RSC-safe — no `Error` instance, no function, no `Date`).
 *
 * `"not_in_catalog"` is a FOURTH reason, beyond the three `TransportErrorKind`s the catalog/
 * history transports can throw — it names the (today, real) case where `GET /series-catalog`
 * answered fine but carries no row this panel's selector matches (`page.tsx`'s own docstring:
 * measured true for CVD today, since no catalog builder produces a `cvd_delta`-shaped row).
 *
 * ── `T-03.5`: `"ambiguous_in_catalog"`, THE SIXTH REASON, AND THE ONE THAT COULD NOT BE SAID ──
 *
 * Until it existed, a selector matching MORE than one catalog row had no way to say so:
 * `Array.prototype.find` answered the first of them and the page rendered a panel pointed at a
 * series nobody publishes, with `kind: "ok"` on its status. That is not a hypothetical — it is
 * the measured defect of `handoff/T-03.5-T-03.6-FRONT.md` §2 (`metric === "sum_open_interest"`
 * matches FIVE rows; the first has 0 rows in `md.series`, the fifth has 8.064).
 *
 * ⛔ THE POINT IS NOT THE STRING, IT IS THAT THE STATE BECAME EXPRESSIBLE. A wrong panel that
 * reports success is a defect only a human can find, weeks later, in production (and one did:
 * fase `04` of `pagina-de-grafico-s2`). A panel that says "o catálogo tem N candidatas e eu não
 * escolho por posição" is a defect the SCREEN reports, in the same render.
 */

export type PanelStatus =
  | { readonly kind: "ok" }
  | {
      readonly kind: "absent";
      readonly reason:
        | "not_in_catalog"
        | "ambiguous_in_catalog"
        | "missing_base_url"
        | "connection_refused"
        | "non_2xx"
        | "malformed_envelope";
    };

/**
 * `T-03.5`/`RNF-2` — how old a panel's newest readable point is, against the ceiling the
 * catalog publishes for its series (`SeriesCatalogEntry.maxStalenessMs`).
 *
 * ⛔ IT LIVES IN THIS MODULE, AND NOT IN `view-model.ts` WHERE ITS FUNCTION LIVES, FOR ONE
 * STRUCTURAL REASON: `SymbolClient.tsx` is `"use client"` and must not import `view-model.ts`,
 * which reaches `node:crypto` through `series-key-id.ts` — `web-fullstack.browser-imports-server`
 * is a BLOQUEIO, and a type-only import is not a defence a regex-based rule can be asked to
 * understand. `panel-status.ts` is the dependency-free plain-data contract both halves already
 * import, which makes it the only place the two sides can share a shape without one of them
 * reaching across the RSC boundary. The FUNCTION that computes it stays server-side
 * (`view-model.ts::resolveFreshnessVerdict`); only the SHAPE crosses.
 *
 * `unknown` is not "fresh with a missing number": it is the verdict for two different
 * ignorances — no readable point at all, and no ceiling published — and neither one licenses the
 * screen to claim the data is current.
 */
export type FreshnessVerdict =
  | { readonly kind: "fresh"; readonly ageMs: number; readonly observedMs: number; readonly ceilingMs: number }
  | { readonly kind: "stale"; readonly ageMs: number; readonly observedMs: number; readonly ceilingMs: number }
  | { readonly kind: "unknown"; readonly ageMs: null; readonly observedMs: null; readonly ceilingMs: number | null };

/**
 * `T-01.7` — the four statuses `/symbol` computes today, named once so `page.tsx` and
 * `SymbolClient.tsx` cannot drift on the set.
 *
 * `volume` is a FOURTH status for a THIRD chart surface, and that is not a contradiction: it is
 * the sub-axis of the price panel (`SPEC-007 §3.6`), not a panel of its own, but it is fetched
 * from its OWN `series_key_id` (`klines_volume`, `SPEC-007 §4`) and therefore fails and degrades
 * on its own — price can be present while volume is absent, and the operator has to be able to
 * tell which of the two is missing. `PanelStatus`'s existing five reasons cover it unchanged;
 * `not_in_catalog` is the live one until `T-01.6`'s catalog entry reaches the environment being
 * looked at.
 */
export interface SymbolPanelStatuses {
  readonly price: PanelStatus;
  readonly oi: PanelStatus;
  readonly cvd: PanelStatus;
  readonly volume: PanelStatus;
}
