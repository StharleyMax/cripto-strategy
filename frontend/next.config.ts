import type { NextConfig } from "next";

// Minimal on purpose. NEVER add `eslint.ignoreDuringBuilds` or
// `typescript.ignoreBuildErrors` here -- ADR-018 D5.16 exists precisely so a
// planted type error fails `make lint-frontend` and `next build`, not so it
// gets silenced by config.
//
// `T-01.6`, `SPEC-003` s5 B8, `CA-F1-14`: `GET /` has no owner (`src/app/routes.ts` declares
// exactly one route, `/console`, and there is no `app/page.tsx`) -- without this, Next serves
// its own 404 at `/`. Literal `"/console"` rather than importing `src/app/routes.ts`'s `ROUTES`
// constant: this file is loaded by Next's own config loader, outside the `src/` module graph.
// `permanent: false` on the `/` entry is unchanged by `SPEC-006` plan `03` -- it was never about
// the destination NAME being undecided (that question, `CLAUDE.md` boundary table row 12, closed
// `[PREMISSA-OWNER: 2026-09-08]` / `ADR-034/D2`), only this task's own item `3.5` scope: it adds
// the `/painel` bookmark redirect below, it does not re-litigate the `/` entry's cache header.
//
// `SPEC-006` plan `03`, `ADR-034/D2`/`D3`, `CA-F3-3`: `/painel` (the route's old name) is now a
// dead path -- nothing under `src/app/` serves it anymore (`frontend/src/app/console/`). The
// second entry below is the one this task's DoD falsifies: `curl -sD - <base>/painel` MUST answer
// `308` with `Location: /console`, so a bookmark or external link made before this migration
// still lands the operator on the live page instead of a 404. `permanent: true` or (308) reflects
// that the OLD name is retired for good, not a temporary detour -- unlike the `/` entry above,
// there is no open question left to keep this one cheap to reverse.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/console",
        permanent: false,
      },
      {
        source: "/painel",
        destination: "/console",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
