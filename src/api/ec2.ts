import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { getEc2Client } from "./clients";
import type { VpcEc2Instance } from "./types";

/**
 * List EC2 instances, optionally filtered by VPC ID.
 */
export async function listEc2(
    filterVpcId?: string
): Promise<VpcEc2Instance[]> {
    console.log("[aws] listEc2 called", { filterVpcId });
    const filters = [
        { Name: "instance-state-name", Values: ["running", "stopped", "stopping", "pending"] },
    ];
    if (filterVpcId) {
        filters.push({ Name: "vpc-id", Values: [filterVpcId] });
    }

    const instances: VpcEc2Instance[] = [];
    let nextToken: string | undefined;

    do {
        const res = await getEc2Client().send(
            new DescribeInstancesCommand({ Filters: filters, NextToken: nextToken }),
        );

        for (const reservation of res.Reservations ?? []) {
            for (const inst of reservation.Instances ?? []) {
                const instanceId = inst.InstanceId ?? "";
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

    console.log("[aws] listEc2 result", { count: instances.length });
    return instances;
}
