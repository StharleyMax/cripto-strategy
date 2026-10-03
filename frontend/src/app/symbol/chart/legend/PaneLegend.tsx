import type { ReactNode } from "react";
import type { PaneHeading } from "./pane-legend.ts";

/** The legend block of a layer: everything VISIBLE in it, measured by the host (`data-pane-legend`)
 * for the scale reserve. 12px (`DESIGN-LAYOUT.md` §6: "linha 1, `nowrap`, 12px") on every
 * descendant, whatever class the reused readout carries. */
export function PaneLegend({ children }: { readonly children: ReactNode }) {
  return (
    // `[&>*]:max-w-full` (`T-01.11-FIX`, `SF-2`): a wrapper between the legend and its lines (the
    // liquidation header's `<section>`) would otherwise size to its nowrap content, and the lines'
    // own `max-w-full` would be relative to THAT — the ellipsis would never trigger.
    // `@container/legend` (`T-05.4-desenho.md` §10.5, `C-3`): the coverage chip picks its painted form
    // by THIS block's content width. The block is as wide as the layer (`absolute inset-0`), never
    // as wide as its content, so inline-size containment is safe; it touches width only, and the
    // height the host measures for the scale reserve is unchanged.
    <div
      data-pane-legend=""
      className="@container/legend flex flex-col items-start gap-0.5 px-2 pt-1 text-xs [&_*]:text-xs [&>*]:max-w-full"
    >
      {children}
    </div>
  );
}

/** One line of a legend: `nowrap`, clipped by the layer at the axis (`DESIGN-LAYOUT.md` §6: a line
 * that does not fit loses its tail, never its font size).
 *
 * `T-01.11-FIX` (`SF-2`): the tail is lost WITH an ellipsis. At 1280px the volume note, the
 * third-party warning of the liquidation pane and the long/short stamp were cut mid-word at the axis
 * with nothing saying so. The LAST item of the line is the one allowed to shrink (`min-w-0`) and it
 * truncates with `…`; the full text stays in the DOM, so a screen reader still reads all of it. The
 * line stays ONE line, so the legend's measured height — and the scale reserve under it — is unchanged. */
export function PaneLegendLine({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex max-w-full flex-nowrap items-baseline gap-x-3 whitespace-nowrap [&>*:last-child]:min-w-0 [&>*:last-child]:truncate">
      {children}
    </div>
  );
}

/** The part of a pane's chrome that is NOT drawn over the canvas: still in the accessibility tree
 * and still machine-readable (every `data-fact` in it survives), but not painted. ⚠️ FORM — which
 * readout goes here and which stays in the legend is a builder's placeholder under the rule written
 * in `gates/T-01.6-builder.md` §2, submitted to the `ux-ui-mastery` verdict of `T-01.11`. */
export function PaneDetails({ children }: { readonly children: ReactNode }) {
  return <div className="sr-only">{children}</div>;
}

/** The terms of a pane's heading after its name — `T-04.8`'s rule, fed the heading `pane-legend.ts`
 * derived from the catalog entry and the page's TF (`paneHeadingLabel`): the active TF, then cadence
 * and unit in parentheses (`T-05.6`, `W7-DESIGN-REVIEW` N-2), nothing at all where no entry resolved.
 * The word "nativa" is a screen-reader-only node INSIDE the heading, never an `aria-label`: an
 * `aria-label` on `<h2>` REPLACES the accessible name, and the heading list would lose the pane's
 * name (`gates/T-05.6-DESIGN-GATE.md` §(b).4). The `title` (`Barras de 1h · série nativa de 1m,
 * USDT`) goes on the heading element itself. ⛔ Neither the heading nor the TF button may ever be
 * case-transformed: `1M` reads as MONTH. */
export function identityTerms(heading: PaneHeading): ReactNode {
  if (heading.visible.length === 0) {
    return null;
  }
  return (
    <>
      {` ${heading.visible}`}
      {heading.screenReader.length > 0 ? <span className="sr-only">{heading.screenReader}</span> : null}
    </>
  );
}
