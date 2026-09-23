/**
 * `T-05.2` — `route.ts`'s `TransportError.kind` -> HTTP status mapping, pulled into its own pure
 * module so it is provable under plain `node --test`.
 *
 * `route.ts` itself imports `next/server` (`NextRequest`/`NextResponse`), which this repo's
 * `node --test` harness cannot resolve outside a real Next build (`next/server`'s own package
 * export map needs the `next`/`edge-light` conditions a bare `node --conditions=react-server`
 * run does not supply — `[MEDIDO 2026-09-23: node --conditions=react-server --test` against a
 * file importing `next/server` throws `ERR_MODULE_NOT_FOUND`, zero existing `route.ts` in this
 * repo to have surfaced this before `T-05.2`]`). Splitting the one piece of this route with real
 * branching logic into a module with NO `next` import keeps it testable the same way every other
 * pure function in this codebase is, while the thin proxy around it stays what it is: a few lines
 * with nothing to unit-test that `npm run typecheck` does not already prove.
 */

export type TransportErrorKindLike = "missing_base_url" | "connection_refused" | "non_2xx" | "malformed_envelope";

/** `missing_base_url` is a deployment defect (the operator forgot to configure the environment,
 * `503`); `connection_refused`/`malformed_envelope` are the backend being unreachable or
 * misbehaving (`502`, this proxy's own fault-of-the-upstream code); `non_2xx` forwards the
 * backend's OWN status when it gave one, so a `422` (a window past the 90-day ceiling, `T-05.4`)
 * reaches the paginator as a `422`, not a generic `502` that would hide WHY the backend refused. */
export function statusForTransportErrorKind(kind: TransportErrorKindLike, upstreamStatus: number | undefined): number {
  switch (kind) {
    case "missing_base_url":
      return 503;
    case "non_2xx":
      return upstreamStatus ?? 502;
    case "connection_refused":
    case "malformed_envelope":
      return 502;
    default: {
      const exhaustive: never = kind;
      throw new Error(`statusForTransportErrorKind: unreachable kind ${String(exhaustive)}`);
    }
  }
}
