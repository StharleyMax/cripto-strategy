/**
 * `T-01.4` — the one marker `SPEC-003` §3.1/§3.3 names for a block that has NO data source in
 * this phase: `Orçamento de disco`, `Reconexões`, `Fila de ETL` (`S1Console.tsx`), `Completude`
 * and `Camada 2`/`RawDataRow` (`S3Inspector.tsx`) — five blocks, `data-fact="source:none"` on
 * each, per `DESIGN_SYSTEM.md` §9.2 row 7.
 *
 * Form, verbatim from the design gate (`docs/context/camada-de-leitura-do-painel/gates/
 * F1-design.md`, `DESIGN_SYSTEM.md` §9.2): title text `"sem fonte"`, no long description (it is
 * a cell-level marker, not a page-level state), static — no `aria-live` (the value never
 * changes at runtime, `§9.2` row 7's own reasoning).
 *
 * The icon column of §9.2 names `lucide`'s `MinusCircle`, marked `[INFERRED, não confirmado]` —
 * `lucide-react` is not a dependency yet (`grep -c lucide frontend/package.json` → 0,
 * `T-01.5` decides the icon pipeline). Rendering a bare glyph NAME here would repeat the exact
 * defect `FB-playwright §4 #5` already found (`PARADOstop_circle` rendering as literal text
 * instead of a glyph) — this marker is deliberately TEXT-ONLY until `T-01.5` wires an icon font,
 * per `DESIGN_SYSTEM.md` §9.4's own residue note ("se o nome não existir no pacote instalado,
 * `T-01.4` substitui... sem reabrir a forma nem o texto" — omitting the icon rather than
 * printing its name is the substitution that does not touch form/text).
 */
export function SourceNoneMarker() {
  return (
    <span data-fact="source:none" className="font-data-sm text-data-sm text-provenance-weak italic">
      sem fonte
    </span>
  );
}
