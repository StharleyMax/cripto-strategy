import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact } from "./helpers.ts";

const SPEC = "07-locale";

// `SPEC-001` §3.8: numerals on a DATA path are locale-invariant (dot decimal, no thousands
// separator); pt-BR is legitimate only in microcopy. On-screen cells are microcopy, so pt-BR
// is allowed — but one convention per screen is the minimum an operator can read without
// guessing which mark is the decimal. `view-model.ts`'s `formatDotDecimal` (uptime%, GB/dia)
// and `formatPtBrDecimal` (retention days) both exist; with `janela_de_perda` always `null` in
// `F1` (`ingest_record.py:91`), the retention column never reaches the comma-decimal branch —
// this test still measures the live page, not that reasoning, so a regression would show up.
test("numerais visíveis — que marca decimal cada célula usa?", async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const text = await page.locator("main").innerText();

  const commaDecimal = text.match(/\d,\d/g) ?? []; // "7,0 dias"
  const dotDecimal = text.match(/\d\.\d(?!\d\d)/g) ?? []; // "99.8%", "1.2"
  const dotThousands = text.match(/\d\.\d{3}(?!\d)/g) ?? []; // "2.016 pts"
  const bareThousands = text.match(/\b\d{4,}\b/g) ?? []; // "1440/1440"

  fact(SPEC, "comma_decimal_hits", commaDecimal);
  fact(SPEC, "dot_decimal_hits", dotDecimal);
  fact(SPEC, "dot_thousands_hits", dotThousands);
  fact(SPEC, "bare_thousands_hits", bareThousands);

  const decimalConventions = (commaDecimal.length > 0 ? 1 : 0) + (dotDecimal.length > 0 ? 1 : 0);
  const thousandsConventions = (dotThousands.length > 0 ? 1 : 0) + (bareThousands.length > 0 ? 1 : 0);
  fact(SPEC, "decimal_conventions_on_screen", decimalConventions);
  fact(SPEC, "thousands_conventions_on_screen", thousandsConventions);
  expect
    .soft(decimalConventions, "two decimal marks on one screen at once")
    .toBeLessThanOrEqual(1);
  expect
    .soft(thousandsConventions, "two thousands conventions on one screen at once")
    .toBeLessThanOrEqual(1);
});
