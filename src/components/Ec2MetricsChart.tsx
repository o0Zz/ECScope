import { ecsApi } from "@/api";
import type { Ec2MetricsDataPoint } from "@/api/types";
import { Cpu, Network, HardDrive, ShieldAlert } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatPercent, formatBytes } from "@/lib/format";
import { PERCENT_CHART_PROPS, COMPACT_CHART_PROPS } from "./metrics-chart-presets";

interface Ec2MetricsChartProps {
    instanceId: string;
}

export function Ec2MetricsChart({ instanceId }: Ec2MetricsChartProps) {
    return (
        <MetricsPanel<Ec2MetricsDataPoint>
            queryKey={["ec2MetricsHistory", instanceId]}
            queryFn={(range) => ecsApi.getEc2MetricsHistory(instanceId, range)}
            loadingText="Loading EC2 metrics…"
            emptyText="No metrics data available."
        >
            {(data) => (
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-foreground">Instance Metrics</h3>

                    {/* Row 1: CPU + Status Check */}
                    <div className="flex gap-3">
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.cpuUtilization}
                            color="oklch(0.6 0.15 250)"
                            label="CPU Utilization"
                            icon={Cpu}
                            formatValue={formatPercent}
                            {...PERCENT_CHART_PROPS}
                        />
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.statusCheckFailed}
                            color="oklch(0.6 0.2 25)"
                            label="Status Check Failed"
                            icon={ShieldAlert}
                            formatValue={(v) => (v === 0 ? "OK" : `${v}`)}
                            yScale={{ min: 0, max: 2 }}
                            yTicks={[0, 1, 2]}
                            summaryMode="current-avg-minmax"
                            {...COMPACT_CHART_PROPS}
                        />
                    </div>

                    {/* Row 2: Network In / Out */}
                    <div className="flex gap-3">
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.networkInBytes}
                            color="oklch(0.6 0.18 145)"
                            label="Network In"
                            icon={Network}
                            formatValue={formatBytes}
                            summaryMode="now-avg-total"
                            {...COMPACT_CHART_PROPS}
                        />
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.networkOutBytes}
                            color="oklch(0.6 0.15 290)"
                            label="Network Out"
                            icon={Network}
                            formatValue={formatBytes}
                            summaryMode="now-avg-total"
                            {...COMPACT_CHART_PROPS}
                        />
                    </div>

                    {/* Row 3: Disk Read / Write */}
                    <div className="flex gap-3">
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.diskReadBytes}
                            color="oklch(0.65 0.12 70)"
                            label="Disk Read"
                            icon={HardDrive}
                            formatValue={formatBytes}
                            summaryMode="now-avg-total"
                            {...COMPACT_CHART_PROPS}
                        />
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.diskWriteBytes}
                            color="oklch(0.6 0.14 30)"
                            label="Disk Write"
                            icon={HardDrive}
                            formatValue={formatBytes}
                            summaryMode="now-avg-total"
                            {...COMPACT_CHART_PROPS}
                        />
                    </div>
                </div>
            )}
        </MetricsPanel>
    );
}
