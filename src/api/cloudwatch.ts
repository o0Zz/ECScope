import { GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { getCwClient } from "./clients";
import type { MetricsDataPoint, AlbMetricsDataPoint, NlbMetricsDataPoint, Ec2MetricsDataPoint } from "./types";

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

/**
 * Generic helper: runs a CloudWatch query, then maps each timestamp into one
 * output object using the caller-supplied `mapper`.
 */
async function fetchHistory<T extends { timestamp: number }>(
    queries: MetricQuery[],
    mapper: (ts: number, i: number, values: Map<string, number[]>) => T,
    label: string,
): Promise<T[]> {
    try {
        const { timestamps, values } = await queryMetrics(queries, 300, ONE_DAY_MS);
        return timestamps
            .map((ts, i) => mapper(ts, i, values))
            .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        console.warn(`[aws] Failed to fetch ${label} metrics history:`, err);
        return [];
    }
}

function round1(v: number): number {
    return Math.round(v * 10) / 10;
}

function val(values: Map<string, number[]>, id: string, i: number): number {
    return (values.get(id) ?? [])[i] ?? 0;
}

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
    const dims = ecsDimensions(clusterName, serviceName);
    return fetchHistory(
        [
            { id: "cpu", namespace: "AWS/ECS", metricName: "CPUUtilization", dimensions: dims, stat: "Average" },
            { id: "mem", namespace: "AWS/ECS", metricName: "MemoryUtilization", dimensions: dims, stat: "Average" },
        ],
        (ts, i, v) => ({
            timestamp: ts,
            cpuUtilization: round1(val(v, "cpu", i)),
            memoryUtilization: round1(val(v, "mem", i)),
        }),
        `service ${serviceName}`,
    );
}

export async function getAlbMetricsHistory(
    albArn: string,
): Promise<AlbMetricsDataPoint[]> {
    const albDimension = albArn.split(":loadbalancer/")[1] ?? "";
    if (!albDimension) return [];

    const dims = [{ Name: "LoadBalancer" as const, Value: albDimension }];
    const ns = "AWS/ApplicationELB";
    return fetchHistory(
        [
            { id: "requests", namespace: ns, metricName: "RequestCount", dimensions: dims, stat: "Sum" },
            { id: "http5xx", namespace: ns, metricName: "HTTPCode_ELB_5XX_Count", dimensions: dims, stat: "Sum" },
            { id: "http4xx", namespace: ns, metricName: "HTTPCode_ELB_4XX_Count", dimensions: dims, stat: "Sum" },
            { id: "latency", namespace: ns, metricName: "TargetResponseTime", dimensions: dims, stat: "Average" },
        ],
        (ts, i, v) => ({
            timestamp: ts,
            requestCount: Math.round(val(v, "requests", i)),
            http5xxCount: Math.round(val(v, "http5xx", i)),
            http4xxCount: Math.round(val(v, "http4xx", i)),
            targetResponseTimeMs: round1(val(v, "latency", i) * 1000),
        }),
        "ALB",
    );
}

export async function getNlbMetricsHistory(
    nlbArn: string,
): Promise<NlbMetricsDataPoint[]> {
    const lbDimension = nlbArn.split(":loadbalancer/")[1] ?? "";
    if (!lbDimension) return [];

    const dims = [{ Name: "LoadBalancer" as const, Value: lbDimension }];
    const ns = "AWS/NetworkELB";
    return fetchHistory(
        [
            { id: "activeFlows", namespace: ns, metricName: "ActiveFlowCount", dimensions: dims, stat: "Average" },
            { id: "newFlows", namespace: ns, metricName: "NewFlowCount", dimensions: dims, stat: "Sum" },
            { id: "bytes", namespace: ns, metricName: "ProcessedBytes", dimensions: dims, stat: "Sum" },
            { id: "clientResets", namespace: ns, metricName: "TCP_Client_Reset_Count", dimensions: dims, stat: "Sum" },
            { id: "targetResets", namespace: ns, metricName: "TCP_Target_Reset_Count", dimensions: dims, stat: "Sum" },
        ],
        (ts, i, v) => ({
            timestamp: ts,
            activeFlowCount: Math.round(val(v, "activeFlows", i)),
            newFlowCount: Math.round(val(v, "newFlows", i)),
            processedBytes: Math.round(val(v, "bytes", i)),
            tcpClientResetCount: Math.round(val(v, "clientResets", i)),
            tcpTargetResetCount: Math.round(val(v, "targetResets", i)),
        }),
        "NLB",
    );
}

export async function getEc2MetricsHistory(
    instanceId: string,
): Promise<Ec2MetricsDataPoint[]> {
    const dims = [{ Name: "InstanceId" as const, Value: instanceId }];
    const ns = "AWS/EC2";
    return fetchHistory(
        [
            { id: "cpu", namespace: ns, metricName: "CPUUtilization", dimensions: dims, stat: "Average" },
            { id: "netIn", namespace: ns, metricName: "NetworkIn", dimensions: dims, stat: "Sum" },
            { id: "netOut", namespace: ns, metricName: "NetworkOut", dimensions: dims, stat: "Sum" },
            { id: "diskRead", namespace: ns, metricName: "DiskReadBytes", dimensions: dims, stat: "Sum" },
            { id: "diskWrite", namespace: ns, metricName: "DiskWriteBytes", dimensions: dims, stat: "Sum" },
            { id: "statusCheck", namespace: ns, metricName: "StatusCheckFailed", dimensions: dims, stat: "Maximum" },
        ],
        (ts, i, v) => ({
            timestamp: ts,
            cpuUtilization: round1(val(v, "cpu", i)),
            networkInBytes: Math.round(val(v, "netIn", i)),
            networkOutBytes: Math.round(val(v, "netOut", i)),
            diskReadBytes: Math.round(val(v, "diskRead", i)),
            diskWriteBytes: Math.round(val(v, "diskWrite", i)),
            statusCheckFailed: Math.round(val(v, "statusCheck", i)),
        }),
        `EC2 ${instanceId}`,
    );
}
