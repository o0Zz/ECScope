import { ecsApi } from "@/api";
import type { Ec2MetricsDataPoint } from "@/api/types";
import { Cpu, Network, HardDrive, ShieldAlert } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatPercent, formatBytes } from "@/lib/format";
import { PERCENT_CHART_PROPS, COMPACT_CHART_PROPS } from "./metrics-chart-presets";
import { useTranslation } from "react-i18next";

interface Ec2MetricsChartProps {
    instanceId: string;
}

export function Ec2MetricsChart({ instanceId }: Ec2MetricsChartProps) {
    const { t } = useTranslation();
    return (
        <MetricsPanel<Ec2MetricsDataPoint>
            queryKey={["ec2MetricsHistory", instanceId]}
            queryFn={(range) => ecsApi.getEc2MetricsHistory(instanceId, range)}
            loadingText={t("metrics.loadingEc2")}
            emptyText={t("metrics.noMetrics")}
        >
            {(data) => (
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-foreground">{t("metrics.instanceMetrics")}</h3>

                    {/* Row 1: CPU + Status Check */}
                    <div className="flex gap-3">
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.cpuUtilization}
                            color="oklch(0.6 0.15 250)"
                            label={t("metrics.cpuUtilization")}
                            icon={Cpu}
                            formatValue={formatPercent}
                            {...PERCENT_CHART_PROPS}
                        />
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.statusCheckFailed}
                            color="oklch(0.6 0.2 25)"
                            label={t("metrics.statusCheckFailed")}
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
                            label={t("metrics.networkIn")}
                            icon={Network}
                            formatValue={formatBytes}
                            summaryMode="now-avg-total"
                            {...COMPACT_CHART_PROPS}
                        />
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.networkOutBytes}
                            color="oklch(0.6 0.15 290)"
                            label={t("metrics.networkOut")}
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
                            label={t("metrics.diskRead")}
                            icon={HardDrive}
                            formatValue={formatBytes}
                            summaryMode="now-avg-total"
                            {...COMPACT_CHART_PROPS}
                        />
                        <MetricsChart<Ec2MetricsDataPoint>
                            data={data}
                            getValue={(d) => d.diskWriteBytes}
                            color="oklch(0.6 0.14 30)"
                            label={t("metrics.diskWrite")}
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
