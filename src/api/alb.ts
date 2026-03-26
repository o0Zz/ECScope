import {
    DescribeTargetGroupsCommand,
    DescribeTargetHealthCommand,
    DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { getElbv2Client, getCwClient } from "./clients";
import { listAllServiceArns, describeServicesBatched } from "./ecs";
import type { AlbInfo, LoadBalancerType } from "./types";

export async function listAlbs(clusterName: string): Promise<AlbInfo[]> {
    console.log("[aws] listAlbs called", { clusterName });

    // 1. Get all services to collect target group ARNs
    const arns = await listAllServiceArns(clusterName);
    if (arns.length === 0) return [];

    const rawServices = await describeServicesBatched(clusterName, arns);

    // Collect unique target group ARNs from service load balancer configs
    const tgArnSet = new Set<string>();
    for (const svc of rawServices) {
        for (const lb of (svc as any).loadBalancers ?? []) {
            if (lb.targetGroupArn) tgArnSet.add(lb.targetGroupArn);
        }
    }

    const tgArns = [...tgArnSet];
    console.log("[aws] listAlbs found target group ARNs:", tgArns);
    if (tgArns.length === 0) return [];

    // 2. Describe target groups (batches of 20)
    const allTargetGroups: any[] = [];
    for (let i = 0; i < tgArns.length; i += 20) {
        const batch = tgArns.slice(i, i + 20);
        const tgRes = await getElbv2Client().send(
            new DescribeTargetGroupsCommand({ TargetGroupArns: batch }),
        );
        allTargetGroups.push(...(tgRes.TargetGroups ?? []));
    }

    // 3. Collect unique load balancer ARNs from target groups
    const lbArnSet = new Set<string>();
    for (const tg of allTargetGroups) {
        for (const lbArn of tg.LoadBalancerArns ?? []) {
            lbArnSet.add(lbArn);
        }
    }

    const lbArns = [...lbArnSet];
    console.log("[aws] listAlbs found LB ARNs:", lbArns);
    if (lbArns.length === 0) return [];

    // 4. Describe load balancers (batches of 20)
    const allLbs: any[] = [];
    for (let i = 0; i < lbArns.length; i += 20) {
        const batch = lbArns.slice(i, i + 20);
        const lbRes = await getElbv2Client().send(
            new DescribeLoadBalancersCommand({ LoadBalancerArns: batch }),
        );
        allLbs.push(...(lbRes.LoadBalancers ?? []));
    }

    // 5. Get target health for each target group in parallel
    const tgHealthMap = new Map<string, { healthyCount: number; unhealthyCount: number; targets: { targetId: string; port: number; health: string; description: string }[] }>();
    await Promise.all(
        allTargetGroups.map(async (tg) => {
            try {
                const healthRes = await getElbv2Client().send(
                    new DescribeTargetHealthCommand({ TargetGroupArn: tg.TargetGroupArn }),
                );
                let healthyCount = 0;
                let unhealthyCount = 0;
                const targets = (healthRes.TargetHealthDescriptions ?? []).map((thd) => {
                    const state = thd.TargetHealth?.State ?? "unknown";
                    if (state === "healthy") healthyCount++;
                    else unhealthyCount++;
                    return {
                        targetId: thd.Target?.Id ?? "",
                        port: thd.Target?.Port ?? 0,
                        health: state,
                        description: thd.TargetHealth?.Description ?? "",
                    };
                });
                tgHealthMap.set(tg.TargetGroupArn, { healthyCount, unhealthyCount, targets });
            } catch (e) {
                console.warn("[aws] Failed to get target health for", tg.TargetGroupArn, e);
                tgHealthMap.set(tg.TargetGroupArn, { healthyCount: 0, unhealthyCount: 0, targets: [] });
            }
        }),
    );

    // 6. Build AlbInfo objects with CloudWatch metrics
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    return Promise.all(
        allLbs.map(async (lb) => {
            const lbArn = lb.LoadBalancerArn ?? "";
            const lbName = lb.LoadBalancerName ?? "";
            const lbType: LoadBalancerType = lb.Type === "network" ? "network" : "application";

            const lbTargetGroups = allTargetGroups
                .filter((tg) => (tg.LoadBalancerArns ?? []).includes(lbArn))
                .map((tg) => {
                    const health = tgHealthMap.get(tg.TargetGroupArn) ?? { healthyCount: 0, unhealthyCount: 0, targets: [] };
                    return {
                        targetGroupArn: tg.TargetGroupArn ?? "",
                        targetGroupName: tg.TargetGroupName ?? "",
                        port: tg.Port ?? 0,
                        protocol: tg.Protocol ?? "",
                        healthCheckPath: tg.HealthCheckPath ?? "/",
                        healthyCount: health.healthyCount,
                        unhealthyCount: health.unhealthyCount,
                        targets: health.targets,
                    };
                });

            let requestCount = 0;
            let avgLatencyMs = 0;
            let activeFlowCount: number | undefined;
            let newFlowCount: number | undefined;
            let processedBytes: number | undefined;

            try {
                const lbDimension = lbArn.split(":loadbalancer/")[1] ?? "";

                if (lbType === "application") {
                    const metricsRes = await getCwClient().send(
                        new GetMetricDataCommand({
                            StartTime: fiveMinAgo,
                            EndTime: now,
                            MetricDataQueries: [
                                {
                                    Id: "requests",
                                    MetricStat: {
                                        Metric: {
                                            Namespace: "AWS/ApplicationELB",
                                            MetricName: "RequestCount",
                                            Dimensions: [{ Name: "LoadBalancer", Value: lbDimension }],
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
                                            Dimensions: [{ Name: "LoadBalancer", Value: lbDimension }],
                                        },
                                        Period: 300,
                                        Stat: "Average",
                                    },
                                },
                            ],
                        }),
                    );
                    const reqValues = metricsRes.MetricDataResults?.find((r) => r.Id === "requests")?.Values ?? [];
                    const latValues = metricsRes.MetricDataResults?.find((r) => r.Id === "latency")?.Values ?? [];
                    requestCount = reqValues.length > 0 ? Math.round(reqValues[0]) : 0;
                    avgLatencyMs = latValues.length > 0 ? Math.round(latValues[0] * 1000) : 0;
                } else {
                    // NLB metrics
                    const metricsRes = await getCwClient().send(
                        new GetMetricDataCommand({
                            StartTime: fiveMinAgo,
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
                            ],
                        }),
                    );
                    const activeValues = metricsRes.MetricDataResults?.find((r) => r.Id === "activeFlows")?.Values ?? [];
                    const newValues = metricsRes.MetricDataResults?.find((r) => r.Id === "newFlows")?.Values ?? [];
                    const bytesValues = metricsRes.MetricDataResults?.find((r) => r.Id === "bytes")?.Values ?? [];
                    activeFlowCount = activeValues.length > 0 ? Math.round(activeValues[0]) : 0;
                    newFlowCount = newValues.length > 0 ? Math.round(newValues[0]) : 0;
                    processedBytes = bytesValues.length > 0 ? Math.round(bytesValues[0]) : 0;
                }
            } catch (e) {
                console.warn("[aws] Failed to get LB metrics for", lbName, e);
            }

            return {
                albArn: lbArn,
                albName: lbName,
                dnsName: lb.DNSName ?? "",
                scheme: lb.Scheme ?? "unknown",
                status: lb.State?.Code ?? "unknown",
                lbType,
                targetGroups: lbTargetGroups,
                requestCount,
                avgLatencyMs,
                activeFlowCount,
                newFlowCount,
                processedBytes,
            };
        }),
    );
}
