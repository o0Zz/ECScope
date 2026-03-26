import { sendSsmCommand, credentialsEnvLines } from "./helpers";
import type { TcpdumpParams } from "../types";

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
