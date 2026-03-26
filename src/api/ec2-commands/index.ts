import { startTcpdump } from "./tcpdump";
import { startCoredump } from "./coredump";
import { pollDiagnostic, downloadDiagnosticFile } from "./download";
import type { TcpdumpParams, CoredumpParams, DiagnosticResult } from "../types";

export { startTcpdump } from "./tcpdump";
export { startCoredump } from "./coredump";
export { pollDiagnostic, downloadDiagnosticFile } from "./download";

/** Run tcpdump end-to-end: start → poll until done → download. */
export async function runTcpdumpAndDownload(
    params: TcpdumpParams,
    onProgress?: (status: DiagnosticResult) => void,
): Promise<void> {
    const { commandId } = await startTcpdump(params);

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

/** Run coredump end-to-end: start → poll until done → download. */
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
