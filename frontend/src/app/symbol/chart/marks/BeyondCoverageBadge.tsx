import { PartialCoverageGlyph } from "./PartialCoverageMark.tsx";

/**
 * `T-05.6` (`D-C3.6`, plan `05` item `5.5`) — the NAMED STATE for a panel whose accumulated
 * window has widened past this SERIES' OWN declared floor (`beyond-coverage`,
 * `slot-coverage.ts::panelWallState`): the store/source has no history before this point, ever —
 * a WALL, distinct from `not-loaded` (the pager just hasn't paged there yet, `T-05.7` already
 * stops asking silently once the wall is known) and from `absent` (a real hole inside KNOWN
 * coverage). Reuses the SAME glyph/word/colour three-channel discipline
 * `PartialCoverageMark`/`LongShortIntegrityBadge` already established on this screen (`ADR-010/D-
 * 3`, "integridade do dado") — the SAME glyph too (`PartialCoverageGlyph`), not a fourth SVG for a
 * fourth flavour of "integrity", so an operator only ever has to learn ONE mark.
 *
 * ONE badge per PANEL, never per slot/bar (this task's own DoD): the caller decides ONE
 * `SlotCoverageState` for the whole panel (`panelWallState` against the window's own left edge,
 * never a scan of every slot) and this component only ever renders for `"beyond-coverage"` —
 * `"absent"`/`"not-loaded"` render nothing here, on purpose: neither is "this panel has hit a
 * wall it can never cross".
 */
export function BeyondCoverageBadge({ factKey }: { readonly factKey: string }) {
  return (
    <p
      data-fact={`${factKey}:beyond`}
      className="flex items-center gap-2 border border-integrity-ink px-2 py-0.5 text-sm font-bold text-integrity-ink"
    >
      <PartialCoverageGlyph />
      LIMITE DA COBERTURA — sem histórico disponível além deste ponto.
    </p>
  );
}
