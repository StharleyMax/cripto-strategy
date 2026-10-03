import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PaneId } from "../../pane-registry.ts";
import { PaneAnchorsContext, paneIndexOfId } from "./registrar.ts";

/**
 * `T-01.6` — the wrapper `<div>` of a pane's plot cell, given the pane's `<tr>` (see the host
 * docstring, item 1). `null` when the row is not there yet, or when the library's DOM is not the
 * shape this was read from — in which case the layer stays in place instead of landing somewhere
 * wrong.
 */
export function paneLayerAnchorOf(row: HTMLElement | null): HTMLElement | null {
  const cell = row?.children.item(1) ?? null;
  const wrapper = cell?.firstElementChild ?? null;
  if (!(wrapper instanceof HTMLElement) || wrapper.querySelector("canvas") === null) {
    return null;
  }
  return wrapper;
}

/** The bottom edge of a pane layer's legend, in CSS px from the pane's top — `null` while the layer
 * is not portaled in. Read off the RENDER (`getBoundingClientRect`), never counted in lines. */
export function legendBottomPx(anchor: HTMLElement | null): number | null {
  const legend = anchor?.querySelector<HTMLElement>("[data-pane-legend]") ?? null;
  if (anchor === null || legend === null) {
    return null;
  }
  return legend.getBoundingClientRect().bottom - anchor.getBoundingClientRect().top;
}

/**
 * Where a pane's layer is rendered: portaled into its pane once the host has the anchor, in place
 * and visually hidden until then (and on the server). `children` is the layer ROOT — the element
 * that carries the pane's `data-testid` (`pane-registry.ts::paneLayerTestId`) and `PANE_LAYER_CLASS`.
 */
export function PaneLayer({ paneId, children }: { readonly paneId: PaneId; readonly children: ReactNode }) {
  const anchors = useContext(PaneAnchorsContext);
  const anchor = anchors[paneIndexOfId(paneId)] ?? null;
  if (anchor === null) {
    return (
      <div className="sr-only" data-pane-layer-pending={paneId}>
        {children}
      </div>
    );
  }
  return createPortal(children, anchor);
}

/**
 * The class of every pane layer ROOT (`T-01.6`, `DESIGN-LAYOUT.md` §6 + gate r2 `C-5`):
 * - `absolute inset-0` over the pane's plot area, `overflow-hidden` so a long line is clipped at the
 *   price axis instead of running over it;
 * - `z-[3]`: the library's two canvases sit at `z-index: 1` and `2` (`:9582`, `:9589`);
 * - `pointer-events-none`, so the layer never steals the crosshair or the drag — and
 *   `pointer-events-auto` given back to any link or button inside it (`C-5`), which stays in the
 *   tab order because nothing here touches `tabindex`. `[MEDIDO 2026-09-24: grep -nE '<(a|button)\b'
 *   inside the six pane components → 0]`: the rule protects the next one, not a current one.
 */
export const PANE_LAYER_CLASS =
  "pointer-events-none absolute inset-0 z-[3] overflow-hidden [&_a]:pointer-events-auto [&_button]:pointer-events-auto";
