import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// E2E surface of `/console` (`/painel` before `SPEC-006` plan `03`, `ADR-034/D2`; REVISAO-FB,
// 2026-09-04). This config owns NO web server:
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
  // ⛔ 400 s, E O NÚMERO É MEDIDO, NÃO CHUTADO. O valor anterior (`90_000`) ficou ABAIXO do tempo
  // de render de `/symbol` contra a API de produção, e o efeito não era lentidão: era
  // `page.goto: net::ERR_ABORTED` — o spec do universo FORTE (`12-oi-dado-real.spec.ts`) reprovava
  // ANTES de medir qualquer coisa. `curl -w %{time_total}` sobre `GET /symbol` do `next start` de
  // produção: `88,4 · 125,8 · 63,6 s` (`n=3`, `frontend-qa`, 2026-09-15T19:09–19:18Z) e
  // `59,7 · 61,9 · 60,7 · 62,7 s` (`n=4`, 2026-09-15T20:0xZ, este commit). Teto adotado = `3,2x` o
  // PIOR caso medido (`125,8 s`), e a folga não é generosidade: a página monta 5 painéis sobre uma
  // série que cresce ~1 barra nativa a cada 5 min, então um teto colado no medido de hoje volta a
  // estourar sozinho amanhã.
  //
  // ⚠️ O QUE ISTO CUSTA, declarado: um teste PENDURADO passa a levar 400 s para ser reportado em
  // vez de 90 s. O custo é pequeno porque quem reprova por travamento aqui é o `expect`, que
  // continua com teto de `10_000` ms logo abaixo; este teto só cobre a duração TOTAL do teste. E o
  // custo de NÃO pagá-lo já foi medido: com `90_000` a única prova automatizada do `DoD-3` só
  // rodava com `--timeout=400000` passado na linha de comando — um teste que depende de override
  // fora do versionado não existe para o próximo que rodar a suíte
  // (`gates/T-03.5-T-03.6-qa-remedicao.md` §A6).
  timeout: 400_000,
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
