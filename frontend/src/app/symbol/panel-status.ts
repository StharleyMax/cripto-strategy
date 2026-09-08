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
