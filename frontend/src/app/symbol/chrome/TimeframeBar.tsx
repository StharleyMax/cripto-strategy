import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { SUPPORTED_TIMEFRAMES } from "../chart/axis/supported-timeframes.ts";

/**
 * `T-03.9` (`RF-6`, plan `03` item `3.6`) — the TF bar. ONE `<button>` per entry of
 * `SUPPORTED_TIMEFRAMES` (`supported-timeframes.ts`), via `.map()` — never a hand-written
 * `<button>` per label. That is the DoD, literally: *"remover um TF do conjunto servido remove o
 * botão, sem tocar no componente"* — shrink the array (kept honest by that module's own sync
 * test against the backend) and this component's rendered output shrinks with it, with zero
 * edit here. `timeframe-bar-dom-contract.test.ts` is the source-scan that proves this component
 * actually maps rather than duplicating the list.
 *
 * Colour: the two GOVERNED roles `DESIGN_SYSTEM.md` §1.2 reserves for exactly this — `action`
 * (`--acao-fill`/`--acao-borda`/`--acao-on`, "Marca / ação", never yet consumed by any `.tsx`
 * before this task) for the SELECTED member, `surface`/`provenance` (already used everywhere
 * else on this screen) for the rest. No new hue (`NG-5`).
 *
 * `role="group"` + `aria-pressed` (a toggle-button group), NOT `role="radiogroup"` +
 * `aria-checked` — `T-03.12` DECIDES this, and it is the earlier docstring's "FORM decision this
 * task does not own" being finally owned. Kept, not flipped: a `radiogroup` asserts "one value
 * among mutually exclusive options, as if submitted by a form" (WAI-ARIA 1.2's own role
 * definition), and a screen reader announces each item as "radio button" — the WRONG semantic
 * for a VIEW control that reshapes what six charts already on screen draw, never a value bound
 * to any form. `role="group"` + `aria-pressed` is the correct reading: "a set of toggle
 * buttons", which is exactly what clicking one of these DOES (toggles which TF is active).
 *
 * What WAS missing, and is what this task actually adds: roving `tabIndex` + arrow-key
 * navigation, the WAI-ARIA APG "Toolbar" pattern (a horizontal cluster of related buttons,
 * `https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/` — `[NÃO SEI]` the exact current wording of
 * that page; this environment has no web fetch, so the pattern is applied from its well-known
 * shape — one stop on `Tab`, `ArrowLeft`/`ArrowRight`/`Home`/`End` move the roving cursor,
 * `Enter`/`Space`/click activate — never from a live read of the page). Before this task, every
 * button was independently `Tab`-stoppable (5 stops to cross the bar); now the bar is ONE `Tab`
 * stop, consistent with every other multi-button cluster a keyboard user encounters on the web,
 * while `aria-pressed`'s semantics (and the DOM contract pinning `data-testid`/`key`/`onClick`/
 * the visible label, `timeframe-bar-dom-contract.test.ts`) are UNCHANGED.
 *
 * `T-03.11` (`CST-226`) — `onSelect` NOW TRIGGERS A REAL REFETCH, wired by `SymbolClient` below.
 * The two backend prerequisites `T-03.9`'s docstring named (`T-03.4`'s `{present, expected}`
 * marks, `T-03.6`'s `coverage` envelope field) are merged on this branch now, and the DoD this
 * task exists for (`plan 03` DoD 6/7/8) is the falsifier over the wire-grid/staircase counts
 * every panel already published — see `SymbolClient`'s own `handleTimeframeSelect` for the
 * mechanism (a URL search param, not an in-component fetch).
 */
export function TimeframeBar({
  selected,
  onSelect,
}: {
  readonly selected: string;
  readonly onSelect: (interval: string) => void;
}) {
  // The roving cursor — WHICH button is the bar's one `Tab` stop right now. Starts, and
  // re-syncs, on `selected`: after a real navigation (`onSelect` fired, `page.tsx` re-rendered
  // with a new `selectedTimeframe`) the newly-active TF is also the sensible place `Tab` should
  // land next time, same as a native radio group re-syncing its roving stop to whichever input
  // is `checked`. Arrow-key browsing before a selection is made moves this WITHOUT touching
  // `selected` — the two are related, never the same state.
  const [activeInterval, setActiveInterval] = useState(selected);
  useEffect(() => {
    setActiveInterval(selected);
  }, [selected]);

  const buttonNodesByInterval = useRef(new Map<string, HTMLButtonElement>());
  // ⛔ Parameter named `entry`, deliberately NOT `option` — `timeframe-bar-dom-contract.test.ts`'s
  // `MAP_OVER_SUPPORTED_TIMEFRAMES` regex is anchored on the array's `.map` call spelled with an
  // `option` parameter, singular, to prove there is exactly ONE such call (the render map,
  // below). A second call spelled the same way would give the MORDE test two matches to strip
  // instead of one, and the mutation it applies would silently miss the real render map.
  const intervals = SUPPORTED_TIMEFRAMES.map((entry) => entry.interval);

  const moveRovingFocus = useCallback((interval: string) => {
    setActiveInterval(interval);
    buttonNodesByInterval.current.get(interval)?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const currentIndex = intervals.indexOf(activeInterval);
      if (currentIndex === -1) {
        return;
      }
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          moveRovingFocus(intervals[(currentIndex + 1) % intervals.length]!);
          return;
        case "ArrowLeft":
          event.preventDefault();
          moveRovingFocus(intervals[(currentIndex - 1 + intervals.length) % intervals.length]!);
          return;
        case "Home":
          event.preventDefault();
          moveRovingFocus(intervals[0]!);
          return;
        case "End":
          event.preventDefault();
          moveRovingFocus(intervals[intervals.length - 1]!);
          return;
        default:
          return;
      }
    },
    [activeInterval, intervals, moveRovingFocus],
  );

  return (
    <div
      role="group"
      aria-label="Timeframe"
      onKeyDown={handleKeyDown}
      className="flex gap-1 border-b border-surface-border bg-surface-lowest px-3 py-2"
    >
      {SUPPORTED_TIMEFRAMES.map((option) => {
        const isSelected = option.interval === selected;
        return (
          <button
            key={option.interval}
            ref={(node) => {
              if (node === null) {
                buttonNodesByInterval.current.delete(option.interval);
              } else {
                buttonNodesByInterval.current.set(option.interval, node);
              }
            }}
            type="button"
            aria-pressed={isSelected}
            tabIndex={option.interval === activeInterval ? 0 : -1}
            data-testid={`timeframe-button-${option.interval}`}
            onClick={() => onSelect(option.interval)}
            onFocus={() => setActiveInterval(option.interval)}
            className={
              isSelected
                ? "border border-action-border bg-action-fill px-2 py-1 font-label-caps text-data-sm text-action-on"
                : "border border-surface-border bg-surface-base px-2 py-1 font-label-caps text-data-sm text-provenance-weak"
            }
          >
            {option.interval}
          </button>
        );
      })}
    </div>
  );
}
