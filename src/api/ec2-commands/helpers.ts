import {
    SendCommandCommand,
} from "@aws-sdk/client-ssm";
import {
    S3Client,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSsmClient } from "../clients";
import type { S3Credentials } from "../types";

/** Send an SSM RunShellScript command and return the command ID */
export async function sendSsmCommand(
    instanceId: string,
    commands: string[],
    timeoutSeconds: number,
): Promise<string> {
    const res = await getSsmClient().send(
        new SendCommandCommand({
            InstanceIds: [instanceId],
            DocumentName: "AWS-RunShellScript",
            Parameters: { commands },
            TimeoutSeconds: timeoutSeconds,
        }),
    );
    const commandId = res.Command?.CommandId;
    if (!commandId) {
        throw new Error("SSM SendCommand did not return a command ID. Check IAM permissions for ssm:SendCommand.");
    }
    return commandId;
}

/** Parse S3_KEY=... from SSM command stdout */
export function parseS3Key(stdout: string): string {
    const match = stdout.match(/S3_KEY=(\S+)/);
    if (!match) {
        throw new Error(`Diagnostic command did not output an S3 key. Output: ${stdout.slice(0, 500)}`);
    }
    return match[1];
}

/** Build shell lines that export AWS credentials as env vars so aws CLI uses them */
export function credentialsEnvLines(creds: S3Credentials): string[] {
    return [
        `export AWS_ACCESS_KEY_ID="${creds.accessKeyId}"`,
        `export AWS_SECRET_ACCESS_KEY="${creds.secretAccessKey}"`,
        `export AWS_DEFAULT_REGION="${creds.region}"`,
    ];
}

/** Create an S3 client using the dedicated diagnostics credentials */
function makeDiagS3Client(creds: S3Credentials): S3Client {
    return new S3Client({
        region: creds.region,
        credentials: {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
        },
    });
}

export async function downloadFromS3(creds: S3Credentials, bucket: string, key: string): Promise<Uint8Array> {
    const client = makeDiagS3Client(creds);
    const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) throw new Error("S3 GetObject returned empty body");
    return new Uint8Array(await res.Body.transformToByteArray());
}

export async function deleteFromS3(creds: S3Credentials, bucket: string, key: string): Promise<void> {
    const client = makeDiagS3Client(creds);
    await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
}
