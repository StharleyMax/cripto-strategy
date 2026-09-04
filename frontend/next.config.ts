import type { NextConfig } from "next";

// Minimal on purpose. NEVER add `eslint.ignoreDuringBuilds` or
// `typescript.ignoreBuildErrors` here -- ADR-018 D5.16 exists precisely so a
// planted type error fails `make lint-frontend` and `next build`, not so it
// gets silenced by config.
const nextConfig: NextConfig = {};

export default nextConfig;
