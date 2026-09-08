"use client";

/**
 * `T-01.4`, `ADR-028/D1` — the Client Component half of `/console` (`/painel` before `SPEC-006`
 * plan `03`, `ADR-034/D2`). `page.tsx` (Server Component,
 * `async`) does the ONE network call and hands this component `{ s1, s3, sourceState }` by
 * props, all JSON-serializable (`S1ViewModel`/`S3ViewModel` are plain data, `SourceState` is a
 * plain discriminated union) — no function, no class instance, no `Date` crosses the RSC
 * boundary. Every import from `../../features/s1-console/ingest-health-query.ts` here MUST stay
 * `import type` (`local/use-client-fingerprint-boundary`, `frontend/eslint.config.mjs`); this
 * file does not import that module at all — `S1ViewModel`/`S3ViewModel` come from the two
 * `view-model.ts` modules, and `SourceState` comes from `./source-state.ts`.
 *
 * `openedSeriesId` (`M3` default, `tasks.toml` `T-01.4`) is REMOVED — there is no client state
 * left besides the catalog filter text, which the design gate keeps live (`RF-10`).
 *
 * Rendering rule, `SPEC-003` §3.3: it is `sourceState`, not `error.tsx`, that carries WHY a
 * render has no data (`ADR-028/D4`) — `S1Console`/`S3Inspector` are mounted UNCONDITIONALLY
 * (their own "sem fonte" blocks are static regardless of API health, `B7`'s "no chão idem"), and
 * only the banner above them switches on `sourceState.kind`.
 *
 * `T-01.6`: the bancada component that used to render a static "Filtro: any resultado serve"
 * paragraph here (`D1.3b`'s ESLint-`any` payload, never product copy — lives under
 * `src/features/panel/`, component named `Filter`, `.tsx` extension) is NOT imported by this
 * file or by anything else under `src/app` anymore — `SPEC-003` §4 forbids that edge outright
 * (spelled out instead of quoted verbatim so this docstring is never counted as a hit by the
 * grep that enforces the ban, the same technique `page.tsx` uses for the `fixtures` + the TS
 * extension invariant — `T-03.3` fixed THIS line too: it used to spell the literal filename out
 * in full, which made it a false hit of that very grep). It stays on disk, linted, exactly as
 * `D1.3b` needs it; this route just stops
 * being its only caller. The real catalog filter bar already lives inside `S3Inspector.tsx`,
 * and `filterText` below now actually re-filters `catalog` on every keystroke (`RN-5`: a
 * control that never recomputes what it renders is not "wired", it is decoration).
 *
 * `T-03.3`, plan `03` item `3.2`'s DoD: `catalog` is no longer always `[]` — `page.tsx` now
 * fetches `GET /series-catalog` and hands the real rows down by props. The `catalog_rows:${N}`
 * marker below is this task's own falsifier surface: `10` "de pé" (`D3.1`), `0` "no chão"
 * (transport failure ⇒ `page.tsx`'s `EMPTY_CATALOG` fallback), and it renders regardless of
 * `sourceState.kind` — unlike `rows:${s1.rows.length}` (gated to `"ok"`), the catalog count is
 * not gated on `S1`'s OWN transport succeeding, since `T-03.3`'s DoD reads it independently of
 * whichever of the two calls actually failed (`page.tsx`'s own docstring names the reasoning).
 */

import { useMemo, useState } from "react";

import { S1Console } from "../../features/s1-console/S1Console.tsx";
import type { S1ViewModel } from "../../features/s1-console/view-model.ts";
import { EMPTY_CATALOG_FILTER, filterCatalogRows, type CatalogRow } from "../../features/s3-inspector/domain.ts";
import { S3Inspector } from "../../features/s3-inspector/S3Inspector.tsx";
import { buildCatalogRowView, type S3ViewModel } from "../../features/s3-inspector/view-model.ts";
import type { SourceState } from "./source-state.ts";

export interface ConsoleClientProps {
  readonly s1: S1ViewModel;
  readonly s3: S3ViewModel;
  /** Raw catalog, unfiltered — the real 10 rows `page.tsx` fetches from `GET /series-catalog`
   * (`T-03.3`), or `[]` when that transport throws. Carried by props so the filter bar re-filters
   * something real on every keystroke (`RN-5`/`RF-10`). */
  readonly catalog: readonly CatalogRow[];
  readonly sourceState: SourceState;
  /** `T-03.5`: whether `GET /series-quarantine` answered — `false` means the drawer shows an
   * error, never the divergence fixture module (spelled out instead of quoted verbatim, same
   * technique `page.tsx`'s own docstring uses, so this comment is never counted as a hit by the
   * grep that enforces the ban) nor a silently-empty read (`page.tsx`'s own docstring on why `[]`
   * alone cannot carry this distinction). */
  readonly quarantineOk: boolean;
}

/** `DESIGN_SYSTEM.md` §9.2 rows 2-5 — the titles are static pt-BR from the `T-01.3` design
 * gate; the descriptions are a function of `sourceState` only for `non_2xx` (`{status}` is the
 * one numeral the row allows, taken from the `data-fact`, never invented). */
const ERROR_TITLE: Record<Extract<SourceState, { kind: "error" }>["error"], string> = {
  missing_base_url: "Configuração ausente",
  connection_refused: "API inacessível",
  non_2xx: "Resposta inesperada da API",
  malformed_envelope: "Resposta em formato inválido",
};

function ErrorBanner({ sourceState }: { readonly sourceState: Extract<SourceState, { kind: "error" }> }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-fact={`error_kind:${sourceState.error}`}
      className="bg-primary-container border border-surface-border p-margin-panel flex flex-col gap-1"
    >
      <h2 className="font-label-caps text-label-caps text-on-surface">{ERROR_TITLE[sourceState.error]}</h2>
      <p className="font-data-md text-data-md text-provenance-weak">
        {sourceState.error === "missing_base_url" &&
          "O endereço da API de leitura não foi definido. Confirme INGEST_HEALTH_API_BASE_URL no ambiente e reinicie."}
        {sourceState.error === "connection_refused" &&
          "Não foi possível conectar à API de leitura. Verifique se o processo está no ar na porta configurada."}
        {sourceState.error === "non_2xx" && (
          <>
            A API respondeu com status{" "}
            <span data-fact={`status:${sourceState.status}`}>{sourceState.status}</span>. Verifique os
            logs do processo da API para a causa.
          </>
        )}
        {sourceState.error === "malformed_envelope" &&
          "A API respondeu, mas o envelope não tem os campos esperados (ADR-019/D2). Verifique a versão da API."}
      </p>
    </div>
  );
}

function EmptyBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-fact="ui_state:empty"
      className="bg-primary-container border border-surface-border p-margin-panel flex flex-col gap-1"
    >
      <h2 className="font-label-caps text-label-caps text-on-surface">Nenhuma coleta registrada ainda</h2>
      <p className="font-data-md text-data-md text-provenance-weak">
        O store não tem execuções. Nenhum número é exibido porque nenhum foi produzido.
      </p>
    </div>
  );
}

export function ConsoleClient({ s1, s3, catalog, sourceState, quarantineOk }: ConsoleClientProps) {
  const [filterText, setFilterText] = useState("");

  // `T-01.6`, `RN-5`/`RF-10`: recomputed on every keystroke, over the RAW `catalog` prop, not
  // over `s3.catalogRows` (which was built once, server-side, against `EMPTY_CATALOG_FILTER`).
  // `T-03.3`: `catalog` is now the real 10 rows `page.tsx` fetches from `GET /series-catalog`
  // (`0` "no chão" — transport failure, never `FIXTURE_CATALOG_ROWS`).
  const catalogRows = useMemo(
    () => filterCatalogRows(catalog, { ...EMPTY_CATALOG_FILTER, text: filterText }).map(buildCatalogRowView),
    [catalog, filterText],
  );

  return (
    <main data-fact={sourceState.kind === "ok" ? "ui_state:ok" : undefined}>
      <h1 className="sr-only">Painel de Observabilidade de Ingestão</h1>
      {sourceState.kind === "error" && <ErrorBanner sourceState={sourceState} />}
      {sourceState.kind === "empty" && <EmptyBanner />}
      {sourceState.kind === "ok" && (
        <span data-fact={`rows:${s1.rows.length}`} className="sr-only" />
      )}
      {/* `T-03.3`: unlike `rows:${N}` above, this is NOT gated to `sourceState.kind === "ok"` —
          the catalog fetch is caught independently of `S1`'s own call (`page.tsx`), so its count
          is meaningful ("de pé" = 10, "no chão" = 0, `plano 03` `D3.1`) regardless of which of
          the two transports produced whichever `sourceState` this render has. */}
      <span data-fact={`catalog_rows:${catalogRows.length}`} className="sr-only" />
      <S1Console viewModel={s1} budgetSourced={false} reconnectionsSourced={false} />
      <S3Inspector
        viewModel={{ ...s3, catalogRows }}
        filterText={filterText}
        onFilterTextChange={setFilterText}
        quarantineOk={quarantineOk}
      />
    </main>
  );
}
