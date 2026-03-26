import {
    DescribeTargetGroupsCommand,
    DescribeTargetHealthCommand,
    DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { getElbv2Client } from "./clients";
import { queryMetrics } from "./cloudwatch";
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
    const FIVE_MIN_MS = 5 * 60 * 1000;

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
                const dims = [{ Name: "LoadBalancer" as const, Value: lbDimension }];

                if (lbType === "application") {
                    const { values } = await queryMetrics(
                        [
                            { id: "requests", namespace: "AWS/ApplicationELB", metricName: "RequestCount", dimensions: dims, stat: "Sum" },
                            { id: "latency", namespace: "AWS/ApplicationELB", metricName: "TargetResponseTime", dimensions: dims, stat: "Average" },
                        ],
                        300,
                        FIVE_MIN_MS,
                    );
                    const reqVals = values.get("requests") ?? [];
                    const latVals = values.get("latency") ?? [];
                    requestCount = reqVals.length > 0 ? Math.round(reqVals[0]) : 0;
                    avgLatencyMs = latVals.length > 0 ? Math.round(latVals[0] * 1000) : 0;
                } else {
                    const { values } = await queryMetrics(
                        [
                            { id: "activeFlows", namespace: "AWS/NetworkELB", metricName: "ActiveFlowCount", dimensions: dims, stat: "Average" },
                            { id: "newFlows", namespace: "AWS/NetworkELB", metricName: "NewFlowCount", dimensions: dims, stat: "Sum" },
                            { id: "bytes", namespace: "AWS/NetworkELB", metricName: "ProcessedBytes", dimensions: dims, stat: "Sum" },
                        ],
                        300,
                        FIVE_MIN_MS,
                    );
                    const activeVals = values.get("activeFlows") ?? [];
                    const newVals = values.get("newFlows") ?? [];
                    const bytesVals = values.get("bytes") ?? [];
                    activeFlowCount = activeVals.length > 0 ? Math.round(activeVals[0]) : 0;
                    newFlowCount = newVals.length > 0 ? Math.round(newVals[0]) : 0;
                    processedBytes = bytesVals.length > 0 ? Math.round(bytesVals[0]) : 0;
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
