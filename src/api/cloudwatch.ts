import { GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { getCwClient } from "./clients";
import type { MetricsDataPoint, AlbMetricsDataPoint } from "./types";

export async function getServiceMetricsHistory(
    clusterName: string,
    serviceName: string,
): Promise<MetricsDataPoint[]> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
        const res = await getCwClient().send(
            new GetMetricDataCommand({
                StartTime: oneDayAgo,
                EndTime: now,
                MetricDataQueries: [
                    {
                        Id: "cpu",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ECS",
                                MetricName: "CPUUtilization",
                                Dimensions: [
                                    { Name: "ClusterName", Value: clusterName },
                                    { Name: "ServiceName", Value: serviceName },
                                ],
                            },
                            Period: 300,
                            Stat: "Average",
                        },
                    },
                    {
                        Id: "mem",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ECS",
                                MetricName: "MemoryUtilization",
                                Dimensions: [
                                    { Name: "ClusterName", Value: clusterName },
                                    { Name: "ServiceName", Value: serviceName },
                                ],
                            },
                            Period: 300,
                            Stat: "Average",
                        },
                    },
                ],
            }),
        );

        const cpuResult = res.MetricDataResults?.find((r) => r.Id === "cpu");
        const memResult = res.MetricDataResults?.find((r) => r.Id === "mem");
        const timestamps = cpuResult?.Timestamps ?? [];
        const cpuValues = cpuResult?.Values ?? [];
        const memValues = memResult?.Values ?? [];

        return timestamps
            .map((ts, i) => ({
                timestamp: new Date(ts).getTime(),
                cpuUtilization: Math.round((cpuValues[i] ?? 0) * 10) / 10,
                memoryUtilization: Math.round((memValues[i] ?? 0) * 10) / 10,
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

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
        const res = await getCwClient().send(
            new GetMetricDataCommand({
                StartTime: oneDayAgo,
                EndTime: now,
                MetricDataQueries: [
                    {
                        Id: "requests",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ApplicationELB",
                                MetricName: "RequestCount",
                                Dimensions: [{ Name: "LoadBalancer", Value: albDimension }],
                            },
                            Period: 300,
                            Stat: "Sum",
                        },
                    },
                    {
                        Id: "http5xx",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ApplicationELB",
                                MetricName: "HTTPCode_ELB_5XX_Count",
                                Dimensions: [{ Name: "LoadBalancer", Value: albDimension }],
                            },
                            Period: 300,
                            Stat: "Sum",
                        },
                    },
                    {
                        Id: "http4xx",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ApplicationELB",
                                MetricName: "HTTPCode_ELB_4XX_Count",
                                Dimensions: [{ Name: "LoadBalancer", Value: albDimension }],
                            },
                            Period: 300,
                            Stat: "Sum",
                        },
                    },
                    {
                        Id: "latency",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ApplicationELB",
                                MetricName: "TargetResponseTime",
                                Dimensions: [{ Name: "LoadBalancer", Value: albDimension }],
                            },
                            Period: 300,
                            Stat: "Average",
                        },
                    },
                ],
            }),
        );

        const reqResult = res.MetricDataResults?.find((r) => r.Id === "requests");
        const h5xxResult = res.MetricDataResults?.find((r) => r.Id === "http5xx");
        const h4xxResult = res.MetricDataResults?.find((r) => r.Id === "http4xx");
        const latResult = res.MetricDataResults?.find((r) => r.Id === "latency");

        const timestamps = reqResult?.Timestamps ?? [];
        const reqValues = reqResult?.Values ?? [];
        const h5xxValues = h5xxResult?.Values ?? [];
        const h4xxValues = h4xxResult?.Values ?? [];
        const latValues = latResult?.Values ?? [];

        return timestamps
            .map((ts, i) => ({
                timestamp: new Date(ts).getTime(),
                requestCount: Math.round(reqValues[i] ?? 0),
                http5xxCount: Math.round(h5xxValues[i] ?? 0),
                http4xxCount: Math.round(h4xxValues[i] ?? 0),
                targetResponseTimeMs: Math.round((latValues[i] ?? 0) * 1000 * 10) / 10,
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        console.warn(`[aws] Failed to fetch ALB metrics history:`, err);
        return [];
    }
}
