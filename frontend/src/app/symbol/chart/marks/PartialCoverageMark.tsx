import { colorTokens } from "../../../../charts/index.ts";
import {
  coverageChipCompactText,
  coverageChipText,
  coverageDataAttributes,
  coverageHeadText,
  coverageScreenReaderText,
  warningLegs,
  type CoverageLeg,
  type CoverageMagnitude,
} from "../../coverage-magnitude.ts";

// `paineis-de-fluxo` `T-05.4` — the coverage summary type is `coverage-magnitude.ts::CoverageMagnitude`,
// IMPORTED: that module is browser-safe, so the duplicate this file used to carry (because
// `view-model.ts` pulls `node:crypto`) is gone instead of growing three new fields.

/** `T-03.12` — the SAME hollow-lozenge glyph `LongShortIntegrityGlyph` already carries, reused
 * rather than reinvented: `DESIGN_SYSTEM.md` §1.5 reserves exactly ONE glyph for "integridade do
 * dado" ("losango vazado, sempre o mesmo, nunca triângulo nem círculo"), and a partial `FLOW` SUM
 * silently undercounting its own denominator is that class of signal, not a new one. `fill="none"`
 * is the rule, not a look — §9 item 4 of `STITCH_CONTEXT.md` forbids this mark from ever filling
 * an area, so it is never mistaken for a data mark. `aria-hidden` + `focusable="false"` because
 * the word beside it (`PartialCoverageMark`, below) carries the whole message, same criterion
 * `CvdLegend`/`VolumeMarksLegend`/`LongShortIntegrityGlyph` already apply to their own glyphs. */
export function PartialCoverageGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 12 12">
      <polygon points="6,1 11,6 6,11 1,6" fill="none" stroke={colorTokens().dataBrokenInk} strokeWidth="1.5" />
    </svg>
  );
}

/**
 * `T-03.12` → `paineis-de-fluxo` `T-05.4` (`handoff/T-05.4-desenho.md` §2, gate
 * `gates/T-05.4-design-critique.md` APPROVED_WITH_CONDITIONS 77/100) — the VISIBLE MARK `P-B`/`ADR-040/D3`
 * requires when a regime-A (`Σ`) panel serves partial reaggregated buckets, now saying HOW MUCH is
 * missing, in time: `◇ cobertura parcial — faltam 1 h 4 min de 4 d (1.1%)`.
 *
 * Renders NOTHING when `missingFacts === 0` outside the head — the guard is on what is MISSING, not on
 * whether any reaggregation happened. The `T-03.12` guard (`totalReaggregatedBuckets === 0`) promised
 * this in its docstring and did the opposite: a whole window rendered "0 de N" (`FIX-uso` §D-C).
 *
 * FORM (§2.5), and every choice in it is the designer's with the gate's agreement, not a builder's:
 * an inline `<span>` INSIDE the legend line that names the series, never a block of its own (the block
 * with a border was what took 44 px of a 217 px liquidation pane, §1.1); no border, no bold, lower case
 * — integrity is still the violet INK plus the hollow lozenge plus the WORD (`DESIGN_SYSTEM.md` §1.5),
 * so the chip stays salient without shouting. The leading `·` is `CI-1` of the gate: on the volume line
 * it separates the window-level chip from the one-bar value beside it.
 *
 * `C-2`: the long sentence is a REAL `sr-only` node, never `title`; the visible line is `aria-hidden`
 * so a screen reader hears the full sentence once, not the short one and then the long one.
 *
 * `legs` has one member for volume and CVD, and the two cohorts for liquidation (ONE chip per pane,
 * §2.4). `data-fact` (`<factKey>:<missingFacts>/<expectedFacts>`) and the `data-coverage-*` live on one
 * empty carrier `<span>` per WARNING series inside the chip — for volume and CVD there is one, for
 * liquidation one per leg that is short; a leg with nothing missing has no carrier, so
 * `[data-fact^="<key>:"]` counts warnings (A-2). The chip is `closest("[data-coverage-chip]")`.
 */
/** One series of a coverage chip, with the `data-fact` key it publishes under. */
type CoverageMarkLeg = CoverageLeg & { readonly factKey: string };

export function PartialCoverageMark({ legs }: { readonly legs: readonly CoverageMarkLeg[] }) {
  const visible = coverageChipText(legs);
  if (visible === null) {
    return null;
  }
  return (
    <span
      data-coverage-chip={legs.map((leg) => leg.factKey).join(" ")}
      className="inline-flex items-center gap-1 whitespace-nowrap text-integrity-ink"
    >
      <span aria-hidden="true" className="text-provenance-weak">
        ·
      </span>
      <PartialCoverageGlyph />
      {/* `C-3` (`T-05.4-desenho.md` §10.2): two painted forms of the SAME chip, and the legend's container
          query picks one — the full form at a legend content width >= 1140 px, the compact one (no
          `cobertura parcial — `, no denominator) below it. `display:none`, not `sr-only`: both are
          `aria-hidden`, and the `sr-only` sentence below is what is spoken, at every width. */}
      <span aria-hidden="true" data-coverage-visible="full" className="@max-[1140px]/legend:hidden">
        {visible}
      </span>
      <span aria-hidden="true" data-coverage-visible="compact" className="hidden @max-[1140px]/legend:inline">
        {coverageChipCompactText(legs)}
      </span>
      <span className="sr-only">{coverageScreenReaderText(legs)}</span>
      {/* One empty carrier per WARNING series: the magnitude in native facts, plus the `data-coverage-*`
          (§2.6). The `data-fact` stays a template literal so `data-fact-ascii-key-contract.test.ts`
          still sees its key. */}
      {warningLegs(legs).map((leg) => (
        <span
          key={leg.factKey}
          data-fact={`${leg.factKey}:${leg.magnitude.missingFacts}/${leg.magnitude.expectedFacts}`}
          {...coverageDataAttributes(leg.magnitude)}
        />
      ))}
    </span>
  );
}

/**
 * `T-05.4` (A-3 of `T-05.4-desenho.md` §6.3) — the coverage of ONE series, published whether or not the
 * chip exists, in the pane's `sr-only` details: when the only shortfall is in the head, the chip is
 * gone and `data-coverage-head-excluded-facts` still has to be readable, by a test and by a screen
 * reader ("as barras mais recentes … não entram nesta conta"). No `data-fact` here, on purpose: the
 * fact key counts WARNINGS, and this node exists for every window.
 */
export function PartialCoverageLedger({ factKey, magnitude }: { readonly factKey: string; readonly magnitude: CoverageMagnitude }) {
  const headText = coverageHeadText([{ label: factKey, magnitude }]);
  return (
    <p data-coverage-ledger={factKey} {...coverageDataAttributes(magnitude)}>
      {headText ?? ""}
    </p>
  );
}
