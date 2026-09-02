/**
 * `T-07.12` — presentational translation of the approved `S1` screen
 * (`screens/c0fc0210272f42a1ae29b6364e68d2e4`, `S1 Console — Diagnóstico Operacional (Rev. B)`).
 *
 * Same tier as `src/features/panel/Filter.tsx`: this package has no React dependency, no
 * `tsconfig.json`, and no renderer — `frontend/README.md` §1 and `src/app/routes.ts` both
 * record that the Next.js application is a DIFFERENT task's scope. This component is valid,
 * lint-checked TSX (`npm run lint` parses and rules it exactly like `Filter.tsx`), typed
 * against `S1ViewModel` (`view-model.ts`), and is meant to be mounted once that application
 * exists — it is not executed by any test in this task, only linted.
 *
 * Structure and Tailwind classes below are the same ones the canonical HTML uses
 * (`docs/context/plataforma-dados/gates/T-07.12-design.md` §10 for the verification greps),
 * carried over so a future `figma-to-code`/manual port has nothing left to reconcile beyond
 * wiring real data through `S1ViewModel`. `S1 NÃO é o canal de alarme` (`plano 07`, "Não
 * faz"): this component has no action, no polling and no alert path — it renders whatever
 * `S1ViewModel` it is given.
 */

import type { S1ViewModel } from "./view-model.ts";

export interface S1ConsoleProps {
  readonly viewModel: S1ViewModel;
}

export function S1Console({ viewModel }: S1ConsoleProps) {
  return (
    <div className="flex flex-1 min-h-0">
      <section className="flex-1 bg-primary-container flex flex-col min-w-0">
        <header className="h-8 bg-surface-lowest flex items-center px-margin-panel border-b border-surface-border shrink-0">
          <h2 className="font-label-caps text-label-caps text-on-surface">
            Monitoramento de Coletores e Ingestão
          </h2>
        </header>
        <div className="flex-1 overflow-auto p-margin-panel">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="py-2 pr-4 font-label-caps text-label-caps text-provenance-weak font-normal">
                  SÉRIE
                </th>
                <th className="py-2 px-4 font-label-caps text-label-caps text-provenance-weak font-normal text-right">
                  JANELA_DE_PERDA
                </th>
                <th className="py-2 px-4 font-label-caps text-label-caps text-provenance-weak font-normal text-right">
                  RESILIÊNCIA
                </th>
                <th className="py-2 pl-4 font-label-caps text-label-caps text-provenance-weak font-normal text-right">
                  STATUS
                </th>
              </tr>
            </thead>
            <tbody className="font-data-md text-data-md tabular-nums text-on-surface">
              {viewModel.rows.map((row) => (
                <tr key={row.series} className="border-b border-surface-border hover:bg-surface-border group">
                  <td className="py-2 pr-4 truncate">{row.series}</td>
                  <td className="py-2 px-4 text-right">
                    {row.retention.secondary === null ? (
                      row.retention.primary
                    ) : (
                      <div className="flex flex-col">
                        <span>{row.retention.primary}</span>
                        <span className="text-provenance-weak text-data-sm">{row.retention.secondary}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right">{row.resilience}</td>
                  <td className="py-2 pl-4 text-right flex items-center justify-end gap-2">
                    {row.statusCell.uptimeText !== null && (
                      <span className="text-provenance-weak">{row.statusCell.uptimeText}</span>
                    )}
                    {row.statusCell.detailText !== null && (
                      <span className="text-provenance-weak">{row.statusCell.detailText}</span>
                    )}
                    <span className={row.statusCell.badgeClass}>{row.statusCell.status}</span>
                    {row.statusCell.glyph !== null && (
                      <span className="material-symbols-outlined text-[16px] text-provenance-strong">
                        {row.statusCell.glyph}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="w-full md:w-80 flex flex-col gap-gutter shrink-0">
        <div className="bg-primary-container flex flex-col h-1/2 min-h-[200px]">
          <header className="h-8 bg-surface-lowest flex items-center px-margin-panel border-b border-surface-border shrink-0">
            <h2 className="font-label-caps text-label-caps text-on-surface">Orçamento Aritmético &amp; ETL</h2>
          </header>
          <div className="p-margin-panel flex flex-col gap-4 overflow-auto">
            <div className="flex flex-col gap-1">
              <span className="font-label-caps text-label-caps text-provenance-weak">FILA ETL (PENDENTES)</span>
              <span className="font-data-lg text-data-lg tabular-nums">
                {viewModel.storageBudget.etlQueueDepthText}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-label-caps text-label-caps text-provenance-weak">
                ORÇAMENTO ARMAZENAMENTO (GB/DIA)
              </span>
              {viewModel.storageBudget.lines.map((line) => (
                <div
                  key={line.label}
                  className="flex justify-between items-center py-1 border-b border-surface-border"
                >
                  <span className="font-data-sm text-data-sm">{line.label}</span>
                  <span className="font-data-sm text-data-sm tabular-nums text-provenance-weak">
                    {line.valueText}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center py-1 mt-2">
                <span className="font-label-caps text-label-caps">TOTAL PREVISTO</span>
                <span className="font-data-md text-data-md tabular-nums">{viewModel.storageBudget.totalText}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-primary-container flex flex-col flex-1 min-h-[200px]">
          <header className="h-8 bg-surface-lowest flex items-center px-margin-panel border-b border-surface-border shrink-0">
            <h2 className="font-label-caps text-label-caps text-on-surface">Reconexões e Rotina</h2>
          </header>
          <div className="p-margin-panel overflow-auto bg-surface-lowest flex-1">
            <ul className="font-data-sm text-data-sm tabular-nums text-provenance-weak flex flex-col gap-1">
              {viewModel.reconnectionEvents.map((event) => (
                <li key={`${event.time}-${event.description}`} className="flex gap-2">
                  <span>[{event.time}]</span>
                  <span>{event.description}</span>
                  <span>Dur: {event.durationLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
