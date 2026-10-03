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
 * `T-10.17`: this file keeps ONE test, `D3.4`. The two that read the AMBIENT page — `D3.5`
 * (`<th>` 'Janela de perda', STATIC markup of `S1Console.tsx`, true whatever the API returns) and
 * the "ambiente" decimal-mark record (facts plus one soft check) — are steps of
 * `01-console-carrega.spec.ts`'s first test now: same page, same at-rest read, one `goto`
 * (`E2E-analise` §3/07).
 *
 * `D3.4` (one decimal mark) needs a decimal actually reaching the screen — the ambient seed does
 * not provide one (declared above), so this file stands up its OWN stub `/collector-status` (real
 * HTTP, same mechanism `02-rede-e-estados.spec.ts` already uses for B4/B5/B6 —
 * `startSecondaryNextInstance`), with `uptimePercent: 99.8`, and asserts the HARD requirement the
 * plan's `D3.4` names: `comma_decimal_hits = 0` **or** `dot_decimal_hits = 0` — never both `> 0`
 * on the same screen.
 */

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
