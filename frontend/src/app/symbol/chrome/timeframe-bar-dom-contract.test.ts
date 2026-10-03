/**
 * `T-03.9` / `T-03.12` — the DOM CONTRACT of the TF bar (`chrome/TimeframeBar.tsx`), RENDERED.
 * `T-03.9`'s DoD, literally: *"remover um TF do conjunto servido remove o botão, sem tocar no
 * componente."* `supported-timeframes.test.ts` keeps `SUPPORTED_TIMEFRAMES` honest against the
 * backend's served set; this file proves the bar renders exactly that array, and the `T-03.12`
 * toolbar semantics (`role="group"`, `aria-pressed`, roving `tabIndex`, arrow keys).
 *
 * `estrutura-do-front` `T-10.11` — this file stopped reading the source. It renders the component with
 * literal props (`../../component-render.ts`, the pattern of `gates/T-10.11-padrao.md`) and asserts the
 * DOM. The source-scan regexes and the in-memory MORDE that defended them are gone with it (DoD 3):
 * renaming `handleKeyDown` (R04) made the old file fail with no effect on the bar
 * (`gates/T-10.8-build.md` §5), and its MORDE #11 failed alone on reordering two attribute lines.
 *
 * ⚠️ WHERE THE WIRING IN `SymbolClient` IS PROVEN (DoD 2) — the bar is mounted with the URL's
 * timeframe and `onSelect` navigates (`router.push`, not a local `setState`):
 * `e2e/18-tf-refetch-e-ablacao.spec.ts`, tests `primeiro paint: TF=1m selecionado, sem query string`
 * (reads `aria-pressed`) and `clicar 4h navega, MOVE A JANELA DO SERVIDOR e chega no access log da API`.
 * What the old scan also pinned and NOTHING automatic proves now, declared rather than lost: the bar
 * sits ABOVE the panels (layout, the e2e's to own), and "SymbolClient never fetches /series-history
 * itself" (a scan that `chart/history/` already made partial: the pager fetches it from the browser).
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, render } from "../../component-render.ts";
import { SUPPORTED_TIMEFRAMES, type TimeframeOption } from "../chart/axis/supported-timeframes.ts";

const { TimeframeBar } = await import("./TimeframeBar.tsx");

const INTERVALS = SUPPORTED_TIMEFRAMES.map((option) => option.interval);

/** The predicates under test — each one read by the positive render AND by its prop-mutated control. */
function buttonsOf(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("[role='group'][aria-label='Timeframe'] > button")];
}
function pressedIntervals(container: HTMLElement): (string | null)[] {
  return buttonsOf(container)
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => button.textContent);
}
function tabStops(container: HTMLElement): (string | null)[] {
  return buttonsOf(container)
    .filter((button) => button.tabIndex === 0)
    .map((button) => button.textContent);
}

function renderBar(selected: string, picked: string[] = []) {
  return render(createElement(TimeframeBar, { selected, onSelect: (interval: string) => picked.push(interval) }));
}

test("T-03.9 contract: ONE button per SUPPORTED_TIMEFRAMES entry, in order, label and testid from the interval", async () => {
  assert.ok(INTERVALS.length >= 1, "the served set must never be empty — an empty bar is not a bar");
  const rendered = await renderBar("1m");
  const buttons = buttonsOf(rendered.container);
  assert.deepEqual(buttons.map((button) => button.textContent), INTERVALS);
  assert.deepEqual(
    buttons.map((button) => button.getAttribute("data-testid")),
    INTERVALS.map((interval) => `timeframe-button-${interval}`),
  );
  assert.ok(buttons.every((button) => button.type === "button"), "a bar button must never submit a form");
  rendered.unmount();
});

test("T-03.9 DoD: removing a TF from the served set removes its button, with zero edit to the component", async () => {
  // The array is the component's input; shrinking it is the mutation the DoD names. A bar that
  // spelled its buttons by hand would keep rendering the removed one.
  const served = SUPPORTED_TIMEFRAMES as TimeframeOption[];
  const removed = served.splice(served.length - 1, 1);
  try {
    const rendered = await renderBar("1m");
    assert.deepEqual(
      buttonsOf(rendered.container).map((button) => button.textContent),
      INTERVALS.slice(0, -1),
    );
    rendered.unmount();
  } finally {
    served.push(...removed);
  }
  assert.deepEqual(SUPPORTED_TIMEFRAMES.map((option) => option.interval), INTERVALS, "the served set was restored");
});

test("T-03.12 contract: the bar is role=group, labelled Timeframe, and aria-pressed marks the selected TF only", async () => {
  const rendered = await renderBar("1h");
  assert.equal(buttonsOf(rendered.container).length, INTERVALS.length, "anchor: the group rendered its buttons");
  assert.deepEqual(pressedIntervals(rendered.container), ["1h"]);
  // Every OTHER button announces `false`, not a missing attribute: a toggle group silent about its
  // unpressed members reads as plain buttons.
  assert.ok(
    buttonsOf(rendered.container).every((button) => button.getAttribute("aria-pressed") !== null),
    "every member must carry aria-pressed",
  );
  rendered.unmount();
});

test("negative control by PROP mutation: aria-pressed and the Tab stop TRACK `selected`", async () => {
  const rendered = await renderBar("4h");
  assert.deepEqual(pressedIntervals(rendered.container), ["4h"]);
  assert.throws(() => assert.deepEqual(pressedIntervals(rendered.container), ["1h"]));
  assert.deepEqual(tabStops(rendered.container), ["4h"]);
  rendered.unmount();
});

test("T-03.12 contract: ONE Tab stop for the whole bar (roving tabIndex), on the selected TF", async () => {
  const rendered = await renderBar("1h");
  assert.deepEqual(tabStops(rendered.container), ["1h"]);
  assert.equal(
    buttonsOf(rendered.container).filter((button) => button.tabIndex === -1).length,
    INTERVALS.length - 1,
    "every other member must be out of the Tab order",
  );
  rendered.unmount();
});

test("T-03.12 contract: ArrowRight/ArrowLeft/Home/End move focus and the Tab stop, never the selection", async () => {
  const picked: string[] = [];
  const rendered = await renderBar("1m", picked);
  const press = async (key: string) => {
    const target = rendered.container.ownerDocument.activeElement ?? buttonsOf(rendered.container)[0]!;
    await act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
    return rendered.container.ownerDocument.activeElement?.textContent ?? null;
  };
  await act(async () => {
    buttonsOf(rendered.container)[0]!.focus();
  });
  assert.equal(await press("ArrowRight"), INTERVALS[1]);
  assert.deepEqual(tabStops(rendered.container), [INTERVALS[1]]);
  assert.equal(await press("End"), INTERVALS.at(-1));
  assert.equal(await press("ArrowRight"), INTERVALS[0], "ArrowRight wraps from the last to the first");
  assert.equal(await press("ArrowLeft"), INTERVALS.at(-1), "ArrowLeft wraps from the first to the last");
  assert.equal(await press("Home"), INTERVALS[0]);
  assert.deepEqual(picked, [], "browsing with the arrows must not select a TF");
  assert.deepEqual(pressedIntervals(rendered.container), ["1m"], "nor move aria-pressed");
  rendered.unmount();
});

test("T-03.9 contract: clicking a button calls onSelect with THAT button's interval", async () => {
  const picked: string[] = [];
  const rendered = await renderBar("1h", picked);
  const fourH = rendered.container.querySelector<HTMLButtonElement>("[data-testid='timeframe-button-4h']");
  assert.ok(fourH !== null, "anchor: the 4h button rendered");
  await act(async () => {
    fourH.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(picked, ["4h"]);
  rendered.unmount();
});
