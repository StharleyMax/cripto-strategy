import http from "node:http";

import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact, startSecondaryNextInstance } from "./helpers.ts";

const SPEC = "07-locale";

/**
 * `T-03.8`, `SPEC-003` §3.7, `RN-8` — rewritten for the SAME reason `view-model.ts` was: the
 * previous revision measured the AMBIENT page (whatever `make e2e` seeds) with a soft
 * assertion, and the ambient seed (`seed_ephemeral_ingest_store.py`, one run) never reaches a
 * decimal at all under `ADR-030`'s wire (`retention`/`resilience` gated to `unmeasured`/
 * `not_scored` — only `uptimePercent` can ever carry a fraction over `/collector-status`) — so
 * a soft, ambient-only check could stay green forever without ever exercising the single
 * formatter (`formatPtBrNumber`, `view-model.ts`) on a real decimal value.
 *
 * Two tests, two different "real data" halves of `D3.4`/`D3.5`:
 *   1. `D3.5` (label ≠ column) is STATIC markup (`S1Console.tsx`'s `<th>`) — true regardless of
 *      what the API returns, so it is checked against the ambient `make e2e` page directly.
 *   2. `D3.4` (one decimal mark) needs a decimal actually reaching the screen — the ambient
 *      seed does not provide one (declared above), so this file stands up its OWN stub
 *      `/collector-status` (real HTTP, same mechanism `02-rede-e-estados.spec.ts` already uses
 *      for B4/B5/B6 — `startSecondaryNextInstance`), with `uptimePercent: 99.8`, and asserts
 *      the HARD requirement the plan's `D3.4` names: `comma_decimal_hits = 0` **or**
 *      `dot_decimal_hits = 0` — never both `> 0` on the same screen.
 */

test("D3.5: <th> mostra 'Janela de perda' (rótulo, linha 8), nunca 'JANELA_DE_PERDA' (coluna, linha 11)", async ({
  page,
}) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const header = page.locator("th", { hasText: "Janela de perda" });
  fact(SPEC, "th_janela_de_perda_count", await header.count());
  await expect(header).toHaveCount(1);

  const shoutingColumnName = page.getByText("JANELA_DE_PERDA", { exact: false });
  fact(SPEC, "th_shouting_column_name_count", await shoutingColumnName.count());
  expect(await shoutingColumnName.count()).toBe(0);
});

/** Minimal stub, deliberately narrower than `helpers.ts`'s `startStubCollectorStatusApi`: this
 * file needs ONE row with a REAL fractional `uptimePercent` (`99.8`) — the one numeral
 * `ADR-030`'s wire can carry with a decimal at all (`retention`/`resilience` are gated to their
 * `unmeasured`/`not_scored` variants, never `computed_uniform`/`slo_multiplier`, so neither can
 * ever put a fraction on this screen) — which none of the existing stub rows in `helpers.ts`
 * provide (`uptimePercent: 100`, a whole number). Answers on the root path regardless of the
 * request, same trick `helpers.ts`'s own stub uses: `/collector-status` and `/series-catalog`
 * share `INGEST_HEALTH_API_BASE_URL`, and a `series_catalog` parse failure on this body falls
 * back to `EMPTY_CATALOG` (`page.tsx`), never blocking `S1`'s own render (`ADR-028`). */
async function startDecimalStub(): Promise<{ url: string; close(): Promise<void> }> {
  const envelope = {
    query: "collector_status",
    as_of: "2026-08-01T01:00:00.000Z",
    window_hours: 24,
    n_rows: 1,
    rows: [
      {
        series: "binance-futures · /fapi/v1/openInterestHist",
        source: "binance-futures",
        endpoint: "/fapi/v1/openInterestHist",
        status: "ATIVO",
        uptimePercent: 99.8,
        statusDetail: null,
        retention: { kind: "unmeasured" },
        resilience: { kind: "not_scored" },
        n_runs_total: 12,
        n_runs_in_window: 12,
        last_run_id: "locale-run-0000",
        last_verdict: "ACCEPTED",
        last_ended_at: "2026-08-01T01:00:00.000Z",
        age_s: 60,
        liveness: { kind: "judged", period_s: 300, stale_after_s: 900 },
      },
    ],
  };
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(envelope));
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("startDecimalStub: could not allocate an ephemeral port"));
        return;
      }
      resolve(address.port);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test("D3.4: uptimePercent fracionário (99.8) chega à tela como '99,8%' — 0 acerto de ponto decimal", async ({
  browser,
}) => {
  const stub = await startDecimalStub();
  const instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  try {
    const page = await browser.newPage({ baseURL: instance.baseUrl });
    await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
    const text = (await page.locator("main").innerText()) ?? "";

    const commaDecimal = text.match(/\d,\d/g) ?? []; // "99,8%" — the ONE formatter's own output
    const dotDecimal = text.match(/\d\.\d(?!\d\d)/g) ?? []; // must be empty — no split left

    fact(SPEC, "stub_comma_decimal_hits", commaDecimal);
    fact(SPEC, "stub_dot_decimal_hits", dotDecimal);

    // `D3.4`'s own wording: `comma_decimal_hits = 0` OR `dot_decimal_hits = 0` — never both
    // non-zero on the same screen. This stub is built to prove the NON-trivial half: a real
    // decimal DID reach the screen (`commaDecimal` is not the empty case `D1.3` warns about).
    expect(commaDecimal.length, "the stubbed 99.8 never rendered as a comma decimal at all").toBeGreaterThan(0);
    expect(dotDecimal, "a dot-decimal numeral survived next to the comma one — two conventions at once").toEqual(
      [],
    );
    expect(text).toMatch(/99,8%/);

    await page.close();
  } finally {
    await instance.close();
    await stub.close();
  }
});

/** Ambient page (whatever `make e2e` seeded) — kept as a FACT-only record, not a hard gate: the
 * seed today never produces a decimal at all (declared above), so `decimal_conventions_on_screen`
 * is expected to read `0`, and a soft assertion just keeps the number visible in `facts.jsonl`
 * without turning `make e2e` red the day the ambient seed changes shape. */
test("ambiente: registra a(s) marca(s) decimal(is) realmente visível(is) na página seedada por make e2e", async ({
  page,
}) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const text = await page.locator("main").innerText();

  const commaDecimal = text.match(/\d,\d/g) ?? [];
  const dotDecimal = text.match(/\d\.\d(?!\d\d)/g) ?? [];
  const dotThousands = text.match(/\d\.\d{3}(?!\d)/g) ?? []; // "2.016 pts"
  const bareThousands = text.match(/\b\d{4,}\b/g) ?? []; // "1440/1440"

  fact(SPEC, "ambient_comma_decimal_hits", commaDecimal);
  fact(SPEC, "ambient_dot_decimal_hits", dotDecimal);
  fact(SPEC, "ambient_dot_thousands_hits", dotThousands);
  fact(SPEC, "ambient_bare_thousands_hits", bareThousands);

  const decimalConventions = (commaDecimal.length > 0 ? 1 : 0) + (dotDecimal.length > 0 ? 1 : 0);
  fact(SPEC, "ambient_decimal_conventions_on_screen", decimalConventions);
  expect.soft(decimalConventions, "two decimal marks on one screen at once").toBeLessThanOrEqual(1);
});
