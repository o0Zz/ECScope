import {
    SendCommandCommand,
    GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import { getSsmClient } from "./clients";
import type { SSMCommandResult } from "./types";

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

/** Wait for an SSM command to complete, polling every 3s. Returns the command stdout. */
export async function waitForSsmCommand(
    commandId: string,
    instanceId: string,
    onProgress?: (status: SSMCommandResult) => void,
): Promise<string> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        await new Promise((r) => setTimeout(r, 3000));

        let result: SSMCommandResult;
        try {
            const res = await getSsmClient().send(
                new GetCommandInvocationCommand({
                    CommandId: commandId,
                    InstanceId: instanceId,
                }),
            );

            if (res.Status === "Success") {
                const stdout = res.StandardOutputContent ?? "";
                result = { commandId, instanceId, status: "completed" };
                onProgress?.(result);
                return stdout;
            }
            if (res.Status === "Failed" || res.Status === "Cancelled" || res.Status === "TimedOut") {
                result = {
                    commandId,
                    instanceId,
                    status: "failed",
                    error: res.StandardErrorContent || res.StatusDetails || `Command ${res.Status}`,
                };
                onProgress?.(result);
                throw new Error(result.error);
            }
            result = { commandId, instanceId, status: "running" };
        } catch (e: unknown) {
            if (e instanceof Error && e.name === "InvocationDoesNotExist") {
                result = { commandId, instanceId, status: "running" };
            } else {
                throw e;
            }
        }

        onProgress?.(result!);
    }
}
