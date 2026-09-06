/**
 * `T-01.4` — the one discriminant `page.tsx` (Server Component, `ADR-028/D1`) computes and
 * hands to `PainelClient.tsx` (`"use client"`) by props. `SPEC-003` §3.1:
 *
 *   `SourceState` = `{ kind: "ok" } | { kind: "empty" } | { kind: "error"; error: TransportErrorKind }`
 *
 * It is `SourceState`, not `error.tsx`, that carries the failure CAUSE (`ADR-028/D4`):
 * `error.tsx` is a Client Component and, in a production build, the App Router redacts the
 * `message` of an error thrown on the server down to an opaque `digest` — three distinct
 * causes routed through `error.tsx` would collapse into one indistinguishable boundary in
 * `next start` even though they read as three in `next dev`. `page.tsx` therefore never
 * THROWS a `TransportError` past itself; it catches it and turns it into this typed value,
 * which crosses the Server/Client boundary as a plain, serializable object (RSC-safe: no
 * `Error` instance, no function, no `Date`).
 *
 * This module carries only the TYPE, so a `"use client"` file can `import type` it without
 * ever touching `ingest-health-query.ts`'s value exports (`D6.4`, the same boundary
 * `frontend/eslint.config.mjs`'s `local/use-client-fingerprint-boundary` enforces).
 */

import type { TransportErrorKind } from "../../features/s1-console/ingest-health-query.ts";

export type SourceState =
  | { readonly kind: "ok" }
  | { readonly kind: "empty" }
  | { readonly kind: "error"; readonly error: TransportErrorKind; readonly status?: number };
