import { sendSsmCommand } from "../ssm";
import type { TcpdumpParams } from "../types";

/** Start a tcpdump capture via SSM. Returns commandId and the remote file path for later upload. */
export async function startTcpdump(params: TcpdumpParams): Promise<{ commandId: string; remoteFilePath: string }> {
    const duration = params.duration ?? 30;
    const iface = params.iface ?? "any";
    const ts = Date.now();
    const pcapFile = `/tmp/ecscope-tcpdump-${ts}.pcap`;
    const filterArg = params.filter ? ` ${params.filter}` : "";

    const commands = [
        `set -e`,
        `timeout ${duration} tcpdump -i ${iface}${filterArg} -w "${pcapFile}" || true`,
    ];

    const timeoutSeconds = duration + 120;
    const commandId = await sendSsmCommand(params.instanceId, commands, timeoutSeconds);
    return { commandId, remoteFilePath: pcapFile };
}
