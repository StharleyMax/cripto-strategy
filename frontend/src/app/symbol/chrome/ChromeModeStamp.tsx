import { formatUtcMinute } from "../chart/marks/AbsenceNote.tsx";
import { PAGE_GUTTER_CLASS } from "./page-gutter.ts";

/**
 * `C-4` of `gates/DESIGN-LAYOUT-ux-critique-r2.md` — THE MODE, EXPLICIT IN THE CHROME.
 *
 * The gate's finding: an age like "idade 42s" is only coherent in AO VIVO; in COMO EM T it has to
 * count against T, and the AO VIVO chip must not look active. On this route there is ONE mode today
 * — every age on the screen (`OiFreshness`, `LongShortAgeStamp`) is counted against the window's
 * own last instant (`view-model.ts::oiFreshnessVerdict`'s `referenceMs`, `panel-assembly.ts`'s
 * `windowEndMsInclusive - observedAt`), never against the clock — so the honest label is
 * COMO EM T, with T spelled, and the "Ao vivo" list at the foot of the page stays a separate,
 * self-labelled readout (it is not a mode chip and says "indisponível" while no producer exists).
 *
 * `data-mode-reference-ms` is the same instant the ages use, so an assertion can check the stamp
 * and the ages point at one T. ⚠️ Wording and placement are FORM, submitted with `T-01.11`.
 */
export function ChromeModeStamp({ referenceMs }: { readonly referenceMs: number }) {
  return (
    <p
      data-fact="chrome_mode:as_of"
      data-mode-reference-ms={referenceMs}
      className={`${PAGE_GUTTER_CLASS} text-xs text-provenance-weak`}
    >
      <strong className="font-bold text-on-surface">COMO EM T</strong> · T = {formatUtcMinute(referenceMs)} · as
      idades de cada painel contam contra T, não contra o relógio
    </p>
  );
}
