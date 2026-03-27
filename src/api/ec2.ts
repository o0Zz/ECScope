import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { getEc2Client } from "./clients";
import { execSsmCommand } from "./ssm";
import type { VpcEc2Instance, S3Credentials } from "./types";

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

/** Run an SSM command on an EC2 instance to copy a remote file to S3. Returns the S3 key. */
export async function copyFileFromEc2ToS3(params: {
    instanceId: string;
    credentials: S3Credentials;
    s3Bucket: string;
    remoteFileGlob: string;
}): Promise<string> {
    const filename = params.remoteFileGlob.split("/").pop()?.replace(/\*/g, "") ?? "file";
    const s3Key = `ecscope/${params.instanceId}/${filename}${Date.now()}`;

    const commands = [
        `set -e`,
        `export AWS_ACCESS_KEY_ID="${params.credentials.accessKeyId}"`,
        `export AWS_SECRET_ACCESS_KEY="${params.credentials.secretAccessKey}"`,
        `export AWS_DEFAULT_REGION="${params.credentials.region}"`,
        `FILE_PATH=$(ls ${params.remoteFileGlob} | head -1)`,
        `aws s3 cp "$FILE_PATH" "s3://${params.s3Bucket}/${s3Key}"`,
        `rm -f ${params.remoteFileGlob}`,
        `echo "S3_KEY=${s3Key}"`,
    ];

    const stdout = await execSsmCommand(params.instanceId, commands);

    const match = stdout.match(/S3_KEY=(\S+)/);
    if (!match) {
        throw new Error(`SSM command did not output an S3 key. Output: ${stdout.slice(0, 500)}`);
    }
    return match[1];
}

/** Run an SSM command on an EC2 instance to pull a file from S3 to a remote path. */
export async function copyFileFromS3ToEc2(params: {
    instanceId: string;
    credentials: S3Credentials;
    s3Bucket: string;
    s3Key: string;
    remotePath: string;
}): Promise<void> {
    const commands = [
        `set -e`,
        `export AWS_ACCESS_KEY_ID="${params.credentials.accessKeyId}"`,
        `export AWS_SECRET_ACCESS_KEY="${params.credentials.secretAccessKey}"`,
        `export AWS_DEFAULT_REGION="${params.credentials.region}"`,
        `aws s3 cp "s3://${params.s3Bucket}/${params.s3Key}" "${params.remotePath}"`,
        `aws s3 rm "s3://${params.s3Bucket}/${params.s3Key}"`,
        `echo "UPLOADED=${params.remotePath}"`,
    ];

    console.log(`[ec2] SSM: pulling s3://${params.s3Bucket}/${params.s3Key} to ${params.remotePath} on ${params.instanceId} ...`);
    const stdout = await execSsmCommand(params.instanceId, commands);

    if (!stdout.includes("UPLOADED=")) {
        throw new Error(`Upload command did not confirm completion. Output: ${stdout.slice(0, 500)}`);
    }
}
