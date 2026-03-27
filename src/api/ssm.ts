import {
    SendCommandCommand,
    GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import { getSsmClient } from "./clients";
import { log } from "@/lib/logger";

/** Send an SSM RunShellScript command and wait for completion. Returns stdout. */
export async function execSsmCommand(
    instanceId: string,
    commands: string[],
    timeoutSeconds = 120,
): Promise<string> {
    log.ssm.debug(`Executing SSM command on instance ${instanceId} with commands: ${commands.join(", ")}`);

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

    const pollIntervalMs = 3000;
    const maxWaitMs = (timeoutSeconds + 30) * 1000; // SSM timeout + 30s grace for polling lag
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));

        try {
            const inv = await getSsmClient().send(
                new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId }),
            );

            if (inv.Status === "Success") return inv.StandardOutputContent ?? "";
            if (inv.Status === "Failed" || inv.Status === "Cancelled" || inv.Status === "TimedOut") {
                log.ssm.error(`SSM command failed: ${inv.StandardErrorContent || inv.StatusDetails || `Command ${inv.Status}`}`);
                throw new Error(inv.StandardErrorContent || inv.StatusDetails || `Command ${inv.Status}`);
            }
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === "InvocationDoesNotExist")) throw e;
        }
    }

    log.ssm.error(`SSM command ${commandId} timed out after ${maxWaitMs / 1000}s of polling`);
    throw new Error(`SSM command ${commandId} timed out after ${maxWaitMs / 1000}s of polling`);
}
