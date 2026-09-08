/**
 * `T-01.6`, `SPEC-003` §5 B9, `CA-F1-14` — the App Router's catch-all for any unmatched path
 * (e.g. `/nao-existe`). Server Component, no `"use client"`: static copy, no interactivity.
 *
 * Next's own 404 fallback is English copy under `<html lang="pt-BR">` (`layout.tsx`) — a WCAG
 * 3.1.1 mismatch the design gate already flagged for `/painel`, now `/console`
 * (`REVISAO-FB-playwright.md`). This file replaces it with pt-BR text and a link back to
 * `/console` (`ROUTES.console`), which `e2e/03-rotas.spec.ts` asserts by `href`, not by visible
 * label text. `SPEC-006` plan `03`: the target migrated from `/painel` (`ROUTES.panel`).
 */

import Link from "next/link";
import type { Metadata } from "next";

import { ROUTES } from "./routes.ts";

export const metadata: Metadata = {
  title: "cripto-strategy — Página não encontrada",
};

export default function NotFound() {
  return (
    <main>
      <h1 className="font-label-caps text-label-caps text-on-surface">Página não encontrada</h1>
      <p className="font-data-md text-data-md text-provenance-weak">
        O endereço acessado não existe.{" "}
        <Link href={ROUTES.console} className="underline">
          Voltar ao painel
        </Link>
        .
      </p>
    </main>
  );
}
