import { startTcpdump } from "./tcpdump";
import { startCoredump } from "./coredump";
import { sendSsmCommand, waitForSsmCommand } from "../ssm";
import { downloadFile } from "./download";
import type { S3Credentials, TcpdumpParams, CoredumpParams, SSMCommandResult } from "../types";

export { startTcpdump } from "./tcpdump";
export { startCoredump } from "./coredump";
export { sendSsmCommand, waitForSsmCommand } from "../ssm";
export { downloadFile, uploadFile } from "./download";


/** Upload a file from an EC2 instance to S3 via SSM. Returns the S3 key. */
export async function uploadEc2ToS3(params: {
    instanceId: string;
    credentials: S3Credentials;
    s3Bucket: string;
    remoteFileGlob: string;
}): Promise<{ s3Key: string }> {
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

    const commandId = await sendSsmCommand(params.instanceId, commands, 120);
    const stdout = await waitForSsmCommand(commandId, params.instanceId);

    const match = stdout.match(/S3_KEY=(\S+)/);
    if (!match) {
        throw new Error(`Diagnostic command did not output an S3 key. Output: ${stdout.slice(0, 500)}`);
    }
    return {
        s3Key: match[1]
    };
}

/** Run tcpdump end-to-end: start → wait for SSM → upload from EC2 to S3 → download. */
export async function runTcpdumpAndDownload(
    params: TcpdumpParams,
    onProgress?: (status: SSMCommandResult) => void,
): Promise<void> {
    const { commandId, remoteFilePath } = await startTcpdump(params);
    await waitForSsmCommand(commandId, params.instanceId, onProgress);

    const { s3Key } = await uploadEc2ToS3({ ...params, remoteFileGlob: remoteFilePath });
    await downloadFile(params.credentials, params.s3Bucket, s3Key);
}

/** Run coredump end-to-end: start → wait for SSM → upload from EC2 to S3 → download. */
export async function runCoredumpAndDownload(
    params: CoredumpParams,
    onProgress?: (status: SSMCommandResult) => void,
): Promise<void> {
    const { commandId, remoteFileGlob } = await startCoredump(params);
    await waitForSsmCommand(commandId, params.instanceId, onProgress);

    const { s3Key } = await uploadEc2ToS3({ ...params, remoteFileGlob });
    await downloadFile(params.credentials, params.s3Bucket, s3Key);
}

/** Download a file from an EC2 instance to the local machine via S3. */
export async function downloadEc2File(params: {
    instanceId: string;
    credentials: S3Credentials;
    s3Bucket: string;
    remotePath: string;
}): Promise<void> {
    const { s3Key } = await uploadEc2ToS3({
        ...params,
        remoteFileGlob: params.remotePath,
    });
    await downloadFile(params.credentials, params.s3Bucket, s3Key);
}
