import { ecsApi } from "@/api";
import type { RdsMetricsDataPoint } from "@/api/types";
import { Cpu, Database, Network, HardDrive, Timer, Users } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatPercent, formatBytes, formatNumber } from "@/lib/format";

interface RdsMetricsChartProps {
    dbInstanceIdentifier: string;
}

const PERCENT_Y_TICKS = [0, 25, 50, 75, 100];

const CHART_MARGINS = { left: 42, right: 4, top: 4, bottom: 18 };

function formatMs(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
    return `${v.toFixed(1)}ms`;
}

function formatIOPS(v: number): string {
    return `${formatNumber(v)} IOPS`;
}

export function RdsMetricsChart({ dbInstanceIdentifier }: RdsMetricsChartProps) {
    return (
        <MetricsPanel<RdsMetricsDataPoint>
            queryKey={["rdsMetricsHistory", dbInstanceIdentifier]}
            queryFn={() => ecsApi.getRdsMetricsHistory(dbInstanceIdentifier)}
            loadingText="Loading RDS metrics…"
            emptyText="No metrics data available."
        >
            {(data) => (
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-foreground">Database Metrics (last 24h)</h3>

                    {/* Row 1: CPU + Connections */}
                    <div className="flex gap-3">
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.cpuUtilization}
                            color="oklch(0.6 0.15 250)"
                            label="CPU Utilization"
                            icon={Cpu}
                            formatValue={formatPercent}
                            yScale={{ min: 0, max: 100 }}
                            yTicks={PERCENT_Y_TICKS}
                            formatYTick={(v) => `${v}%`}
                            summaryMode="current-avg-minmax"
                            chartHeight="h-40"
                            height={110}
                            margins={CHART_MARGINS}
                        />
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.databaseConnections}
                            color="oklch(0.6 0.18 145)"
                            label="DB Connections"
                            icon={Users}
                            formatValue={(v) => formatNumber(v)}
                            summaryMode="current-avg-minmax"
                            chartHeight="h-40"
                            height={110}
                            margins={CHART_MARGINS}
                        />
                    </div>

                    {/* Row 2: Read IOPS / Write IOPS */}
                    <div className="flex gap-3">
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.readIOPS}
                            color="oklch(0.65 0.12 70)"
                            label="Read IOPS"
                            icon={HardDrive}
                            formatValue={formatIOPS}
                            summaryMode="current-avg-minmax"
                            chartHeight="h-40"
                            height={110}
                            margins={CHART_MARGINS}
                        />
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.writeIOPS}
                            color="oklch(0.6 0.14 30)"
                            label="Write IOPS"
                            icon={HardDrive}
                            formatValue={formatIOPS}
                            summaryMode="current-avg-minmax"
                            chartHeight="h-40"
                            height={110}
                            margins={CHART_MARGINS}
                        />
                    </div>

                    {/* Row 3: Read Latency / Write Latency */}
                    <div className="flex gap-3">
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.readLatencyMs}
                            color="oklch(0.6 0.15 290)"
                            label="Read Latency"
                            icon={Timer}
                            formatValue={formatMs}
                            summaryMode="current-avg-minmax"
                            chartHeight="h-40"
                            height={110}
                            margins={CHART_MARGINS}
                        />
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.writeLatencyMs}
                            color="oklch(0.6 0.2 25)"
                            label="Write Latency"
                            icon={Timer}
                            formatValue={formatMs}
                            summaryMode="current-avg-minmax"
                            chartHeight="h-40"
                            height={110}
                            margins={CHART_MARGINS}
                        />
                    </div>

                    {/* Row 4: Freeable Memory / Free Storage */}
                    <div className="flex gap-3">
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.freeableMemoryBytes}
                            color="oklch(0.6 0.18 200)"
                            label="Freeable Memory"
                            icon={Database}
                            formatValue={formatBytes}
                            summaryMode="current-avg-minmax"
                            chartHeight="h-40"
                            height={110}
                            margins={CHART_MARGINS}
                        />
                        <MetricsChart<RdsMetricsDataPoint>
                            data={data}
                            getValue={(d) => d.freeStorageSpaceBytes}
                            color="oklch(0.6 0.12 160)"
                            label="Free Storage Space"
                            icon={Network}
                            formatValue={formatBytes}
                            summaryMode="current-avg-minmax"
                            chartHeight="h-40"
                            height={110}
                            margins={CHART_MARGINS}
                        />
                    </div>
                </div>
            )}
        </MetricsPanel>
    );
}
