/**
 * Shared presentation helper: renders a ratio as a signed percentage string.
 *
 * Placeholder with real behaviour, for the same reason as `src/app/routes.ts`: the
 * `components/` directory is one third of the layout that `ADR-009/D3` decided, and a
 * directory with no module in it is not a layout — it is an empty folder that git does
 * not even carry.
 */
export function formatPercentage(ratio: number, digits = 2): string {
  const sign = ratio > 0 ? "+" : "";
  return `${sign}${(ratio * 100).toFixed(digits)}%`;
}
