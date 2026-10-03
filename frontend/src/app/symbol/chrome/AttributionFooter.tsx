import { CHART_ATTRIBUTION_TESTID, CHART_ATTRIBUTION_URL } from "../chart-options.ts";
import { PAGE_GUTTER_CLASS } from "./page-gutter.ts";

export function AttributionFooter() {
  return (
    <footer data-testid={CHART_ATTRIBUTION_TESTID} className={`${PAGE_GUTTER_CLASS} mt-2 text-xs text-provenance-weak`}>
      Gráficos:{" "}
      <a href={CHART_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer" className="underline">
        TradingView Lightweight Charts
      </a>
    </footer>
  );
}
