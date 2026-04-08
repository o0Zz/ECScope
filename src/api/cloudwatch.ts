import { GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { getCwClient } from "./clients";
import type {
    MetricsDataPoint,
    AlbMetricsDataPoint,
    NlbMetricsDataPoint,
    Ec2MetricsDataPoint,
    RdsMetricsDataPoint,
} from "./types";
import { log } from "@/lib/logger";
import {
    DEFAULT_METRICS_TIME_RANGE_KEY,
    getCloudWatchPeriodSeconds,
    getMetricsTimeRange,
    type MetricsTimeRangeOption,
} from "@/lib/metrics-time-range";

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

    // Build a unified sorted set of all timestamps across all metrics
    const tsSet = new Set<number>();
    for (const r of results) {
        for (const ts of r.Timestamps ?? []) {
            tsSet.add(new Date(ts).getTime());
        }
    }
    const timestamps = Array.from(tsSet).sort((a, b) => a - b);

    // Build a lookup from timestamp -> value for each metric, then align to unified timestamps
    const values = new Map<string, number[]>();
    for (const r of results) {
        const tsToVal = new Map<number, number>();
        const rawTs = r.Timestamps ?? [];
        const rawVals = r.Values ?? [];
        for (let i = 0; i < rawTs.length; i++) {
            tsToVal.set(new Date(rawTs[i]).getTime(), rawVals[i] ?? 0);
        }
        values.set(
            r.Id ?? "",
            timestamps.map((ts) => tsToVal.get(ts) ?? 0),
        );
    }

    return { timestamps, values };
}

// ─── History functions ───────────────────────────────────

/**
 * Generic helper: runs a CloudWatch query, then maps each timestamp into one
 * output object using the caller-supplied `mapper`.
 */
async function fetchHistory<T extends { timestamp: number }>(
    queries: MetricQuery[],
    mapper: (ts: number, i: number, values: Map<string, number[]>) => T,
    label: string,
    range: MetricsTimeRangeOption,
): Promise<T[]> {
    const periodSeconds = getCloudWatchPeriodSeconds(range);

    log.cloudwatch.debug(`Fetching ${label} metrics history`, {
        periodSeconds,
        range: range.key,
    });
    try {
        const { timestamps, values } = await queryMetrics(queries, periodSeconds, range.lookbackMs);
        return timestamps.map((ts, i) => mapper(ts, i, values)).sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        log.cloudwatch.warn(`Failed to fetch ${label} metrics history`, {
            err,
            periodSeconds,
            range: range.key,
        });
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
    range: MetricsTimeRangeOption = getMetricsTimeRange(DEFAULT_METRICS_TIME_RANGE_KEY),
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
        range,
    );
}

export async function getAlbMetricsHistory(
    albArn: string,
    range: MetricsTimeRangeOption = getMetricsTimeRange(DEFAULT_METRICS_TIME_RANGE_KEY),
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
        range,
    );
}

export async function getNlbMetricsHistory(
    nlbArn: string,
    range: MetricsTimeRangeOption = getMetricsTimeRange(DEFAULT_METRICS_TIME_RANGE_KEY),
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
        range,
    );
}

export async function getEc2MetricsHistory(
    instanceId: string,
    range: MetricsTimeRangeOption = getMetricsTimeRange(DEFAULT_METRICS_TIME_RANGE_KEY),
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
        range,
    );
}

export async function getRdsMetricsHistory(
    dbInstanceIdentifier: string,
    range: MetricsTimeRangeOption = getMetricsTimeRange(DEFAULT_METRICS_TIME_RANGE_KEY),
): Promise<RdsMetricsDataPoint[]> {
    const dims = [{ Name: "DBInstanceIdentifier" as const, Value: dbInstanceIdentifier }];
    const ns = "AWS/RDS";
    return fetchHistory(
        [
            { id: "cpu", namespace: ns, metricName: "CPUUtilization", dimensions: dims, stat: "Average" },
            { id: "freeMem", namespace: ns, metricName: "FreeableMemory", dimensions: dims, stat: "Average" },
            { id: "connections", namespace: ns, metricName: "DatabaseConnections", dimensions: dims, stat: "Average" },
            { id: "readIops", namespace: ns, metricName: "ReadIOPS", dimensions: dims, stat: "Average" },
            { id: "writeIops", namespace: ns, metricName: "WriteIOPS", dimensions: dims, stat: "Average" },
            { id: "readLatency", namespace: ns, metricName: "ReadLatency", dimensions: dims, stat: "Average" },
            { id: "writeLatency", namespace: ns, metricName: "WriteLatency", dimensions: dims, stat: "Average" },
            { id: "freeStorage", namespace: ns, metricName: "FreeStorageSpace", dimensions: dims, stat: "Average" },
        ],
        (ts, i, v) => ({
            timestamp: ts,
            cpuUtilization: round1(val(v, "cpu", i)),
            freeableMemoryBytes: Math.round(val(v, "freeMem", i)),
            databaseConnections: Math.round(val(v, "connections", i)),
            readIOPS: round1(val(v, "readIops", i)),
            writeIOPS: round1(val(v, "writeIops", i)),
            readLatencyMs: round1(val(v, "readLatency", i) * 1000),
            writeLatencyMs: round1(val(v, "writeLatency", i) * 1000),
            freeStorageSpaceBytes: Math.round(val(v, "freeStorage", i)),
        }),
        `RDS ${dbInstanceIdentifier}`,
        range,
    );
}
