"use client";

/**
 * `T-01.4`, `ADR-028/D4`, `SPEC-003` §3.1 — the App Router's error boundary, and deliberately a
 * NET OF LAST RESORT: `page.tsx` never lets a `TransportError` reach here — it catches it and
 * renders the specific cause through `SourceState`/`ConsoleClient.tsx` instead. Anything that
 * DOES land here is unexpected, and in a production build the framework has already redacted
 * `error.message` down to an opaque `digest` — this component does not attempt to distinguish a
 * cause it cannot see, matching the design gate's instruction: generic pt-BR text, one "tentar
 * de novo" action (`reset()`, no new logic), `data-fact="ui_state:error_boundary"`.
 */

export default function ConsoleError({ reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  return (
    <main data-fact="ui_state:error_boundary" role="alert" aria-live="assertive">
      <h1 className="font-label-caps text-label-caps text-on-surface">Algo deu errado</h1>
      <p className="font-data-md text-data-md text-provenance-weak">
        Não foi possível carregar o painel. Tente novamente.
      </p>
      <button type="button" onClick={() => reset()}>
        tentar de novo
      </button>
    </main>
  );
}
