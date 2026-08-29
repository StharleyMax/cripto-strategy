/**
 * Route identifiers of the App Router surface.
 *
 * Why this file exists at all: `ADR-009/D3` fixes the layout at
 * `frontend/src/{app,features,components}` because the `web-fullstack` pack pins its
 * rule surface to `frontend/src/**`. An App Router placed at `frontend/app/` would
 * fall outside the rule universe IN SILENCE, and the `doctor` would still report
 * CONFORME over a universe that excludes it. The directory is part of the enforcement
 * contract, not of the styling.
 *
 * The Next.js pages themselves belong to the `web` component and are NOT created by
 * this task: scaffolding an application here would be scope this task does not own.
 */
export const ROUTES = {
  panel: "/painel",
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];
