"use client";

/**
 * `T-01.4`, `ADR-028/D1` — the Client Component half of `/painel`. `page.tsx` (Server Component,
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
 */

import { useState } from "react";

import { Filter } from "../../features/panel/Filter.tsx";
import { S1Console } from "../../features/s1-console/S1Console.tsx";
import type { S1ViewModel } from "../../features/s1-console/view-model.ts";
import { S3Inspector } from "../../features/s3-inspector/S3Inspector.tsx";
import type { S3ViewModel } from "../../features/s3-inspector/view-model.ts";
import type { SourceState } from "./source-state.ts";

export interface PainelClientProps {
  readonly s1: S1ViewModel;
  readonly s3: S3ViewModel;
  readonly sourceState: SourceState;
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

export function PainelClient({ s1, s3, sourceState }: PainelClientProps) {
  const [filterText, setFilterText] = useState("");

  return (
    <main data-fact={sourceState.kind === "ok" ? "ui_state:ok" : undefined}>
      <Filter />
      {sourceState.kind === "error" && <ErrorBanner sourceState={sourceState} />}
      {sourceState.kind === "empty" && <EmptyBanner />}
      {sourceState.kind === "ok" && (
        <span data-fact={`rows:${s1.rows.length}`} className="sr-only" />
      )}
      <S1Console viewModel={s1} budgetSourced={false} reconnectionsSourced={false} />
      <S3Inspector viewModel={s3} filterText={filterText} onFilterTextChange={setFilterText} />
    </main>
  );
}
