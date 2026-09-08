# Single image for the `web` service (ADR-032/D2, T-03.2). Base `node:22-alpine`
# -- Next 16 requires Node >= 20.9; 22 is the current LTS ([INFERRED]).
#
# Builds from a clean tree (`.dockerignore` excludes `node_modules/` and `.next/`)
# so the image never inherits a stale local build cache -- this is the fix for the
# fourth gap PR #166 SS1 measured (frontend/.next out of date), SPEC-004 SS3.6.1.
#
# `command:` in `deploy/compose.yml` already overrides the runtime entrypoint
# (`npm start`); the `CMD` below only makes the image runnable standalone.
FROM node:22-alpine

WORKDIR /app

# Install with the lockfile only first so dependency layers cache across
# source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
