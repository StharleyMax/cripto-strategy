import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Curated screenshots live next to this feature's own gate report, not the sibling
 * feature's (`plataforma-dados`) that the previous suite used before `T-01.9` rewrote it. */
export const SHOTS_DIR = path.resolve(HERE, "../../docs/context/camada-de-leitura-do-painel/gates/e2e-shots");

/** Every measured number the specs produce is appended here as one JSON line, so the report
 * can quote `n` with the spec that produced it instead of a hand-typed figure. One file for
 * the whole run — "`facts.jsonl` por spec" (`T-01.9`) means every line CARRIES its spec name,
 * not that each spec writes a separate file. */
const FACTS_FILE =
  process.env.E2E_FACTS_FILE ?? path.join(os.tmpdir(), "cripto-strategy-e2e", "facts.jsonl");

export function fact(spec: string, name: string, value: unknown): void {
  fs.mkdirSync(path.dirname(FACTS_FILE), { recursive: true });
  fs.appendFileSync(FACTS_FILE, `${JSON.stringify({ spec, name, value })}\n`);
  // Also echoed so `make e2e | tail` shows the numbers without opening the file.
  console.log(`E2E-FACT ${spec} ${name}=${JSON.stringify(value)}`);
}

export async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

export interface ConsoleCapture {
  readonly errors: string[];
  readonly warnings: string[];
  readonly pageErrors: string[];
}

/** Must be attached BEFORE `page.goto`, otherwise hydration errors are missed. */
export function captureConsole(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], warnings: [], pageErrors: [] };
  page.on("console", (message) => {
    if (message.type() === "error") capture.errors.push(message.text());
    if (message.type() === "warning") capture.warnings.push(message.text());
  });
  page.on("pageerror", (error) => capture.pageErrors.push(String(error)));
  return capture;
}

export const PANEL_PATH = "/painel";

/** Hosts that are NOT the Next server under test. `SPEC-003` §3.1/`ADR-028/D1`: since `T-01.4`,
 * `/painel` is a Server Component — the ONE network call (`GET /ingest-health` before `T-03.7`,
 * `GET /collector-status` since — `S1` now reads the per-series aggregate, `ADR-030`) happens on
 * the Next server process, never in the browser. A hit here is therefore evidence the ROUTE
 * REGRESSED to a client-side fetch, the exact opposite of what the suite this file replaced
 * (`plataforma-dados`'s `02-rede-e-estados.spec.ts`) used to require. Both path shapes stay in
 * the pattern: this file's stub server (`startStubCollectorStatusApi` below) answers on the
 * ROOT path regardless of what was requested (same `_request` ignored as before `T-03.7`), so
 * neither literal is load-bearing — `/api/` alone would already catch the real route. */
export function isApiLike(url: string): boolean {
  const parsed = new URL(url);
  return /ingest-health|collector-status|\/api\//.test(parsed.pathname);
}

// ── ACCESS LOG DA API — B1 (`SPEC-003` §5): a prova de que a REQUISIÇÃO aconteceu, não mais
// "o browser chamou a API" (pergunta que reprovaria a implementação correta, `PRD-003` §1.4) ──

/** `scripts/e2e-env.sh` grava o stdout/stderr do `uvicorn` (access log ligado, `T-01.7`) em
 * `$STATE_DIR/api.log`; o `Makefile` (`T-01.9`) repassa o caminho por esta variável. Ausente
 * (ou arquivo inexistente, o caso do modo "API no chão" — `T-01.8` nunca sobe o processo) ⇒
 * `countCollectorStatusAccessLogHits` devolve `0`, nunca lança. */
export const API_LOG_PATH = process.env.E2E_API_LOG_PATH;

/** `T-03.7`: `page.tsx`'s one call moved to `GET /collector-status` (`ADR-030`) — renamed from
 * `countIngestHealthAccessLogHits` so the function name never lies about which route `B1` is
 * actually proving got hit. */
export function countCollectorStatusAccessLogHits(): number {
  if (!API_LOG_PATH || !fs.existsSync(API_LOG_PATH)) return 0;
  const content = fs.readFileSync(API_LOG_PATH, "utf8");
  // Same pattern the plan's own DoD named literally for `/ingest-health`
  // (`01_pagina_diz_a_verdade.md`, `D1.3`), now over the route `S1` actually reads since
  // `T-03.7` — uvicorn's default access formatter quotes the request line
  // (`"GET /collector-status HTTP/1.1"`), but this regex does not depend on that.
  return (content.match(/GET .*\/collector-status/g) ?? []).length;
}

// ── UM SEGUNDO `next start`, e um STUB HTTP — B3/B4/B5/B6/D1.5(b) (`SPEC-003` §5) ────────────
//
// `scripts/e2e-env.sh` só sobe DOIS mundos: a API real (semeada, ≥ 1 run) OU nada (porta
// deliberadamente livre) — o suficiente para B1/B2, mas nenhum dos dois pode responder `500`,
// esperar 2 s, ou devolver um envelope com 0 runs sem tocar `backend/` (fora do escopo `web`
// desta task). O que os une é `resolveCollectorStatusBaseUrl` (`collector-status-query.ts`,
// mesmo `INGEST_HEALTH_API_BASE_URL` que `resolveIngestHealthBaseUrl` já lia): a
// URL é lida de `process.env` a CADA chamada, nunca inlinada em `next build` — então uma
// SEGUNDA instância de `next start`, apontando `INGEST_HEALTH_API_BASE_URL` para um endereço
// diferente, reaproveita o MESMO `.next` que `scripts/e2e-env.sh` já compilou (nenhum rebuild),
// e cada instância prova, sozinha, o par de-pé/no-chão da SUA linha — independente de qual
// dos dois modos `E2E_API_UP` o `make e2e` ambiente está rodando.

const FRONTEND_DIR = path.resolve(HERE, "..");
const NEXT_BIN = path.join(FRONTEND_DIR, "node_modules", ".bin", "next");

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close(() => reject(new Error("getFreePort: could not allocate an ephemeral port")));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1_500) });
      return;
    } catch (cause) {
      lastError = cause;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`waitForHttp: nothing answered ${url} within ${timeoutMs}ms (${String(lastError)})`);
}

export interface StubHandle {
  readonly url: string;
  close(): Promise<void>;
}

/** Uma linha minimamente válida do envelope `/collector-status` (`ADR-030` D5's 15 campos,
 * `collector-status-query.ts`'s `ROW_FIELD_KINDS`) — `T-03.7`: `S1` lê este envelope agora, não
 * mais `/ingest-health`'s runs. `status: "ATIVO"` e `liveness.kind: "judged"` são o caso comum a
 * tela mostra; nada aqui tenta cobrir as outras variantes (`PARADO`/`not_judged`), que já têm
 * cobertura própria em `collector-status-query.test.ts`. */
function stubCollectorStatusRow(index: number): Record<string, unknown> {
  return {
    series: `binance-futures · /fapi/v1/openInterestHist-${index}`,
    source: "binance-futures",
    endpoint: `/fapi/v1/openInterestHist-${index}`,
    status: "ATIVO",
    uptimePercent: 100,
    statusDetail: null,
    retention: { kind: "unmeasured" },
    resilience: { kind: "not_scored" },
    n_runs_total: 12,
    n_runs_in_window: 12,
    last_run_id: `stub-run-${index}`,
    last_verdict: "ACCEPTED",
    last_ended_at: "2026-08-01T01:00:00.000Z",
    age_s: 60,
    liveness: { kind: "judged", period_s: 300, stale_after_s: 900 },
  };
}

/** Envelope de `GET /collector-status` (`ADR-030` D5), com `n` linhas stub. */
function stubCollectorStatusEnvelope(rowCount: number): Record<string, unknown> {
  const rows = Array.from({ length: rowCount }, (_unused, index) => stubCollectorStatusRow(index));
  return {
    query: "collector_status",
    as_of: "2026-08-01T01:00:00.000Z",
    window_hours: 24,
    n_rows: rows.length,
    rows,
  };
}

/** Um servidor HTTP mínimo, dedicado, que fica no lugar do `GET /collector-status` real — B4
 * (`status`), B6 (`delayMs`), B5 (`rowCount: 0`). Nunca a query de verdade: só o suficiente
 * para exercitar o transporte (`fetchCollectorStatusProjectionViaHttp`) do outro lado.
 * Renomeado de `startStubIngestHealthApi` (`T-03.7`): `S1`'s one call moved to
 * `/collector-status`, and this stub answers on the root path regardless of the request's own
 * `.url`, same as before — the shape of the body is what changed, not the serving mechanics. */
export async function startStubCollectorStatusApi(options: {
  readonly status: number;
  readonly delayMs?: number;
  readonly rowCount?: number;
}): Promise<StubHandle> {
  const port = await getFreePort();
  const server = http.createServer((_request, response) => {
    const respond = () => {
      const body = JSON.stringify(stubCollectorStatusEnvelope(options.rowCount ?? 1));
      response.writeHead(options.status, { "content-type": "application/json" });
      response.end(body);
    };
    if (options.delayMs) {
      setTimeout(respond, options.delayMs);
    } else {
      respond();
    }
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface NextInstanceHandle {
  readonly baseUrl: string;
  close(): Promise<void>;
}

/** Sobe um SEGUNDO `next start`, numa porta livre, reaproveitando o `.next` que
 * `scripts/e2e-env.sh` já compilou (`make e2e` sempre roda `next build` antes de qualquer
 * teste — nenhum novo build acontece aqui). `envOverrides` com valor `undefined` REMOVE a
 * chave do ambiente do processo filho (o jeito de simular B3, `INGEST_HEALTH_API_BASE_URL`
 * nunca definida). */
export async function startSecondaryNextInstance(
  envOverrides: Readonly<Record<string, string | undefined>>,
): Promise<NextInstanceHandle> {
  if (!fs.existsSync(NEXT_BIN)) {
    throw new Error(`startSecondaryNextInstance: ${NEXT_BIN} not found — run 'make setup' first`);
  }
  const port = await getFreePort();
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const child: ChildProcess = spawn(NEXT_BIN, ["start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: FRONTEND_DIR,
    env,
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${baseUrl}${PANEL_PATH}`, 20_000);
  } catch (cause) {
    child.kill();
    throw cause;
  }
  return {
    baseUrl,
    close: () =>
      new Promise((resolve) => {
        child.once("exit", () => resolve());
        child.kill();
        // Belt and suspenders: `next start` sometimes forks a child of its own that outlives
        // the direct SIGTERM in a slow CI box — the test suite tears down its OWN instances,
        // never the ambient one `scripts/e2e-env.sh` owns, so a stray process here costs a
        // leaked port, not a false green.
        setTimeout(resolve, 3_000);
      }),
  };
}
