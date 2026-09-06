import type { NextConfig } from "next";

// Minimal on purpose. NEVER add `eslint.ignoreDuringBuilds` or
// `typescript.ignoreBuildErrors` here -- ADR-018 D5.16 exists precisely so a
// planted type error fails `make lint-frontend` and `next build`, not so it
// gets silenced by config.
//
// `T-01.6`, `SPEC-003` s5 B8, `CA-F1-14`: `GET /` has no owner (`src/app/routes.ts` declares
// exactly one route, `/painel`, and there is no `app/page.tsx`) -- without this, Next serves
// its own 404 at `/`. Literal `"/painel"` rather than importing `src/app/routes.ts`'s `ROUTES`
// constant: this file is loaded by Next's own config loader, outside the `src/` module graph,
// and `permanent: false` keeps the redirect a 307/308 (never cached as permanent) while the
// route is still `[NAO DECIDIDO]` (`CLAUDE.md` boundary table row 12, `[Q2]`).
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/painel",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
