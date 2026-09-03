/**
 * `T-06.10` — presentational translation of the `S3` design decision
 * (`docs/context/plataforma-dados/gates/T-06.10-design.md`).
 *
 * Same tier as `src/features/s1-console/S1Console.tsx` and `src/features/panel/Filter.tsx`:
 * this package has no React dependency, no `tsconfig.json`, and no renderer — this component is
 * valid, lint-checked TSX, typed against `S3ViewModel` (`view-model.ts`), meant to be mounted
 * once the Next.js application exists (a different task's scope, `src/app/routes.ts`). It is
 * linted, not executed, by this task's test suite.
 *
 * ⚠️ Design gate PENDING (`T-06.10-design.md` §6): the tokens/classes below are reused verbatim
 * from `S1Console.tsx` (already gated by `ux-ui-mastery`,
 * `docs/context/plataforma-dados/gates/T-07.12-ux-critique.md`) — this SPECIFIC composition
 * (catalog + raw-rows + quarantine drawer on one screen) has not itself been through a
 * `/design-critique` round or a successful Stitch generation. See the design gate file before
 * treating this component as visually settled.
 *
 * Three layers, per the design decision:
 *   1. Catálogo filtrável (`CAMADA 1`) — the table + filter bar.
 *   2. Inspeção de linhas cruas (`CAMADA 2`) — opens below, for whichever series is selected.
 *   3. Gaveta de quarentena — a collapsible aside, always present, never a separate route.
 *
 * Color governance followed here (`STITCH_CONTEXT.md` §9, items 1-6, `DESIGN_SYSTEM.md`):
 *   - Quarantine badge: LOSANGO (glyph `diamond`) + word `QUARENTENA` + violet `#e0aaff` ink,
 *     in that order — never a filled area, never red.
 *   - Gap rows: neutral ink (`text-provenance-weak`), never red — incomplete data is OPERATIONAL
 *     severity, not integrity.
 *   - The "abrir" action per catalog row is plain text, not a colored button — action lives in
 *     luminance/border, never hue (`ADR-010`).
 */

import type { S3ViewModel } from "./view-model.ts";

export interface S3InspectorProps {
  readonly viewModel: S3ViewModel;
  /** Free text typed into the filter bar, echoed back so the input stays controlled. */
  readonly filterText: string;
  readonly onFilterTextChange: (text: string) => void;
  readonly onOpenSeries: (seriesKeyId: string) => void;
}

/** The one glyph the quarantine channel uses — a LOSANGO VAZADO, never a triangle or a circle
 * (`STITCH_CONTEXT.md` §9 item 4: those two shapes belong to dashboard severity and would bring
 * red back by habit). Material Symbols' `diamond`, outlined, is the closest built-in shape to
 * "losango vazado" already available to this codebase's icon font (`material-symbols-outlined`,
 * the same family `S1Console.tsx` uses for `stop_circle`). */
const INTEGRITY_DIAMOND_GLYPH = "diamond";

/** `#e0aaff` — `--dado-quebrado-ink`, dark mode (`DESIGN_SYSTEM.md` §1.4-bis). The ONLY place
 * this component uses this hex: the glyph and the word beside it, both `ink`, never a fill. */
const INTEGRITY_INK_CLASS = "text-[#e0aaff]";

export function S3Inspector({
  viewModel,
  filterText,
  onFilterTextChange,
  onOpenSeries,
}: S3InspectorProps) {
  return (
    <div className="flex flex-1 min-h-0">
      <section className="flex-1 flex flex-col min-w-0 gap-gutter">
        {/* CAMADA 1 — catálogo filtrável */}
        <div className="bg-primary-container flex flex-col min-h-0">
          <header className="h-8 bg-surface-lowest flex items-center px-margin-panel border-b border-surface-border shrink-0">
            <h2 className="font-label-caps text-label-caps text-on-surface">
              Catálogo de Séries
            </h2>
          </header>
          <div className="px-margin-panel py-2 border-b border-surface-border shrink-0">
            <input
              type="text"
              value={filterText}
              onChange={(event) => onFilterTextChange(event.target.value)}
              placeholder="filtrar por símbolo, métrica, fonte..."
              className="w-full bg-transparent border border-surface-border px-2 py-1 font-data-md text-data-md text-on-surface outline-none focus:outline-2 focus:outline-offset-2 focus:outline-[#8b949e]"
            />
          </div>
          <div className="flex-1 overflow-auto p-margin-panel">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="py-2 pr-4 font-label-caps text-label-caps text-provenance-weak font-normal">
                    SÉRIE
                  </th>
                  <th className="py-2 px-4 font-label-caps text-label-caps text-provenance-weak font-normal">
                    PROCEDÊNCIA
                  </th>
                  <th className="py-2 px-4 font-label-caps text-label-caps text-provenance-weak font-normal text-right">
                    COMPLETUDE
                  </th>
                  <th className="py-2 px-4 font-label-caps text-label-caps text-provenance-weak font-normal">
                    INTEGRIDADE
                  </th>
                  <th className="py-2 pl-4 font-label-caps text-label-caps text-provenance-weak font-normal text-right">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody className="font-data-md text-data-md tabular-nums text-on-surface">
                {viewModel.catalogRows.map((row) => (
                  <tr
                    key={row.seriesKeyId}
                    className="border-b border-surface-border hover:bg-surface-border group"
                  >
                    <td className="py-2 pr-4 truncate">{row.label}</td>
                    <td className="py-2 px-4 text-provenance-strong">{row.provenance}</td>
                    <td className="py-2 px-4 text-right text-provenance-weak">
                      {row.completenessText}
                    </td>
                    <td className="py-2 px-4">
                      {row.quarantineBadge.isQuarantined ? (
                        <span className={`flex items-center gap-1 font-label-caps text-label-caps ${INTEGRITY_INK_CLASS}`}>
                          <span
                            className="material-symbols-outlined text-[14px]"
                            aria-hidden="true"
                          >
                            {INTEGRITY_DIAMOND_GLYPH}
                          </span>
                          {row.quarantineBadge.word}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pl-4 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenSeries(row.seriesKeyId)}
                        className="font-label-caps text-label-caps text-provenance-weak hover:text-provenance-strong underline decoration-dotted focus:outline-2 focus:outline-offset-2 focus:outline-[#8b949e]"
                      >
                        abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CAMADA 2 — inspeção de linhas cruas, D6.15: src_label_raw NA MESMA LINHA que event_time */}
        {viewModel.selectedSeriesLabel !== null && (
          <div className="bg-primary-container flex flex-col min-h-0 flex-1">
            <header className="h-8 bg-surface-lowest flex items-center px-margin-panel border-b border-surface-border shrink-0">
              <h2 className="font-label-caps text-label-caps text-on-surface truncate">
                Linhas Cruas — {viewModel.selectedSeriesLabel}
              </h2>
            </header>
            <div className="flex-1 overflow-auto p-margin-panel">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="py-2 pr-4 font-label-caps text-label-caps text-provenance-weak font-normal">
                      EVENT_TIME
                    </th>
                    <th className="py-2 px-4 font-label-caps text-label-caps text-provenance-weak font-normal">
                      SRC_LABEL_RAW
                    </th>
                    <th className="py-2 px-4 font-label-caps text-label-caps text-provenance-weak font-normal">
                      PROCEDÊNCIA
                    </th>
                    <th className="py-2 pl-4 font-label-caps text-label-caps text-provenance-weak font-normal">
                      VALORES
                    </th>
                  </tr>
                </thead>
                <tbody className="font-data-md text-data-md tabular-nums text-on-surface">
                  {viewModel.inspectorRows.map((row, index) =>
                    row.kind === "gap" ? (
                      // Linha de LACUNA — distinta de uma linha de dado, tinta NEUTRA (nunca
                      // vermelha: completude incompleta é severidade operacional, STITCH_CONTEXT.md
                      // §9 item 5).
                      <tr
                        // Gap rows have no ID of their own; `index` is appended because two
                        // outages could in principle share the same interval text.
                        key={`gap-${row.intervalText}-${index}`}
                        className="border-b border-surface-border bg-surface-lowest text-provenance-weak"
                      >
                        <td className="py-2 pr-4" colSpan={2}>
                          LACUNA · {row.intervalText}
                        </td>
                        <td className="py-2 px-4">{row.classText}</td>
                        <td className="py-2 pl-4">n_missing={row.nMissingText}</td>
                      </tr>
                    ) : (
                      <tr
                        key={`${row.eventTimeText}-${row.srcLabelRaw}`}
                        className="border-b border-surface-border hover:bg-surface-border"
                      >
                        <td className="py-2 pr-4">{row.eventTimeText}</td>
                        <td className="py-2 px-4 text-provenance-weak">{row.srcLabelRaw}</td>
                        <td className="py-2 px-4 text-provenance-strong">{row.provenance}</td>
                        <td className="py-2 pl-4 truncate">{row.valuesText}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {viewModel.divergences.length > 0 && (
              <div className="border-t border-surface-border p-margin-panel flex flex-col gap-2">
                <h3 className="font-label-caps text-label-caps text-provenance-weak">
                  DIVERGÊNCIA ENTRE FONTES — NÃO RECONCILIADA
                </h3>
                {viewModel.divergences.map((divergence) => (
                  <div key={divergence.label} className="font-data-sm text-data-sm tabular-nums">
                    <div className="text-provenance-weak">{divergence.label}</div>
                    <ul className="flex flex-col gap-0.5">
                      {divergence.readingsText.map((readingText) => (
                        <li key={readingText} className="text-on-surface">
                          {readingText}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* GAVETA DE QUARENTENA — painel colapsável na mesma tela, nunca rota separada. */}
      <aside className="w-full md:w-80 flex flex-col shrink-0 bg-primary-container">
        <header className="h-8 bg-surface-lowest flex items-center px-margin-panel border-b border-surface-border shrink-0">
          <h2 className="font-label-caps text-label-caps text-on-surface">Quarentena</h2>
        </header>
        <div className="p-margin-panel overflow-auto flex-1">
          {viewModel.quarantineDrawer.isEmpty ? (
            <p className="font-data-sm text-data-sm text-provenance-weak">
              {viewModel.quarantineDrawer.emptyStateText}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {viewModel.quarantineDrawer.rows.map((row) => (
                <li key={row.seriesLabel} className="flex flex-col gap-1">
                  <span
                    className={`flex items-center gap-1 font-label-caps text-label-caps ${INTEGRITY_INK_CLASS}`}
                  >
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                      {INTEGRITY_DIAMOND_GLYPH}
                    </span>
                    QUARENTENA
                  </span>
                  <span className="font-data-sm text-data-sm text-on-surface truncate">
                    {row.seriesLabel}
                  </span>
                  <span className="font-data-sm text-data-sm text-provenance-weak">
                    termos em aberto: {row.openTermsText}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
