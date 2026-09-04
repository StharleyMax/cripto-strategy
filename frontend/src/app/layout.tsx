import type { ReactNode } from "react";

// Server Component, deliberately minimal -- ADR-018 D2. Styling/Tailwind
// pipeline is out of scope for T-05.11 (frontend/README.md documents the
// gap); this only has to be the root the App Router requires.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
