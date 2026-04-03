import {
    ListContainerInstancesCommand,
    DescribeContainerInstancesCommand,
    DescribeServicesCommand,
} from "@aws-sdk/client-ecs";
import { DescribeInstancesCommand, DescribeSubnetsCommand } from "@aws-sdk/client-ec2";
import { getEcsClient, getEc2Client } from "./clients";
import { paginateAll } from "./pagination";
import { listAllServiceArns } from "./ecs-services";
import type { ContainerInstance } from "./types";
import { log } from "@/lib/logger";

export async function listContainerInstances(clusterName: string): Promise<ContainerInstance[]> {
    log.ecs.debug(`Listing container instances for cluster ${clusterName}`);

    const ciArns = await paginateAll(
        (nextToken) => getEcsClient().send(new ListContainerInstancesCommand({ cluster: clusterName, nextToken })),
        (res) => res.containerInstanceArns,
        (res) => res.nextToken,
    );

    if (ciArns.length === 0) return [];

    // DescribeContainerInstances supports up to 100 per call
    const allInstances: ContainerInstance[] = [];
    for (let i = 0; i < ciArns.length; i += 100) {
        const batch = ciArns.slice(i, i + 100);
        const descRes = await getEcsClient().send(
            new DescribeContainerInstancesCommand({
                cluster: clusterName,
                containerInstances: batch,
            }),
        );

        for (const ci of descRes.containerInstances ?? []) {
            const cpuReg = ci.registeredResources?.find((r) => r.name === "CPU");
            const memReg = ci.registeredResources?.find((r) => r.name === "MEMORY");
            const cpuRem = ci.remainingResources?.find((r) => r.name === "CPU");
            const memRem = ci.remainingResources?.find((r) => r.name === "MEMORY");

            allInstances.push({
                containerInstanceArn: ci.containerInstanceArn ?? "",
                ec2InstanceId: ci.ec2InstanceId ?? "",
                instanceType: ci.attributes?.find((a) => a.name === "ecs.instance-type")?.value ?? "unknown",
                status: ci.status ?? "UNKNOWN",
                runningTasksCount: ci.runningTasksCount ?? 0,
                pendingTasksCount: ci.pendingTasksCount ?? 0,
                cpuRegistered: cpuReg?.integerValue ?? 0,
                cpuAvailable: cpuRem?.integerValue ?? 0,
                memoryRegistered: memReg?.integerValue ?? 0,
                memoryAvailable: memRem?.integerValue ?? 0,
                agentVersion: ci.versionInfo?.agentVersion ?? "",
                launchType: "EC2" as const,
                registeredAt: ci.registeredAt ? new Date(ci.registeredAt).getTime() : undefined,
            });
        }
    }

    return allInstances;
}

/**
 * Discover the VPC of an ECS cluster by inspecting its container instances' EC2 data,
 * or by inspecting the service network configuration subnets.
 */
export async function getClusterVpcId(clusterName: string): Promise<string | null> {
    log.ecs.debug(`Resolving VPC for cluster ${clusterName}`);
    // Try to get VPC from container instances first (EC2 launch type)
    const listRes = await getEcsClient().send(new ListContainerInstancesCommand({ cluster: clusterName }));
    const ciArns = listRes.containerInstanceArns ?? [];

    if (ciArns.length > 0) {
        const descRes = await getEcsClient().send(
            new DescribeContainerInstancesCommand({
                cluster: clusterName,
                containerInstances: ciArns.slice(0, 1),
            }),
        );
        const ec2Id = descRes.containerInstances?.[0]?.ec2InstanceId;
        if (ec2Id) {
            const ec2Res = await getEc2Client().send(new DescribeInstancesCommand({ InstanceIds: [ec2Id] }));
            const vpcId = ec2Res.Reservations?.[0]?.Instances?.[0]?.VpcId;
            if (vpcId) return vpcId;
        }
    }

    // Fallback: look at the first service's awsvpc config subnet to derive VPC
    const arns = await listAllServiceArns(clusterName);
    if (arns.length > 0) {
        const svcRes = await getEcsClient().send(
            new DescribeServicesCommand({ cluster: clusterName, services: [arns[0]] }),
        );
        const subnets = svcRes.services?.[0]?.networkConfiguration?.awsvpcConfiguration?.subnets;
        if (subnets?.length) {
            const subnetRes = await getEc2Client().send(new DescribeSubnetsCommand({ SubnetIds: [subnets[0]] }));
            const vpcId = subnetRes.Subnets?.[0]?.VpcId;
            if (vpcId) return vpcId;
        }
    }

    log.ecs.warn(`Could not determine VPC for cluster ${clusterName}`);
    return null;
}
