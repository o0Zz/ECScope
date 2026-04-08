export type MetricsTimeRangeKey = "15m" | "1h" | "4h" | "8h" | "1d" | "2d" | "3d" | "7d" | "14d";

export interface MetricsTimeRangeOption {
    key: MetricsTimeRangeKey;
    label: string;
    lookbackMs: number;
    idealPeriodSeconds: number;
}

const MIN_STANDARD_METRIC_PERIOD_SECONDS = 60;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export const DEFAULT_METRICS_TIME_RANGE_KEY: MetricsTimeRangeKey = "1d";

export const METRICS_TIME_RANGE_OPTIONS = [
    { key: "15m", label: "15 min", lookbackMs: 15 * 60 * 1000, idealPeriodSeconds: 1 },
    { key: "1h", label: "1 hr", lookbackMs: 60 * 60 * 1000, idealPeriodSeconds: 5 },
    { key: "4h", label: "4 hr", lookbackMs: 4 * 60 * 60 * 1000, idealPeriodSeconds: 30 },
    { key: "8h", label: "8 hr", lookbackMs: 8 * 60 * 60 * 1000, idealPeriodSeconds: 60 },
    { key: "1d", label: "1 day", lookbackMs: 24 * 60 * 60 * 1000, idealPeriodSeconds: 300 },
    { key: "2d", label: "2 days", lookbackMs: 2 * 24 * 60 * 60 * 1000, idealPeriodSeconds: 600 },
    { key: "3d", label: "3 days", lookbackMs: 3 * 24 * 60 * 60 * 1000, idealPeriodSeconds: 900 },
    { key: "7d", label: "7 days", lookbackMs: 7 * 24 * 60 * 60 * 1000, idealPeriodSeconds: 1800 },
    { key: "14d", label: "14 days", lookbackMs: 14 * 24 * 60 * 60 * 1000, idealPeriodSeconds: 3600 },
] as const satisfies readonly MetricsTimeRangeOption[];

const metricsTimeRangeByKey = new Map(METRICS_TIME_RANGE_OPTIONS.map((range) => [range.key, range]));

function roundUpToMultiple(value: number, multiple: number): number {
    return Math.ceil(value / multiple) * multiple;
}

export function getMetricsTimeRange(key: MetricsTimeRangeKey): MetricsTimeRangeOption {
    return metricsTimeRangeByKey.get(key) ?? metricsTimeRangeByKey.get(DEFAULT_METRICS_TIME_RANGE_KEY)!;
}

export function formatMetricsTimeRangeLabel(range: MetricsTimeRangeOption): string {
    return range.label;
}

export function getCloudWatchPeriodSeconds(range: MetricsTimeRangeOption): number {
    let periodSeconds = Math.max(range.idealPeriodSeconds, MIN_STANDARD_METRIC_PERIOD_SECONDS);

    if (range.lookbackMs > FIFTEEN_DAYS_MS) {
        periodSeconds = Math.max(periodSeconds, 300);
    }

    if (range.lookbackMs > THREE_HOURS_MS) {
        periodSeconds = roundUpToMultiple(periodSeconds, 60);
    }

    return periodSeconds;
}
