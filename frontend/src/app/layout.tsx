import type { ReactNode } from "react";

import "./globals.css";

// Server Component, deliberately minimal -- ADR-018 D2. Styling pipeline landed in `T-01.5`
// (SPEC-003 s3.3, DoD D1.8): `./globals.css` is the >= 1 stylesheet the DoD counts, wired
// with Tailwind v4 (`I-8`) and the two self-hosted fonts (data/label mono + icon glyphs).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
