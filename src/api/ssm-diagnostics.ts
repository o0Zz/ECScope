import {
    SendCommandCommand,
    GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import {
    S3Client,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { getSsmClient } from "./aws";
import type {
    TcpdumpParams,
    CoredumpParams,
    DiagnosticResult,
    S3Credentials,
} from "./types";

// ─── SSM Command Helpers ──────────────────────────────────

/** Send an SSM RunShellScript command and return the command ID */
async function sendSsmCommand(
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
function parseS3Key(stdout: string): string {
    const match = stdout.match(/S3_KEY=(\S+)/);
    if (!match) {
        throw new Error(`Diagnostic command did not output an S3 key. Output: ${stdout.slice(0, 500)}`);
    }
    return match[1];
}

// ─── S3 with dedicated credentials ────────────────────────

/** Create an S3 client using the dedicated diagnostics credentials (not the main profile) */
function makeDiagS3Client(creds: S3Credentials): S3Client {
    return new S3Client({
        region: creds.region,
        credentials: {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
        },
    });
}

async function downloadFromS3(creds: S3Credentials, bucket: string, key: string): Promise<Uint8Array> {
    const client = makeDiagS3Client(creds);
    const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) throw new Error("S3 GetObject returned empty body");
    return new Uint8Array(await res.Body.transformToByteArray());
}

async function deleteFromS3(creds: S3Credentials, bucket: string, key: string): Promise<void> {
    const client = makeDiagS3Client(creds);
    await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
}

/** Build shell lines that export AWS credentials as env vars so aws CLI uses them */
function credentialsEnvLines(creds: S3Credentials): string[] {
    const lines = [
        `export AWS_ACCESS_KEY_ID="${creds.accessKeyId}"`,
        `export AWS_SECRET_ACCESS_KEY="${creds.secretAccessKey}"`,
        `export AWS_DEFAULT_REGION="${creds.region}"`,
    ];
    return lines;
}

// ─── Public API ───────────────────────────────────────────

/** Start a tcpdump capture via SSM. Returns immediately with commandId for polling. */
export async function startTcpdump(params: TcpdumpParams): Promise<{ commandId: string }> {
    const duration = params.duration ?? 30;
    const iface = params.iface ?? "any";
    const ts = Date.now();
    const s3Key = `ecscope/${params.instanceId}/tcpdump-${ts}.pcap`;
    const filterArg = params.filter ? ` ${params.filter}` : "";

    const commands = [
        `set -e`,
        ...credentialsEnvLines(params.credentials),
        `PCAP_FILE="/tmp/ecscope-tcpdump-${ts}.pcap"`,
        `timeout ${duration} tcpdump -i ${iface}${filterArg} -w "$PCAP_FILE" || true`,
        `aws s3 cp "$PCAP_FILE" "s3://${params.s3Bucket}/${s3Key}"`,
        `rm -f "$PCAP_FILE"`,
        `echo "S3_KEY=${s3Key}"`,
    ];

    const timeoutSeconds = duration + 120;
    const commandId = await sendSsmCommand(params.instanceId, commands, timeoutSeconds);
    return { commandId };
}

/** Start a coredump (gcore) via SSM. Returns immediately with commandId for polling. */
export async function startCoredump(params: CoredumpParams): Promise<{ commandId: string }> {
    const ts = Date.now();
    const s3Key = `ecscope/${params.instanceId}/core-${params.pid}-${ts}`;

    const commands = [
        `set -e`,
        ...credentialsEnvLines(params.credentials),
        `CORE_FILE="/tmp/ecscope-core-${params.pid}-${ts}"`,
        `gcore -o "$CORE_FILE" ${params.pid}`,
        `CORE_PATH=$(ls "$CORE_FILE"* | head -1)`,
        `aws s3 cp "$CORE_PATH" "s3://${params.s3Bucket}/${s3Key}"`,
        `rm -f "$CORE_FILE"*`,
        `echo "S3_KEY=${s3Key}"`,
    ];

    const commandId = await sendSsmCommand(params.instanceId, commands, 300);
    return { commandId };
}

/** Poll a running diagnostic command. Returns status and s3Key when done. */
export async function pollDiagnostic(
    commandId: string,
    instanceId: string,
): Promise<DiagnosticResult> {
    try {
        const res = await getSsmClient().send(
            new GetCommandInvocationCommand({
                CommandId: commandId,
                InstanceId: instanceId,
            }),
        );

        if (res.Status === "Success") {
            const s3Key = parseS3Key(res.StandardOutputContent ?? "");
            return { commandId, instanceId, status: "completed", s3Key };
        }
        if (res.Status === "Failed" || res.Status === "Cancelled" || res.Status === "TimedOut") {
            return {
                commandId,
                instanceId,
                status: "failed",
                error: res.StandardErrorContent || res.StatusDetails || `Command ${res.Status}`,
            };
        }
        // Still running
        return { commandId, instanceId, status: "running" };
    } catch (e: unknown) {
        if (e instanceof Error && e.name === "InvocationDoesNotExist") {
            return { commandId, instanceId, status: "running" };
        }
        return { commandId, instanceId, status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
}

/** Download the diagnostic result from S3, prompt user to save locally, then clean up S3. */
export async function downloadDiagnosticFile(
    creds: S3Credentials,
    bucket: string,
    s3Key: string,
): Promise<void> {
    // Determine suggested filename from S3 key
    const filename = s3Key.split("/").pop() ?? "diagnostic-file";

    // Determine file filter based on extension
    const isPcap = filename.endsWith(".pcap");
    const filters = isPcap
        ? [{ name: "Packet Capture", extensions: ["pcap"] }]
        : [{ name: "Core Dump", extensions: ["core", "*"] }];

    // Show native save dialog
    const savePath = await save({
        defaultPath: filename,
        filters,
        title: "Save Diagnostic File",
    });

    if (!savePath) return; // User cancelled

    // Download from S3
    console.log(`[diagnostics] Downloading s3://${bucket}/${s3Key} ...`);
    const data = await downloadFromS3(creds, bucket, s3Key);

    // Write to disk via Tauri fs plugin
    await writeFile(savePath, data);
    console.log(`[diagnostics] Saved ${data.length} bytes to ${savePath}`);

    // Clean up S3
    await deleteFromS3(creds, bucket, s3Key);
    console.log(`[diagnostics] Deleted s3://${bucket}/${s3Key}`);
}

/** Run tcpdump end-to-end: start → poll until done → download. For simpler usage. */
export async function runTcpdumpAndDownload(
    params: TcpdumpParams,
    onProgress?: (status: DiagnosticResult) => void,
): Promise<void> {
    const { commandId } = await startTcpdump(params);

    // Poll until completion
    let result: DiagnosticResult;
    do {
        await new Promise((r) => setTimeout(r, 3000));
        result = await pollDiagnostic(commandId, params.instanceId);
        onProgress?.(result);
    } while (result.status === "running");

    if (result.status === "failed") {
        throw new Error(result.error ?? "Diagnostic command failed");
    }

    await downloadDiagnosticFile(params.credentials, params.s3Bucket, result.s3Key!);
}

/** Run coredump end-to-end: start → poll until done → download. For simpler usage. */
export async function runCoredumpAndDownload(
    params: CoredumpParams,
    onProgress?: (status: DiagnosticResult) => void,
): Promise<void> {
    const { commandId } = await startCoredump(params);

    let result: DiagnosticResult;
    do {
        await new Promise((r) => setTimeout(r, 3000));
        result = await pollDiagnostic(commandId, params.instanceId);
        onProgress?.(result);
    } while (result.status === "running");

    if (result.status === "failed") {
        throw new Error(result.error ?? "Diagnostic command failed");
    }

    await downloadDiagnosticFile(params.credentials, params.s3Bucket, result.s3Key!);
}
