import { ecsApi } from "@/api";
import type { MetricsDataPoint } from "@/api/types";
import { Cpu, MemoryStick } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatPercent } from "@/lib/format";

interface ServiceMetricsChartProps {
    clusterName: string;
    serviceName: string;
}

const PERCENT_Y_TICKS = [0, 25, 50, 75, 100];

export function ServiceMetricsChart({ clusterName, serviceName }: ServiceMetricsChartProps) {
    return (
        <MetricsPanel<MetricsDataPoint>
            queryKey={["serviceMetricsHistory", clusterName, serviceName]}
            queryFn={() => ecsApi.getServiceMetricsHistory(clusterName, serviceName)}
            loadingText="Loading metrics…"
            emptyText="No metrics data available."
            className="mt-4"
        >
            {(data) => (
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
            )}
        </MetricsPanel>
    );
}
