import { ecsApi } from "@/api";
import type { AlbMetricsDataPoint } from "@/api/types";
import { Activity, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import { MetricsChart } from "./MetricsChart";
import { MetricsPanel } from "./MetricsPanel";
import { formatNumber } from "@/lib/format";
import { formatMetricsTimeRangeLabel } from "@/lib/metrics-time-range";
import { useTranslation } from "react-i18next";

interface AlbMetricsChartProps {
    albArn: string;
    albName: string;
}

export function AlbMetricsChart({ albArn, albName }: AlbMetricsChartProps) {
    const { t } = useTranslation();
    return (
        <MetricsPanel<AlbMetricsDataPoint>
            queryKey={["albMetricsHistory", albArn]}
            queryFn={(range) => ecsApi.getAlbMetricsHistory(albArn, range)}
            loadingText={t("metrics.loadingAlb")}
            emptyText={t("metrics.noAlbMetrics", { name: albName })}
        >
            {(data, range) => {
                const has5xx = data.some((d) => d.http5xxCount > 0);
                const has4xx = data.some((d) => d.http4xxCount > 0);
                return (
                    <div>
                        <div className="grid grid-cols-2 gap-2">
                            <MetricsChart<AlbMetricsDataPoint>
                                data={data}
                                getValue={(d) => d.requestCount}
                                color="oklch(0.6 0.15 250)"
                                label={t("metrics.requests")}
                                icon={Activity}
                                formatValue={formatNumber}
                            />
                            <MetricsChart<AlbMetricsDataPoint>
                                data={data}
                                getValue={(d) => d.targetResponseTimeMs}
                                color="oklch(0.7 0.15 85)"
                                label={t("metrics.latencyMs")}
                                icon={Clock}
                                formatValue={(v) => `${v.toFixed(0)}ms`}
                            />
                            {has5xx && (
                                <MetricsChart<AlbMetricsDataPoint>
                                    data={data}
                                    getValue={(d) => d.http5xxCount}
                                    color="oklch(0.55 0.2 25)"
                                    label={t("metrics.http5xx")}
                                    icon={AlertCircle}
                                    formatValue={formatNumber}
                                />
                            )}
                            {has4xx && (
                                <MetricsChart<AlbMetricsDataPoint>
                                    data={data}
                                    getValue={(d) => d.http4xxCount}
                                    color="oklch(0.7 0.15 55)"
                                    label={t("metrics.http4xx")}
                                    icon={AlertTriangle}
                                    formatValue={formatNumber}
                                />
                            )}
                            {!has5xx && !has4xx && (
                                <div className="flex items-center justify-center rounded-lg border border-border bg-card p-2.5 text-xs text-success col-span-2">
                                    {t("metrics.noHttpErrors", {
                                        range: formatMetricsTimeRangeLabel(range).toLowerCase(),
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                );
            }}
        </MetricsPanel>
    );
}
