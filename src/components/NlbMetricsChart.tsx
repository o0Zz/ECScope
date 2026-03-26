import { ecsApi } from "@/api";
import type { NlbMetricsDataPoint } from "@/api/types";
import { Activity, ArrowRightLeft, HardDrive, AlertTriangle } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatNumber, formatBytes } from "@/lib/format";

interface NlbMetricsChartProps {
    nlbArn: string;
    nlbName: string;
}

export function NlbMetricsChart({ nlbArn, nlbName }: NlbMetricsChartProps) {
    return (
        <MetricsPanel<NlbMetricsDataPoint>
            queryKey={["nlbMetricsHistory", nlbArn]}
            queryFn={() => ecsApi.getNlbMetricsHistory(nlbArn)}
            loadingText="Loading NLB metrics…"
            emptyText={`No metrics data available for ${nlbName}.`}
        >
            {(data) => {
                const hasResets = data.some((d) => d.tcpClientResetCount > 0 || d.tcpTargetResetCount > 0);
                return (
                    <div className="mt-2">
                        <div className="grid grid-cols-2 gap-2">
                            <MetricsChart<NlbMetricsDataPoint>
                                data={data}
                                getValue={(d) => d.activeFlowCount}
                                color="oklch(0.6 0.15 250)"
                                label="Active Flows"
                                icon={Activity}
                                formatValue={formatNumber}
                            />
                            <MetricsChart<NlbMetricsDataPoint>
                                data={data}
                                getValue={(d) => d.newFlowCount}
                                color="oklch(0.7 0.15 160)"
                                label="New Flows"
                                icon={ArrowRightLeft}
                                formatValue={formatNumber}
                            />
                            <MetricsChart<NlbMetricsDataPoint>
                                data={data}
                                getValue={(d) => d.processedBytes}
                                color="oklch(0.7 0.15 85)"
                                label="Processed Bytes"
                                icon={HardDrive}
                                formatValue={formatBytes}
                            />
                            {hasResets && (
                                <MetricsChart<NlbMetricsDataPoint>
                                    data={data}
                                    getValue={(d) => d.tcpClientResetCount + d.tcpTargetResetCount}
                                    color="oklch(0.55 0.2 25)"
                                    label="TCP Resets"
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
