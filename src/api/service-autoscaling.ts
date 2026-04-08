import {
    DescribeScalableTargetsCommand,
    RegisterScalableTargetCommand,
} from "@aws-sdk/client-application-auto-scaling";
import { getAppAsClient } from "./clients";
import { log } from "@/lib/logger";

export interface ServiceScalingTarget {
    serviceName: string;
    minCapacity: number;
    maxCapacity: number;
}

/**
 * Get the Application Auto Scaling targets for ECS services in a cluster.
 * Returns a map of serviceName → { minCapacity, maxCapacity }.
 */
export async function getServiceScalingTargets(clusterName: string): Promise<Map<string, ServiceScalingTarget>> {
    log.ecs.debug(`Fetching scaling targets for cluster ${clusterName}`);

    const result = new Map<string, ServiceScalingTarget>();

    try {
        const res = await getAppAsClient().send(
            new DescribeScalableTargetsCommand({
                ServiceNamespace: "ecs",
                ResourceIds: undefined, // fetch all for cluster — we filter below
            }),
        );

        for (const target of res.ScalableTargets ?? []) {
            // ResourceId format: "service/<clusterName>/<serviceName>"
            const resourceId = target.ResourceId ?? "";
            const parts = resourceId.split("/");
            if (parts.length === 3 && parts[1] === clusterName) {
                const serviceName = parts[2];
                result.set(serviceName, {
                    serviceName,
                    minCapacity: target.MinCapacity ?? 0,
                    maxCapacity: target.MaxCapacity ?? 0,
                });
            }
        }
    } catch (err) {
        log.ecs.warn(`Failed to fetch scaling targets for cluster ${clusterName}`, err);
    }

    return result;
}

/**
 * Register or update the scaling target (min/max) for an ECS service.
 */
export async function updateServiceScalingTarget(
    clusterName: string,
    serviceName: string,
    minCapacity: number,
    maxCapacity: number,
): Promise<void> {
    log.ecs.info(`Updating scaling target for ${clusterName}/${serviceName}: min=${minCapacity}, max=${maxCapacity}`);

    await getAppAsClient().send(
        new RegisterScalableTargetCommand({
            ServiceNamespace: "ecs",
            ResourceId: `service/${clusterName}/${serviceName}`,
            ScalableDimension: "ecs:service:DesiredCount",
            MinCapacity: minCapacity,
            MaxCapacity: maxCapacity,
        }),
    );

    log.ecs.info(`Scaling target updated for ${clusterName}/${serviceName}`);
}
