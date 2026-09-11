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
 */

export type PanelStatus =
  | { readonly kind: "ok" }
  | {
      readonly kind: "absent";
      readonly reason: "not_in_catalog" | "missing_base_url" | "connection_refused" | "non_2xx" | "malformed_envelope";
    };

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
