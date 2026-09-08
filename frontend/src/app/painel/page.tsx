/**
 * `T-01.4`, `ADR-028/D1` — the `/painel` route is now a Server Component (`async`, no `"use
 * client"`): it calls the transport ONCE per render (`SPEC-003` §3.1), catches the ONE error
 * class the transport throws, and turns the outcome into `SourceState` — a plain, serializable
 * value handed to `PainelClient.tsx` by props (`ADR-028/D4`: the CAUSE lives in this value, not
 * in `error.tsx`, which stays a generic last-resort boundary for anything unexpected).
 *
 * `T-03.7`, `ADR-030`, `SPEC-003` §3.6 (plano 03 item 3.6): `S1`'s ONE network call moved from
 * `GET /ingest-health` to `GET /collector-status` — `S1` now shows the per-series AGGREGATE
 * `ADR-030` computes (`status` calibrated by the series' own cadence, `uptimePercent` over a
 * trailing 24h window), not the most recent `md.ingest_run` row (`ingest-health-query.ts`'s
 * `collectorRowsFromIngestHealthProjection`, the reading this route no longer uses). `RN-4`:
 * `janela_de_perda` is never read by this path at all — `ADR-030`'s formulas are defined over
 * `runs()` alone, so there is nothing to recompute here.
 *
 * No chart (`S2`, `charts/`) is mounted here — the ESLint boundary (`eslint.config.mjs`)
 * forbids `web -> charts` in either direction today; opening it is a decision for a later task.
 *
 * Neither feature's synthetic fixture module (`s1-console`/`s3-inspector`, each named
 * `fixtures` + the TS extension) is imported here or by `PainelClient.tsx` — `SPEC-003`'s
 * invariant on that filename substring across non-test `.tsx` under `src/app`/`src/features`
 * is met by this route never reading either module again. (Spelled out instead of quoted
 * verbatim in this docstring, so grepping for the literal filename never counts this comment
 * as a hit.)
 *
 * `T-01.6`, `CA-F1-14` — `metadata.title` lives here (Server Component export), the only tab
 * text `next start` ever serves for this route (`e2e/01-painel-carrega.spec.ts`'s
 * `document_title` fact).
 *
 * `T-03.3`, `SPEC-003` §3.4: `S3`'s catalog gained a SECOND network call, independent of `S1`'s
 * — `GET /series-catalog` (`series-catalog-query.ts`, built by `T-03.2`'s backend). The two
 * calls are caught SEPARATELY: a failure of the catalog fetch never overwrites an `"ok"`
 * `sourceState` that `S1`'s own call already established (a genuine partial-failure would show
 * `S1` populated and `S3`'s catalog empty, which is the honest reading of "only one of two
 * routes is unreachable" — not a case this task's DoD exercises, since both routes live on the
 * SAME FastAPI process and go up/down together in practice). When `S1`'s call itself throws,
 * `sourceState` is already `"error"` before the catalog fetch runs, and the catalog's own
 * failure just leaves it at the empty fallback — `catalog_rows:0`, never `FIXTURE_CATALOG_ROWS`.
 */

import type { Metadata } from "next";

import {
  buildS1ViewModelFromCollectorStatusProjection,
  fetchCollectorStatusProjectionViaHttp,
  TransportError,
  type CollectorStatusProjection,
} from "../../features/s1-console/collector-status-query.ts";
import type { CatalogRow, QuarantineSourceRow } from "../../features/s3-inspector/domain.ts";
import {
  catalogRowsFromSeriesCatalogProjection,
  fetchSeriesCatalogProjectionViaHttp,
} from "../../features/s3-inspector/series-catalog-query.ts";
import {
  fetchSeriesQuarantineProjectionViaHttp,
  quarantineSourceRowsFromProjection,
} from "../../features/s3-inspector/series-quarantine-query.ts";
import { EMPTY_CATALOG_FILTER, buildS3ViewModel } from "../../features/s3-inspector/view-model.ts";
import { PainelClient } from "./PainelClient.tsx";
import type { SourceState } from "./source-state.ts";

export const metadata: Metadata = {
  title: "cripto-strategy — Painel",
};

/**
 * `CA-E2E-local` §4 (2026-09-08, achado 4, escalated to `frontend-architect`): without this
 * export, Next's App Router treats this `async` Server Component as eligible for static
 * optimization the moment its FIRST render throws before reaching any fetch call — which is
 * exactly what happens during `npm run build` (`frontend/Dockerfile`), because
 * `INGEST_HEALTH_API_BASE_URL` only exists at `docker run` time (`docker-compose environment:`),
 * never at `docker build` time. `resolveCollectorStatusBaseUrl` throws `TransportError` on the
 * undefined env var SYNCHRONOUSLY, before `fetch({cache: "no-store"})` ever runs, so Next never
 * observes a dynamic API call during the build's static-analysis pass and bakes the resulting
 * "missing_base_url" error page into `.next/` with `Cache-Control: s-maxage=31536000` — a page
 * that then never re-executes, no matter what the running container's environment says
 * afterwards. `force-dynamic` is the explicit, no-tradeoff fix: it does not depend on which
 * branch a given render happens to take, unlike relying solely on `fetch`'s own
 * `cache: "no-store"` (which only disables Next's data cache for calls that are actually
 * reached, and does nothing for this route's synchronous-throw-before-fetch shape). No
 * `NEXT_PUBLIC_*` alternative was considered: `ADR-019/D4` already forbids exposing
 * `INGEST_HEALTH_API_BASE_URL` to the browser bundle.
 */
export const dynamic = "force-dynamic";

/** The shape `page.tsx` falls back to when the transport throws — 0 rows, same as a genuinely
 * empty store. `sourceState.kind` (never this fallback's shape) is what the UI reads to tell
 * the two apart (`ADR-028/D4`). */
const EMPTY_PROJECTION: CollectorStatusProjection = { as_of: "", window_hours: 24, rows: [] };

/** The shape this route falls back to when `GET /series-catalog` throws — same reasoning as
 * `EMPTY_PROJECTION` above, applied to the catalog transport instead of the aggregate one.
 * Passed RAW (not pre-filtered) so the client can re-filter it on every keystroke (`T-01.6`,
 * `RN-5`/`RF-10`: a filter control that never recomputes its rows is inert, not honest). */
const EMPTY_CATALOG: readonly CatalogRow[] = [];

/** The shape this route falls back to when `GET /series-quarantine` throws — same reasoning as
 * `EMPTY_CATALOG` above. `quarantineOk` (computed alongside it below) is what tells the drawer
 * apart from a genuinely empty quarantine table (`T-03.5`'s DoD: "gaveta mostra erro, não a
 * fixture" — `[]` alone cannot distinguish the two, the same reason `sourceState` exists at all). */
const EMPTY_QUARANTINE: readonly QuarantineSourceRow[] = [];

export default async function PainelPage() {
  let sourceState: SourceState;
  let projection: CollectorStatusProjection;

  try {
    projection = await fetchCollectorStatusProjectionViaHttp();
    sourceState = projection.rows.length === 0 ? { kind: "empty" } : { kind: "ok" };
  } catch (cause) {
    if (!(cause instanceof TransportError)) {
      throw cause;
    }
    projection = EMPTY_PROJECTION;
    sourceState = { kind: "error", error: cause.kind, status: cause.status };
  }

  let catalog: readonly CatalogRow[];
  try {
    catalog = catalogRowsFromSeriesCatalogProjection(await fetchSeriesCatalogProjectionViaHttp());
  } catch (cause) {
    if (!(cause instanceof TransportError)) {
      throw cause;
    }
    catalog = EMPTY_CATALOG;
  }

  // `T-03.5`: the quarantine drawer gained its OWN network call, independent of `S1`'s and of
  // the catalog's — `GET /series-quarantine` (`series-quarantine-query.ts`, built by `T-03.4`'s
  // backend). Caught separately, same reasoning as the catalog fetch above: a failure here never
  // overwrites `sourceState`, and `quarantineOk=false` is the ONE signal the drawer needs to show
  // an error instead of silently reading as "nenhuma série em quarentena" (`[]` is ambiguous
  // between the two; `quarantineOk` is not).
  let quarantineRows: readonly QuarantineSourceRow[];
  let quarantineOk: boolean;
  try {
    quarantineRows = quarantineSourceRowsFromProjection(await fetchSeriesQuarantineProjectionViaHttp());
    quarantineOk = true;
  } catch (cause) {
    if (!(cause instanceof TransportError)) {
      throw cause;
    }
    quarantineRows = EMPTY_QUARANTINE;
    quarantineOk = false;
  }

  // `etlQueueDepthPending`/`storageBudgetLines`/`reconnectionEvents`: no data source exists yet
  // for any of the three in this feature (Redis Streams consumer-group depth, `plano 07` itens
  // `7.6`/`7.7` — a DIFFERENT feature's scope) — `PainelClient.tsx` renders `SourceNoneMarker`
  // for all three regardless of these placeholders' value (`budgetSourced`/`reconnectionsSourced`
  // are hard-`false`, not derived from them).
  const s1 = buildS1ViewModelFromCollectorStatusProjection(projection, 0, [], []);
  const s3 = buildS3ViewModel(catalog, EMPTY_CATALOG_FILTER, null, [], [], quarantineRows);

  return (
    <PainelClient
      s1={s1}
      s3={s3}
      catalog={catalog}
      sourceState={sourceState}
      quarantineOk={quarantineOk}
    />
  );
}
