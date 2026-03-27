import {
    SendCommandCommand,
    GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import { getSsmClient } from "./clients";

/** Send an SSM RunShellScript command and wait for completion. Returns stdout. */
export async function execSsmCommand(
    instanceId: string,
    commands: string[],
    timeoutSeconds = 120,
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

    // eslint-disable-next-line no-constant-condition
    while (true) {
        await new Promise((r) => setTimeout(r, 3000));

        try {
            const inv = await getSsmClient().send(
                new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId }),
            );

            if (inv.Status === "Success") return inv.StandardOutputContent ?? "";
            if (inv.Status === "Failed" || inv.Status === "Cancelled" || inv.Status === "TimedOut") {
                throw new Error(inv.StandardErrorContent || inv.StatusDetails || `Command ${inv.Status}`);
            }
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === "InvocationDoesNotExist")) throw e;
        }
    }
}
