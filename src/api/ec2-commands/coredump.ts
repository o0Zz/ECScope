import { sendSsmCommand, credentialsEnvLines } from "./helpers";
import type { CoredumpParams } from "../types";

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
