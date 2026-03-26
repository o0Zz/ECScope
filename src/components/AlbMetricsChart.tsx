import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useConfigStore } from "@/store/config";
import type { AlbMetricsDataPoint } from "@/api/types";
import { Activity, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import { MetricsChart, formatNumber } from "./MetricsChart";

interface AlbMetricsChartProps {
    albArn: string;
    albName: string;
}

export function AlbMetricsChart({ albArn, albName }: AlbMetricsChartProps) {
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const { data, isLoading } = useQuery({
        queryKey: ["albMetricsHistory", albArn],
        queryFn: () => ecsApi.getAlbMetricsHistory(albArn),
        refetchInterval: refreshIntervalMs,
    });

    if (isLoading) {
        return (
            <div className="mt-2 flex items-center justify-center rounded border border-border bg-card py-4 text-xs text-muted-foreground">
                Loading ALB metrics…
            </div>
        );
    }

    if (!data?.length) {
        return (
            <div className="mt-2 flex items-center justify-center rounded border border-border bg-card py-4 text-xs text-muted-foreground">
                No metrics data available for {albName}.
            </div>
        );
    }

    const has5xx = data.some((d) => d.http5xxCount > 0);
    const has4xx = data.some((d) => d.http4xxCount > 0);

    return (
        <div className="mt-2">
            <div className="grid grid-cols-2 gap-2">
                <MetricsChart<AlbMetricsDataPoint>
                    data={data}
                    getValue={(d) => d.requestCount}
                    color="oklch(0.6 0.15 250)"
                    label="Requests"
                    icon={Activity}
                    formatValue={formatNumber}
                />
                <MetricsChart<AlbMetricsDataPoint>
                    data={data}
                    getValue={(d) => d.targetResponseTimeMs}
                    color="oklch(0.7 0.15 85)"
                    label="Latency (ms)"
                    icon={Clock}
                    formatValue={(v) => `${v.toFixed(0)}ms`}
                />
                {has5xx && (
                    <MetricsChart<AlbMetricsDataPoint>
                        data={data}
                        getValue={(d) => d.http5xxCount}
                        color="oklch(0.55 0.2 25)"
                        label="HTTP 5xx"
                        icon={AlertCircle}
                        formatValue={formatNumber}
                    />
                )}
                {has4xx && (
                    <MetricsChart<AlbMetricsDataPoint>
                        data={data}
                        getValue={(d) => d.http4xxCount}
                        color="oklch(0.7 0.15 55)"
                        label="HTTP 4xx"
                        icon={AlertTriangle}
                        formatValue={formatNumber}
                    />
                )}
                {!has5xx && !has4xx && (
                    <div className="flex items-center justify-center rounded-lg border border-border bg-card p-2.5 text-xs text-success col-span-2">
                        No HTTP errors in the last 24h
                    </div>
                )}
            </div>
        </div>
    );
}
