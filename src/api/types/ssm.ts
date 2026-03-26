export type SSMCommandStatus = "running" | "completed" | "failed";

export interface SSMCommandResult {
    commandId: string;
    instanceId: string;
    status: SSMCommandStatus;
    /** Error message (set when failed) */
    error?: string;
}
