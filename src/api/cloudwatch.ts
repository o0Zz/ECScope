import { GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { getCwClient } from "./clients";
import type { MetricsDataPoint, AlbMetricsDataPoint, NlbMetricsDataPoint } from "./types";

// ─── Generic CloudWatch helper ───────────────────────────

interface MetricQuery {
    id: string;
    namespace: string;
    metricName: string;
    dimensions: { Name: string; Value: string }[];
    stat: string;
}

interface MetricResults {
    timestamps: number[];
    values: Map<string, number[]>;
}

export async function queryMetrics(
    queries: MetricQuery[],
    periodSeconds: number,
    lookbackMs: number,
): Promise<MetricResults> {
    const now = new Date();
    const start = new Date(now.getTime() - lookbackMs);

    const res = await getCwClient().send(
        new GetMetricDataCommand({
            StartTime: start,
            EndTime: now,
            MetricDataQueries: queries.map((q) => ({
                Id: q.id,
                MetricStat: {
                    Metric: {
                        Namespace: q.namespace,
                        MetricName: q.metricName,
                        Dimensions: q.dimensions,
                    },
                    Period: periodSeconds,
                    Stat: q.stat,
                },
            })),
        }),
    );

    const results = res.MetricDataResults ?? [];
    const first = results[0];
    const timestamps = (first?.Timestamps ?? []).map((ts) => new Date(ts).getTime());
    const values = new Map<string, number[]>();
    for (const r of results) {
        values.set(r.Id ?? "", r.Values ?? []);
    }
    return { timestamps, values };
}

// ─── History functions ───────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function ecsDimensions(clusterName: string, serviceName: string) {
    return [
        { Name: "ClusterName" as const, Value: clusterName },
        { Name: "ServiceName" as const, Value: serviceName },
    ];
}

export async function getServiceMetricsHistory(
    clusterName: string,
    serviceName: string,
): Promise<MetricsDataPoint[]> {
    try {
        const dims = ecsDimensions(clusterName, serviceName);
        const { timestamps, values } = await queryMetrics(
            [
                { id: "cpu", namespace: "AWS/ECS", metricName: "CPUUtilization", dimensions: dims, stat: "Average" },
                { id: "mem", namespace: "AWS/ECS", metricName: "MemoryUtilization", dimensions: dims, stat: "Average" },
            ],
            300,
            ONE_DAY_MS,
        );
        const cpu = values.get("cpu") ?? [];
        const mem = values.get("mem") ?? [];
        return timestamps
            .map((ts, i) => ({
                timestamp: ts,
                cpuUtilization: Math.round((cpu[i] ?? 0) * 10) / 10,
                memoryUtilization: Math.round((mem[i] ?? 0) * 10) / 10,
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        console.warn(`[aws] Failed to fetch metrics history for ${serviceName}:`, err);
        return [];
    }
}

export async function getAlbMetricsHistory(
    albArn: string,
): Promise<AlbMetricsDataPoint[]> {
    const albDimension = albArn.split(":loadbalancer/")[1] ?? "";
    if (!albDimension) return [];

    try {
        const dims = [{ Name: "LoadBalancer" as const, Value: albDimension }];
        const ns = "AWS/ApplicationELB";
        const { timestamps, values } = await queryMetrics(
            [
                { id: "requests", namespace: ns, metricName: "RequestCount", dimensions: dims, stat: "Sum" },
                { id: "http5xx", namespace: ns, metricName: "HTTPCode_ELB_5XX_Count", dimensions: dims, stat: "Sum" },
                { id: "http4xx", namespace: ns, metricName: "HTTPCode_ELB_4XX_Count", dimensions: dims, stat: "Sum" },
                { id: "latency", namespace: ns, metricName: "TargetResponseTime", dimensions: dims, stat: "Average" },
            ],
            300,
            ONE_DAY_MS,
        );
        const req = values.get("requests") ?? [];
        const h5xx = values.get("http5xx") ?? [];
        const h4xx = values.get("http4xx") ?? [];
        const lat = values.get("latency") ?? [];
        return timestamps
            .map((ts, i) => ({
                timestamp: ts,
                requestCount: Math.round(req[i] ?? 0),
                http5xxCount: Math.round(h5xx[i] ?? 0),
                http4xxCount: Math.round(h4xx[i] ?? 0),
                targetResponseTimeMs: Math.round((lat[i] ?? 0) * 1000 * 10) / 10,
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        console.warn(`[aws] Failed to fetch ALB metrics history:`, err);
        return [];
    }
}

export async function getNlbMetricsHistory(
    nlbArn: string,
): Promise<NlbMetricsDataPoint[]> {
    const lbDimension = nlbArn.split(":loadbalancer/")[1] ?? "";
    if (!lbDimension) return [];

    try {
        const dims = [{ Name: "LoadBalancer" as const, Value: lbDimension }];
        const ns = "AWS/NetworkELB";
        const { timestamps, values } = await queryMetrics(
            [
                { id: "activeFlows", namespace: ns, metricName: "ActiveFlowCount", dimensions: dims, stat: "Average" },
                { id: "newFlows", namespace: ns, metricName: "NewFlowCount", dimensions: dims, stat: "Sum" },
                { id: "bytes", namespace: ns, metricName: "ProcessedBytes", dimensions: dims, stat: "Sum" },
                { id: "clientResets", namespace: ns, metricName: "TCP_Client_Reset_Count", dimensions: dims, stat: "Sum" },
                { id: "targetResets", namespace: ns, metricName: "TCP_Target_Reset_Count", dimensions: dims, stat: "Sum" },
            ],
            300,
            ONE_DAY_MS,
        );
        const active = values.get("activeFlows") ?? [];
        const newF = values.get("newFlows") ?? [];
        const bytes = values.get("bytes") ?? [];
        const cr = values.get("clientResets") ?? [];
        const tr = values.get("targetResets") ?? [];
        return timestamps
            .map((ts, i) => ({
                timestamp: ts,
                activeFlowCount: Math.round(active[i] ?? 0),
                newFlowCount: Math.round(newF[i] ?? 0),
                processedBytes: Math.round(bytes[i] ?? 0),
                tcpClientResetCount: Math.round(cr[i] ?? 0),
                tcpTargetResetCount: Math.round(tr[i] ?? 0),
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        console.warn(`[aws] Failed to fetch NLB metrics history:`, err);
        return [];
    }
}
