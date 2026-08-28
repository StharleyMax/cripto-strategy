/**
 * Shared presentation helper: renders a ratio as a signed percentage string.
 *
 * Placeholder with real behaviour, for the same reason as `src/app/rotas.ts`: the
 * `components/` directory is one third of the layout that `ADR-009/D3` decided, and a
 * directory with no module in it is not a layout — it is an empty folder that git does
 * not even carry.
 */
export function formatarPercentual(razao: number, casas = 2): string {
  const sinal = razao > 0 ? "+" : "";
  return `${sinal}${(razao * 100).toFixed(casas)}%`;
}
