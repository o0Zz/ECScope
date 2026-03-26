import {
    GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { getSsmClient } from "../clients";
import { parseS3Key, downloadFromS3, deleteFromS3 } from "./helpers";
import type { DiagnosticResult, S3Credentials } from "../types";

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
    const filename = s3Key.split("/").pop() ?? "diagnostic-file";

    const isPcap = filename.endsWith(".pcap");
    const filters = isPcap
        ? [{ name: "Packet Capture", extensions: ["pcap"] }]
        : [{ name: "Core Dump", extensions: ["core", "*"] }];

    const savePath = await save({
        defaultPath: filename,
        filters,
        title: "Save Diagnostic File",
    });

    if (!savePath) return;

    console.log(`[diagnostics] Downloading s3://${bucket}/${s3Key} ...`);
    const data = await downloadFromS3(creds, bucket, s3Key);

    await writeFile(savePath, data);
    console.log(`[diagnostics] Saved ${data.length} bytes to ${savePath}`);

    await deleteFromS3(creds, bucket, s3Key);
    console.log(`[diagnostics] Deleted s3://${bucket}/${s3Key}`);
}
