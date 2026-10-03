import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact } from "./helpers.ts";

const SPEC = "05-a11y";

// axe-core over the whole page, WCAG 2.0/2.1 A+AA. Ambient-independent —
// `S1Console`/`S3Inspector` mount unconditionally (`SPEC-003` §3.3), only the banner above
// them switches on `sourceState.kind`.
test("axe-core: violações A/AA no /console", async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.length,
    help: violation.help,
    sample: violation.nodes[0]?.html.slice(0, 120),
  }));
  fact(SPEC, "axe_violations", summary);
  fact(SPEC, "axe_violations_count", summary.length);
  fact(SPEC, "axe_passes_count", results.passes.length);
  fact(SPEC, "axe_incomplete_count", results.incomplete.length);
  const seriousOrCritical = summary.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect.soft(seriousOrCritical, "serious/critical axe violations").toEqual([]);
  expect.soft(summary, "any axe violation").toEqual([]);
});

// `T-10.17`: "landmarks, cabeçalhos e foco por teclado" (lang, one <main>, one <h1>, labelled inputs,
// named tables, the first Tab stop) is a step of `01-console-carrega.spec.ts`'s first test now; the
// axe pass above stays here, isolated (`E2E-analise` §3/05).
