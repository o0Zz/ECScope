/** Common Y-axis ticks for percentage-based charts (0-100%) */
export const PERCENT_Y_TICKS = [0, 25, 50, 75, 100];

/** Standard chart margins for compact metric charts */
export const COMPACT_CHART_MARGINS = { left: 42, right: 4, top: 4, bottom: 18 };

/** Standard props for compact metric charts (h-40, 110px height) */
export const COMPACT_CHART_PROPS = {
    chartHeight: "h-40" as const,
    height: 110,
    margins: COMPACT_CHART_MARGINS,
};

/** Standard props for percentage metric charts (compact + percent scale) */
export const PERCENT_CHART_PROPS = {
    ...COMPACT_CHART_PROPS,
    yScale: { min: 0, max: 100 } as const,
    yTicks: PERCENT_Y_TICKS,
    formatYTick: (v: number) => `${v}%`,
    summaryMode: "current-avg-minmax" as const,
};
