import { ecsApi } from "@/api";
import type { RdsMetricsDataPoint } from "@/api/types";
import { Cpu, Database, Network, HardDrive, Timer, Users } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatPercent, formatBytes, formatNumber } from "@/lib/format";
import { PERCENT_CHART_PROPS, COMPACT_CHART_PROPS } from "./metrics-chart-presets";
import { useTranslation } from "react-i18next";

interface RdsMetricsChartProps {
    dbInstanceIdentifier: string;
}

function formatMs(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
    return `${v.toFixed(1)}ms`;
}

function formatIOPS(v: number): string {
    return `${formatNumber(v)} IOPS`;
}

export function RdsMetricsChart({ dbInstanceIdentifier }: RdsMetricsChartProps) {
    const { t } = useTranslation();
    return (
        <MetricsPanel<RdsMetricsDataPoint>
            queryKey={["rdsMetricsHistory", dbInstanceIdentifier]}
            queryFn={(range) => ecsApi.getRdsMetricsHistory(dbInstanceIdentifier, range)}
            loadingText={t("metrics.loadingRds")}
            emptyText={t("metrics.noMetrics")}
        >
            {(data) => (
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-foreground">{t("metrics.databaseMetrics")}</h3>

                    {/* Row 1: CPU + Connections */}
                    <div className="flex gap-3">
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.cpuUtilization}
                            color="oklch(0.6 0.15 250)"
                            label={t("metrics.cpuUtilization")}
                            icon={Cpu}
                            formatValue={formatPercent}
                            {...PERCENT_CHART_PROPS}
                        />
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.databaseConnections}
                            color="oklch(0.6 0.18 145)"
                            label={t("metrics.dbConnections")}
                            icon={Users}
                            formatValue={(v) => formatNumber(v)}
                            summaryMode="current-avg-minmax"
                            {...COMPACT_CHART_PROPS}
                        />
                    </div>

                    {/* Row 2: Read IOPS / Write IOPS */}
                    <div className="flex gap-3">
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.readIOPS}
                            color="oklch(0.65 0.12 70)"
                            label={t("metrics.readIops")}
                            icon={HardDrive}
                            formatValue={formatIOPS}
                            summaryMode="current-avg-minmax"
                            {...COMPACT_CHART_PROPS}
                        />
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.writeIOPS}
                            color="oklch(0.6 0.14 30)"
                            label={t("metrics.writeIops")}
                            icon={HardDrive}
                            formatValue={formatIOPS}
                            summaryMode="current-avg-minmax"
                            {...COMPACT_CHART_PROPS}
                        />
                    </div>

                    {/* Row 3: Read Latency / Write Latency */}
                    <div className="flex gap-3">
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.readLatencyMs}
                            color="oklch(0.6 0.15 290)"
                            label={t("metrics.readLatency")}
                            icon={Timer}
                            formatValue={formatMs}
                            summaryMode="current-avg-minmax"
                            {...COMPACT_CHART_PROPS}
                        />
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.writeLatencyMs}
                            color="oklch(0.6 0.2 25)"
                            label={t("metrics.writeLatency")}
                            icon={Timer}
                            formatValue={formatMs}
                            summaryMode="current-avg-minmax"
                            {...COMPACT_CHART_PROPS}
                        />
                    </div>

                    {/* Row 4: Freeable Memory / Free Storage */}
                    <div className="flex gap-3">
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.freeableMemoryBytes}
                            color="oklch(0.6 0.18 200)"
                            label={t("metrics.freeableMemory")}
                            icon={Database}
                            formatValue={formatBytes}
                            summaryMode="current-avg-minmax"
                            {...COMPACT_CHART_PROPS}
                        />
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.freeStorageSpaceBytes}
                            color="oklch(0.6 0.12 160)"
                            label={t("metrics.freeStorageSpace")}
                            icon={Network}
                            formatValue={formatBytes}
                            summaryMode="current-avg-minmax"
                            {...COMPACT_CHART_PROPS}
                        />
                    </div>
                </div>
            )}
        </MetricsPanel>
    );
}
