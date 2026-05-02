import { ecsApi } from "@/api";
import type { NlbMetricsDataPoint } from "@/api/types";
import { Activity, ArrowRightLeft, HardDrive, AlertTriangle } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatNumber, formatBytes } from "@/lib/format";
import { useTranslation } from "react-i18next";

interface NlbMetricsChartProps {
    nlbArn: string;
    nlbName: string;
}

export function NlbMetricsChart({ nlbArn, nlbName }: NlbMetricsChartProps) {
    const { t } = useTranslation();
    return (
        <MetricsPanel<NlbMetricsDataPoint>
            queryKey={["nlbMetricsHistory", nlbArn]}
            queryFn={(range) => ecsApi.getNlbMetricsHistory(nlbArn, range)}
            loadingText={t("metrics.loadingNlb")}
            emptyText={t("metrics.noNlbMetrics", { name: nlbName })}
        >
            {(data) => {
                const hasResets = data.some((d) => d.tcpClientResetCount > 0 || d.tcpTargetResetCount > 0);
                return (
                    <div>
                        <div className="grid grid-cols-2 gap-2">
                            <MetricsChart<NlbMetricsDataPoint>
                                data={data}
                                getValue={(d) => d.activeFlowCount}
                                color="oklch(0.6 0.15 250)"
                                label={t("metrics.activeFlows")}
                                icon={Activity}
                                formatValue={formatNumber}
                            />
                            <MetricsChart<NlbMetricsDataPoint>
                                data={data}
                                getValue={(d) => d.newFlowCount}
                                color="oklch(0.7 0.15 160)"
                                label={t("metrics.newFlows")}
                                icon={ArrowRightLeft}
                                formatValue={formatNumber}
                            />
                            <MetricsChart<NlbMetricsDataPoint>
                                data={data}
                                getValue={(d) => d.processedBytes}
                                color="oklch(0.7 0.15 85)"
                                label={t("metrics.processedBytes")}
                                icon={HardDrive}
                                formatValue={formatBytes}
                            />
                            {hasResets && (
                                <MetricsChart<NlbMetricsDataPoint>
                                    data={data}
                                    getValue={(d) => d.tcpClientResetCount + d.tcpTargetResetCount}
                                    color="oklch(0.55 0.2 25)"
                                    label={t("metrics.tcpResets")}
                                    icon={AlertTriangle}
                                    formatValue={formatNumber}
                                />
                            )}
                        </div>
                    </div>
                );
            }}
        </MetricsPanel>
    );
}
