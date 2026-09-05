import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Curated screenshots live next to the report, not in the Playwright output dir. */
export const SHOTS_DIR = path.resolve(HERE, "../../docs/context/plataforma-dados/gates/REVISAO-FB-shots");

/** Every measured number the specs produce is appended here as one JSON line, so the report
 * can quote `n` with the spec that produced it instead of a hand-typed figure. */
const FACTS_FILE =
  process.env.E2E_FACTS_FILE ?? path.join(os.tmpdir(), "cripto-strategy-e2e", "facts.jsonl");

export function fact(spec: string, name: string, value: unknown): void {
  fs.mkdirSync(path.dirname(FACTS_FILE), { recursive: true });
  fs.appendFileSync(FACTS_FILE, `${JSON.stringify({ spec, name, value })}\n`);
  // Also echoed so `npm run test:e2e | tail` shows the numbers without opening the file.
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

/** Hosts that are NOT the Next dev server. Anything here is "the front talking to something". */
export function isApiLike(url: string): boolean {
  const parsed = new URL(url);
  const notNext = parsed.host !== "localhost:3000" && parsed.host !== "127.0.0.1:3000";
  const looksLikeApi = /ingest-health|\/api\//.test(parsed.pathname);
  return notNext || looksLikeApi;
}
