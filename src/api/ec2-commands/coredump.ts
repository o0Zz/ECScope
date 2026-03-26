import { sendSsmCommand } from "../ssm";
import type { CoredumpParams } from "../types";

/** Start a coredump (gcore) via SSM. Returns commandId and the remote file glob for later upload. */
export async function startCoredump(params: CoredumpParams): Promise<{ commandId: string; remoteFileGlob: string }> {
    const ts = Date.now();
    const coreFileBase = `/tmp/ecscope-core-${params.pid}-${ts}`;

    const commands = [
        `set -e`,
        `gcore -o "${coreFileBase}" ${params.pid}`,
    ];

    const commandId = await sendSsmCommand(params.instanceId, commands, 300);
    return { commandId, remoteFileGlob: `${coreFileBase}*` };
}
