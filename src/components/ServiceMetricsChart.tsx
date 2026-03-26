import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useConfigStore } from "@/store/config";
import type { MetricsDataPoint } from "@/api/types";
import { Cpu, MemoryStick } from "lucide-react";
import { MetricsChart, formatPercent } from "./MetricsChart";

interface ServiceMetricsChartProps {
    clusterName: string;
    serviceName: string;
}

const PERCENT_Y_TICKS = [0, 25, 50, 75, 100];

export function ServiceMetricsChart({ clusterName, serviceName }: ServiceMetricsChartProps) {
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const { data, isLoading } = useQuery({
        queryKey: ["serviceMetricsHistory", clusterName, serviceName],
        queryFn: () => ecsApi.getServiceMetricsHistory(clusterName, serviceName),
        refetchInterval: refreshIntervalMs,
    });

    if (isLoading) {
        return (
            <div className="mt-4 flex items-center justify-center rounded-lg border border-border bg-card py-8 text-sm text-muted-foreground">
                Loading metrics…
            </div>
        );
    }

    if (!data?.length) {
        return (
            <div className="mt-4 flex items-center justify-center rounded-lg border border-border bg-card py-8 text-sm text-muted-foreground">
                No metrics data available.
            </div>
        );
    }

    return (
        <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Service Metrics (last 24h)</h3>
            <div className="flex gap-3">
                <MetricsChart<MetricsDataPoint>
                    data={data}
                    getValue={(d) => d.cpuUtilization}
                    color="oklch(0.6 0.15 250)"
                    label="CPU Usage"
                    icon={Cpu}
                    formatValue={formatPercent}
                    yScale={{ min: 0, max: 100 }}
                    yTicks={PERCENT_Y_TICKS}
                    formatYTick={(v) => `${v}%`}
                    summaryMode="current-avg-minmax"
                    chartHeight="h-48"
                    height={120}
                    margins={{ left: 32, right: 4, top: 4, bottom: 18 }}
                />
                <MetricsChart<MetricsDataPoint>
                    data={data}
                    getValue={(d) => d.memoryUtilization}
                    color="oklch(0.6 0.18 145)"
                    label="Memory Usage"
                    icon={MemoryStick}
                    formatValue={formatPercent}
                    yScale={{ min: 0, max: 100 }}
                    yTicks={PERCENT_Y_TICKS}
                    formatYTick={(v) => `${v}%`}
                    summaryMode="current-avg-minmax"
                    chartHeight="h-48"
                    height={120}
                    margins={{ left: 32, right: 4, top: 4, bottom: 18 }}
                />
            </div>
        </div>
    );
}
