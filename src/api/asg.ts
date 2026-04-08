import { DescribeCapacityProvidersCommand, DescribeClustersCommand } from "@aws-sdk/client-ecs";
import {
    DescribeAutoScalingGroupsCommand,
    SetDesiredCapacityCommand,
    UpdateAutoScalingGroupCommand,
} from "@aws-sdk/client-auto-scaling";
import { getEcsClient, getAsgClient } from "./clients";
import { log } from "@/lib/logger";

export interface AsgInfo {
    asgName: string;
    desiredCapacity: number;
    minSize: number;
    maxSize: number;
    currentInstances: number;
}

/**
 * Discover the Auto Scaling Group(s) backing the ECS cluster via its capacity providers.
 */
export async function getClusterAsgInfo(clusterName: string): Promise<AsgInfo | null> {
    log.ecs.debug(`Discovering ASG for cluster ${clusterName}`);

    // 1. Get the cluster's capacity providers
    const clusterRes = await getEcsClient().send(new DescribeClustersCommand({ clusters: [clusterName] }));
    const cpNames = clusterRes.clusters?.[0]?.capacityProviders ?? [];
    if (cpNames.length === 0) {
        log.ecs.debug(`No capacity providers found for cluster ${clusterName}`);
        return null;
    }

    // 2. Describe capacity providers to get the ASG ARN
    const cpRes = await getEcsClient().send(new DescribeCapacityProvidersCommand({ capacityProviders: cpNames }));
    const asgArn = cpRes.capacityProviders?.[0]?.autoScalingGroupProvider?.autoScalingGroupArn;
    if (!asgArn) {
        log.ecs.debug(`No ASG linked to capacity provider for cluster ${clusterName}`);
        return null;
    }

    // 3. Describe the ASG to get current capacity info
    const asgRes = await getAsgClient().send(
        new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [asgArn.split("/").pop()!] }),
    );
    const asg = asgRes.AutoScalingGroups?.[0];
    if (!asg) {
        log.ecs.warn(`ASG not found for ARN ${asgArn}`);
        return null;
    }

    return {
        asgName: asg.AutoScalingGroupName!,
        desiredCapacity: asg.DesiredCapacity ?? 0,
        minSize: asg.MinSize ?? 0,
        maxSize: asg.MaxSize ?? 0,
        currentInstances: asg.Instances?.length ?? 0,
    };
}

/**
 * Update the desired capacity of the ASG backing the ECS cluster.
 * If desiredCapacity exceeds maxSize, maxSize is automatically raised to match.
 */
export async function updateAsgDesiredCapacity(
    asgName: string,
    desiredCapacity: number,
    currentMaxSize: number,
): Promise<void> {
    log.ecs.info(`Scaling ASG ${asgName} to desired capacity ${desiredCapacity}`);

    if (desiredCapacity > currentMaxSize) {
        log.ecs.info(`Increasing ASG ${asgName} maxSize from ${currentMaxSize} to ${desiredCapacity}`);
        await getAsgClient().send(
            new UpdateAutoScalingGroupCommand({
                AutoScalingGroupName: asgName,
                MaxSize: desiredCapacity,
            }),
        );
    }

    await getAsgClient().send(
        new SetDesiredCapacityCommand({
            AutoScalingGroupName: asgName,
            DesiredCapacity: desiredCapacity,
            HonorCooldown: false,
        }),
    );
    log.ecs.info(`ASG ${asgName} scaled to ${desiredCapacity}`);
}
