import { ecsApi } from "@/api";
import type { MetricsDataPoint } from "@/api/types";
import { Cpu, MemoryStick } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatPercent } from "@/lib/format";
import { PERCENT_Y_TICKS } from "./metrics-chart-presets";
import { useTranslation } from "react-i18next";

interface ServiceMetricsChartProps {
    clusterName: string;
    serviceName: string;
}

export function ServiceMetricsChart({ clusterName, serviceName }: ServiceMetricsChartProps) {
    const { t } = useTranslation();
    return (
        <MetricsPanel<MetricsDataPoint>
            queryKey={["serviceMetricsHistory", clusterName, serviceName]}
            queryFn={(range) => ecsApi.getServiceMetricsHistory(clusterName, serviceName, range)}
            loadingText={t("metrics.loadingMetrics")}
            emptyText={t("metrics.noMetrics")}
            className="mt-4"
        >
            {(data) => (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">{t("metrics.serviceMetrics")}</h3>
                    <div className="flex gap-3">
                        <MetricsChart<MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.cpuUtilization}
                            color="oklch(0.6 0.15 250)"
                            label={t("metrics.cpuUsage")}
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
                            label={t("metrics.memoryUsage")}
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
