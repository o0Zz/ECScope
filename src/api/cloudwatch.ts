import { GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { getCwClient } from "./clients";
import type { MetricsDataPoint, AlbMetricsDataPoint, NlbMetricsDataPoint } from "./types";

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

export async function getNlbMetricsHistory(
    nlbArn: string,
): Promise<NlbMetricsDataPoint[]> {
    const lbDimension = nlbArn.split(":loadbalancer/")[1] ?? "";
    if (!lbDimension) return [];

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
        const res = await getCwClient().send(
            new GetMetricDataCommand({
                StartTime: oneDayAgo,
                EndTime: now,
                MetricDataQueries: [
                    {
                        Id: "activeFlows",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/NetworkELB",
                                MetricName: "ActiveFlowCount",
                                Dimensions: [{ Name: "LoadBalancer", Value: lbDimension }],
                            },
                            Period: 300,
                            Stat: "Average",
                        },
                    },
                    {
                        Id: "newFlows",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/NetworkELB",
                                MetricName: "NewFlowCount",
                                Dimensions: [{ Name: "LoadBalancer", Value: lbDimension }],
                            },
                            Period: 300,
                            Stat: "Sum",
                        },
                    },
                    {
                        Id: "bytes",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/NetworkELB",
                                MetricName: "ProcessedBytes",
                                Dimensions: [{ Name: "LoadBalancer", Value: lbDimension }],
                            },
                            Period: 300,
                            Stat: "Sum",
                        },
                    },
                    {
                        Id: "clientResets",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/NetworkELB",
                                MetricName: "TCP_Client_Reset_Count",
                                Dimensions: [{ Name: "LoadBalancer", Value: lbDimension }],
                            },
                            Period: 300,
                            Stat: "Sum",
                        },
                    },
                    {
                        Id: "targetResets",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/NetworkELB",
                                MetricName: "TCP_Target_Reset_Count",
                                Dimensions: [{ Name: "LoadBalancer", Value: lbDimension }],
                            },
                            Period: 300,
                            Stat: "Sum",
                        },
                    },
                ],
            }),
        );

        const activeResult = res.MetricDataResults?.find((r) => r.Id === "activeFlows");
        const newResult = res.MetricDataResults?.find((r) => r.Id === "newFlows");
        const bytesResult = res.MetricDataResults?.find((r) => r.Id === "bytes");
        const clientResetResult = res.MetricDataResults?.find((r) => r.Id === "clientResets");
        const targetResetResult = res.MetricDataResults?.find((r) => r.Id === "targetResets");

        const timestamps = activeResult?.Timestamps ?? [];
        const activeValues = activeResult?.Values ?? [];
        const newValues = newResult?.Values ?? [];
        const bytesValues = bytesResult?.Values ?? [];
        const clientResetValues = clientResetResult?.Values ?? [];
        const targetResetValues = targetResetResult?.Values ?? [];

        return timestamps
            .map((ts, i) => ({
                timestamp: new Date(ts).getTime(),
                activeFlowCount: Math.round(activeValues[i] ?? 0),
                newFlowCount: Math.round(newValues[i] ?? 0),
                processedBytes: Math.round(bytesValues[i] ?? 0),
                tcpClientResetCount: Math.round(clientResetValues[i] ?? 0),
                tcpTargetResetCount: Math.round(targetResetValues[i] ?? 0),
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        console.warn(`[aws] Failed to fetch NLB metrics history:`, err);
        return [];
    }
}
