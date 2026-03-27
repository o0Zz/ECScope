import {
    DescribeTargetGroupsCommand,
    DescribeTargetHealthCommand,
    DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { getElbv2Client } from "./clients";
import { queryMetrics } from "./cloudwatch";
import { getClusterVpcId } from "./ecs";
import type { AlbInfo, LoadBalancerType } from "./types";
import { log } from "@/lib/logger";

export async function listAlbs(clusterName: string): Promise<AlbInfo[]> {
    log.alb.debug(`Listing ALB/NLBs for cluster ${clusterName}`);

    // 1. Resolve the VPC for this cluster
    const vpcId = await getClusterVpcId(clusterName);
    if (!vpcId) {
        log.alb.warn(`Could not determine VPC for cluster ${clusterName}`);
        return [];
    }
    log.alb.debug(`Cluster ${clusterName} VPC resolved to ${vpcId}`);

    // 2. List ALL load balancers (paginated) and filter by VPC
    const allLbs: any[] = [];
    let marker: string | undefined;
    do {
        const lbRes = await getElbv2Client().send(
            new DescribeLoadBalancersCommand({ Marker: marker }),
        );
        allLbs.push(...(lbRes.LoadBalancers ?? []));
        marker = lbRes.NextMarker;
    } while (marker);

    const vpcLbs = allLbs.filter((lb) => lb.VpcId === vpcId);
    log.alb.debug(`Found ${vpcLbs.length}/${allLbs.length} LBs in VPC ${vpcId}`);
    if (vpcLbs.length === 0) return [];

    // 3. Get ALL target groups for these load balancers
    const lbArnSet = new Set(vpcLbs.map((lb) => lb.LoadBalancerArn as string));
    const allTargetGroups: any[] = [];
    let tgMarker: string | undefined;
    do {
        const tgRes = await getElbv2Client().send(
            new DescribeTargetGroupsCommand({ Marker: tgMarker }),
        );
        allTargetGroups.push(...(tgRes.TargetGroups ?? []));
        tgMarker = tgRes.NextMarker;
    } while (tgMarker);

    // Keep only target groups attached to our VPC load balancers
    const relevantTgs = allTargetGroups.filter((tg) =>
        (tg.LoadBalancerArns ?? []).some((arn: string) => lbArnSet.has(arn)),
    );
    log.alb.debug(`Found ${relevantTgs.length} target groups for VPC LBs`);

    // 4. Get target health for each target group in parallel
    const tgHealthMap = new Map<string, { healthyCount: number; unhealthyCount: number; targets: { targetId: string; port: number; health: string; reason: string; description: string }[] }>();
    await Promise.all(
        relevantTgs.map(async (tg) => {
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
                        reason: thd.TargetHealth?.Reason ?? "",
                        description: thd.TargetHealth?.Description ?? "",
                    };
                });
                tgHealthMap.set(tg.TargetGroupArn, { healthyCount, unhealthyCount, targets });
            } catch (e) {
                log.alb.warn(`Failed to get target health for ${tg.TargetGroupArn}`, e);
                tgHealthMap.set(tg.TargetGroupArn, { healthyCount: 0, unhealthyCount: 0, targets: [] });
            }
        }),
    );

    // 5. Build AlbInfo objects with CloudWatch metrics
    const FIVE_MIN_MS = 5 * 60 * 1000;

    return Promise.all(
        vpcLbs.map(async (lb) => {
            const lbArn = lb.LoadBalancerArn ?? "";
            const lbName = lb.LoadBalancerName ?? "";
            const lbType: LoadBalancerType = lb.Type === "network" ? "network" : "application";

            const lbTargetGroups = relevantTgs
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
                log.alb.warn(`Failed to get metrics for LB ${lbName}`, e);
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
