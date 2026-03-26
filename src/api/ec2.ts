import { DescribeInstancesCommand, DescribeSubnetsCommand } from "@aws-sdk/client-ec2";
import { ListContainerInstancesCommand, DescribeContainerInstancesCommand } from "@aws-sdk/client-ecs";
import { getEc2Client, getEcsClient } from "./clients";
import type { VpcEc2Instance } from "./types";

/**
 * Discover the VPC of an ECS cluster by inspecting its container instances' subnets,
 * or by inspecting the service network configuration subnets.
 */
async function getClusterVpcId(clusterName: string): Promise<string | null> {
    // Try to get VPC from container instances first (EC2 launch type)
    const listRes = await getEcsClient().send(
        new ListContainerInstancesCommand({ cluster: clusterName }),
    );
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
            const ec2Res = await getEc2Client().send(
                new DescribeInstancesCommand({ InstanceIds: [ec2Id] }),
            );
            const vpcId = ec2Res.Reservations?.[0]?.Instances?.[0]?.VpcId;
            if (vpcId) return vpcId;
        }
    }

    // Fallback: look at the first service's awsvpc config subnet to derive VPC
    // Import dynamically to avoid circular deps
    const { listAllServiceArns } = await import("./ecs");
    const arns = await listAllServiceArns(clusterName);
    if (arns.length > 0) {
        const { DescribeServicesCommand } = await import("@aws-sdk/client-ecs");
        const svcRes = await getEcsClient().send(
            new DescribeServicesCommand({ cluster: clusterName, services: [arns[0]] }),
        );
        const subnets = svcRes.services?.[0]?.networkConfiguration?.awsvpcConfiguration?.subnets;
        if (subnets?.length) {
            const subnetRes = await getEc2Client().send(
                new DescribeSubnetsCommand({ SubnetIds: [subnets[0]] }),
            );
            const vpcId = subnetRes.Subnets?.[0]?.VpcId;
            if (vpcId) return vpcId;
        }
    }

    return null;
}

/**
 * List all EC2 instances in the same VPC as the cluster, excluding ECS container instances (nodes).
 */
export async function listVpcInstances(clusterName: string): Promise<VpcEc2Instance[]> {
    // 1. Find the cluster VPC
    const vpcId = await getClusterVpcId(clusterName);
    if (!vpcId) return [];

    // 2. Get ECS node instance IDs to exclude
    const listRes = await getEcsClient().send(
        new ListContainerInstancesCommand({ cluster: clusterName }),
    );
    const ciArns = listRes.containerInstanceArns ?? [];
    const nodeInstanceIds = new Set<string>();

    if (ciArns.length > 0) {
        const descRes = await getEcsClient().send(
            new DescribeContainerInstancesCommand({
                cluster: clusterName,
                containerInstances: ciArns,
            }),
        );
        for (const ci of descRes.containerInstances ?? []) {
            if (ci.ec2InstanceId) nodeInstanceIds.add(ci.ec2InstanceId);
        }
    }

    // 3. Describe all running/stopped instances in the VPC
    const instances: VpcEc2Instance[] = [];
    let nextToken: string | undefined;

    do {
        const res = await getEc2Client().send(
            new DescribeInstancesCommand({
                Filters: [
                    { Name: "vpc-id", Values: [vpcId] },
                    { Name: "instance-state-name", Values: ["running", "stopped", "stopping", "pending"] },
                ],
                NextToken: nextToken,
            }),
        );

        for (const reservation of res.Reservations ?? []) {
            for (const inst of reservation.Instances ?? []) {
                const instanceId = inst.InstanceId ?? "";
                // Skip ECS nodes
                if (nodeInstanceIds.has(instanceId)) continue;

                const name = (inst.Tags ?? []).find(t => t.Key === "Name")?.Value ?? "";

                instances.push({
                    instanceId,
                    instanceType: inst.InstanceType ?? "",
                    state: inst.State?.Name ?? "unknown",
                    privateIp: inst.PrivateIpAddress ?? "",
                    publicIp: inst.PublicIpAddress ?? "",
                    subnetId: inst.SubnetId ?? "",
                    vpcId: inst.VpcId ?? "",
                    name,
                    launchTime: inst.LaunchTime?.toISOString?.() ?? "",
                    platform: inst.PlatformDetails ?? inst.Platform ?? "Linux/UNIX",
                });
            }
        }

        nextToken = res.NextToken;
    } while (nextToken);

    return instances;
}
