import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// E2E surface of `/painel` (REVISAO-FB, 2026-09-04). This config owns NO web server:
// the Next dev server is the owner's process (`http://localhost:3000`) and the FastAPI
// process is started by hand (`uvicorn src.main:app --port 8765`) — see
// `docs/context/plataforma-dados/gates/REVISAO-FB-playwright.md` for the run recipe.
// Artifacts (traces, videos, failure shots) go to the OS temp dir so nothing lands in the
// repository by accident; the curated screenshots are written by the specs themselves into
// `docs/context/plataforma-dados/gates/REVISAO-FB-shots/`.
export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.PW_OUTPUT_DIR ?? path.join(os.tmpdir(), "cripto-strategy-e2e", "results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    headless: true,
    screenshot: "off",
    trace: "off",
    video: "off",
    locale: "pt-BR",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
});
