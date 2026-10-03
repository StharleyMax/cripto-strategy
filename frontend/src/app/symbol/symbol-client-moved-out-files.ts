/**
 * TEST SUPPORT ONLY — no production module imports this file.
 *
 * `estrutura-do-front` `T-01.3` — the legend and the absence/coverage marks left `SymbolClient.tsx` for
 * `chart/legend/` and `chart/marks/`; `T-01.4` — the page chrome left it for `chrome/`. The source-scanning
 * contracts read these files together with `SymbolClient.tsx`, so the universe they scan is the one
 * `SymbolClient.tsx` alone was before the move.
 *
 * `T-10.10` — this list used to be copied, verbatim, into 9 test files (`UNIT-FRONT-analise` §4), and every
 * slice that moved a file out of `SymbolClient.tsx` had to widen all 9. It lives here once now: a move edits
 * ONE list. Paths are relative to `app/symbol/`.
 */
export const MOVED_OUT_FILES = [
  "chart/legend/PaneLegend.tsx",
  "chart/legend/legend-frame.ts",
  "chart/legend/LegendValue.tsx",
  "chart/marks/AbsenceNote.tsx",
  "chart/marks/PartialCoverageMark.tsx",
  "chart/marks/BeyondCoverageBadge.tsx",
  "chrome/AttributionFooter.tsx",
  "chrome/ChromeModeStamp.tsx",
  "chrome/LiveRow.tsx",
  "chrome/page-gutter.ts",
  "chrome/TimeframeBar.tsx",
] as const;
