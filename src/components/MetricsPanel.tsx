import { type ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";
import {
    DEFAULT_METRICS_TIME_RANGE_KEY,
    METRICS_TIME_RANGE_OPTIONS,
    getMetricsTimeRange,
    type MetricsTimeRangeKey,
    type MetricsTimeRangeOption,
} from "@/lib/metrics-time-range";

interface MetricsPanelProps<T> {
    queryKey: unknown[];
    queryFn: (range: MetricsTimeRangeOption) => Promise<T[]>;
    loadingText?: string;
    emptyText?: string;
    children: (data: T[], range: MetricsTimeRangeOption) => ReactNode;
    className?: string;
    defaultRangeKey?: MetricsTimeRangeKey;
}

export function MetricsPanel<T>({
    queryKey,
    queryFn,
    loadingText = "Loading metrics…",
    emptyText = "No metrics data available.",
    children,
    className,
    defaultRangeKey = DEFAULT_METRICS_TIME_RANGE_KEY,
}: MetricsPanelProps<T>) {
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const [selectedRangeKey, setSelectedRangeKey] = useState<MetricsTimeRangeKey>(defaultRangeKey);
    const selectedRange = getMetricsTimeRange(selectedRangeKey);

    const { data, isLoading } = useQuery({
        queryKey: [...queryKey, selectedRange.key],
        queryFn: () => queryFn(selectedRange),
        refetchInterval: refreshIntervalMs,
    });

    return (
        <div className={cn(className ?? "mt-2", "space-y-2")}>
            <div className="flex items-center justify-end">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Range</span>
                    <select
                        value={selectedRangeKey}
                        onChange={(event) => setSelectedRangeKey(event.target.value as MetricsTimeRangeKey)}
                        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                        {METRICS_TIME_RANGE_OPTIONS.map((range) => (
                            <option key={range.key} value={range.key}>
                                {range.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center rounded border border-border bg-card py-4 text-xs text-muted-foreground">
                    {loadingText}
                </div>
            ) : !data?.length ? (
                <div className="flex items-center justify-center rounded border border-border bg-card py-4 text-xs text-muted-foreground">
                    {emptyText}
                </div>
            ) : (
                children(data, selectedRange)
            )}
        </div>
    );
}
