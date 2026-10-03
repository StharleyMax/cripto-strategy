/** `T-01.11-FIX` (`SF-5`) — the left gutter of the page's text blocks outside the chart (the chrome
 * stamp, "Ao vivo", the footer), which started at x=0. `px-2` = 8px, the same inset the pane legends
 * have inside the plot area (`PaneLegend`), so every left text edge lines up. The chart itself keeps
 * its full width: its geometry is `ADR-044`'s, not this gutter's. */
export const PAGE_GUTTER_CLASS = "px-2";
