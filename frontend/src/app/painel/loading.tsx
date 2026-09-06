/**
 * `T-01.4`, `SPEC-003` §3.1/§3.3 row 1 (`ui_state:loading`) — the App Router's streaming
 * fallback while `page.tsx` awaits the transport. Server Component, no `"use client"`: this
 * file needs no interactivity.
 *
 * Form, `DESIGN_SYSTEM.md` §9.2 row 1: skeleton blocks mirroring `S1Console.tsx`/
 * `S3Inspector.tsx`'s own layout (`product-deep-dives.md:39`, "render gray blocks the shape of
 * the missing content" — not a spinner); no visible title (a skeleton carries no text); a
 * screen-reader-only announcement (`neurodiversity-accommodations.md:327` also favours a static
 * skeleton over an animated one, so nothing here uses CSS animation); `role="status"
 * aria-live="polite"` — never `assertive` (waiting inside Doherty's threshold is not a failure).
 * Zero `<tr>` — a skeleton renders no data row of any kind.
 */
export default function PainelLoading() {
  return (
    <main data-fact="ui_state:loading" role="status" aria-live="polite">
      <span className="sr-only">Carregando dados do painel</span>
      <div aria-hidden="true" className="flex flex-1 min-h-0 gap-gutter">
        <div className="flex-1 bg-primary-container h-64 animate-none" />
        <div className="w-full md:w-80 bg-primary-container h-64 animate-none" />
      </div>
    </main>
  );
}
