import {
    GetLogEventsCommand,
    DescribeLogStreamsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
    DescribeTasksCommand,
    DescribeTaskDefinitionCommand,
    DescribeContainerInstancesCommand,
} from "@aws-sdk/client-ecs";
import {
    SendCommandCommand,
    GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import { getEcsClient, getLogsClient, getSsmClient, getConfiguredCluster } from "./clients";
import type { LogEvent } from "./types";

// ─── SSM Docker Logs Fallback ─────────────────────────────

/** Wait for SSM command to finish and return output */
async function waitForSsmCommand(commandId: string, instanceId: string): Promise<string> {
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
            const res = await getSsmClient().send(
                new GetCommandInvocationCommand({
                    CommandId: commandId,
                    InstanceId: instanceId,
                }),
            );
            if (res.Status === "Success") {
                return res.StandardOutputContent ?? "";
            }
            if (res.Status === "Failed" || res.Status === "Cancelled" || res.Status === "TimedOut") {
                throw new Error(
                    `SSM command ${res.Status}: ${res.StandardErrorContent || res.StatusDetails || "unknown error"}`,
                );
            }
            // InProgress / Pending — keep waiting
        } catch (e: unknown) {
            // InvocationDoesNotExist means the command hasn't registered yet
            if (e instanceof Error && e.name === "InvocationDoesNotExist") continue;
            throw e;
        }
    }
    throw new Error("SSM command timed out after 30s");
}

/** Fetch container logs from EC2 via SSM SendCommand + docker logs */
async function getDockerLogsViaSsm(
    task: { containerInstanceArn?: string; containers?: { runtimeId?: string; name?: string }[] },
    clusterName: string,
): Promise<LogEvent[]> {
    if (!task.containerInstanceArn) {
        throw new Error(
            "Task has no containerInstanceArn. This may be a Fargate task — SSM docker logs only works with EC2 launch type.",
        );
    }

    const container = task.containers?.find((c) => c.runtimeId);
    if (!container?.runtimeId) {
        throw new Error(
            "No container has a Docker runtime ID. The task may not be running yet.",
        );
    }

    const ciRes = await getEcsClient().send(
        new DescribeContainerInstancesCommand({
            cluster: clusterName,
            containerInstances: [task.containerInstanceArn],
        }),
    );
    const ec2InstanceId = ciRes.containerInstances?.[0]?.ec2InstanceId;
    if (!ec2InstanceId) {
        throw new Error(
            `Could not resolve EC2 instance ID for container instance ${task.containerInstanceArn}`,
        );
    }

    console.log(
        `[ECScope] Fetching docker logs via SSM: instance=${ec2InstanceId}, container=${container.runtimeId} (${container.name})`,
    );

    const sendRes = await getSsmClient().send(
        new SendCommandCommand({
            InstanceIds: [ec2InstanceId],
            DocumentName: "AWS-RunShellScript",
            Parameters: {
                commands: [`docker logs --tail 200 --timestamps ${container.runtimeId}`],
            },
            TimeoutSeconds: 30,
        }),
    );

    const commandId = sendRes.Command?.CommandId;
    if (!commandId) {
        throw new Error("SSM SendCommand did not return a command ID. Check IAM permissions for ssm:SendCommand.");
    }

    const output = await waitForSsmCommand(commandId, ec2InstanceId);

    const lines = output.split("\n").filter((l) => l.trim());
    const now = Date.now();

    return lines.map((line, i) => {
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(.*)/);
        if (tsMatch) {
            const ts = new Date(tsMatch[1]).getTime();
            return {
                timestamp: isNaN(ts) ? now - (lines.length - i) * 1000 : ts,
                message: tsMatch[2],
                ingestionTime: now,
            };
        }
        return {
            timestamp: now - (lines.length - i) * 1000,
            message: line,
            ingestionTime: now,
        };
    });
}

// ─── Public API ───────────────────────────────────────────

export async function getTaskLogs(taskArn: string): Promise<LogEvent[]> {
    const arnParts = taskArn.split("/");
    const taskId = arnParts[arnParts.length - 1];
    const clusterName = arnParts.length >= 3 ? arnParts[arnParts.length - 2] : getConfiguredCluster();

    const descRes = await getEcsClient().send(
        new DescribeTasksCommand({
            cluster: clusterName,
            tasks: [taskArn],
        }),
    );

    const task = descRes.tasks?.[0];
    if (!task?.taskDefinitionArn) {
        throw new Error("Task not found or has no task definition. The task may have been stopped and deregistered.");
    }

    const tdRes = await getEcsClient().send(
        new DescribeTaskDefinitionCommand({
            taskDefinition: task.taskDefinitionArn,
        }),
    );

    const containers = tdRes.taskDefinition?.containerDefinitions ?? [];
    if (containers.length === 0) {
        throw new Error("Task definition has no container definitions.");
    }

    const logDrivers = containers.map((c) => ({
        name: c.name,
        driver: c.logConfiguration?.logDriver ?? "none (docker default)",
        options: c.logConfiguration?.options,
    }));
    console.log("[ECScope] Container log configs:", logDrivers);

    const logContainer = containers.find(
        (c) => c.logConfiguration?.logDriver === "awslogs",
    );

    if (!logContainer) {
        console.log("[ECScope] No awslogs driver, trying SSM docker logs fallback");
        return getDockerLogsViaSsm(task, clusterName);
    }

    const logConfig = logContainer.logConfiguration!;
    const logGroup = logConfig.options?.["awslogs-group"];
    const logStreamPrefix = logConfig.options?.["awslogs-stream-prefix"];

    if (!logGroup) {
        throw new Error(
            `Container "${logContainer.name}" uses awslogs but has no "awslogs-group" option configured.`
        );
    }

    const streamName = logStreamPrefix
        ? `${logStreamPrefix}/${logContainer.name}/${taskId}`
        : undefined;

    console.log("[ECScope] Looking for logs in group:", logGroup, "stream:", streamName ?? "(searching...)");

    try {
        if (streamName) {
            const logRes = await getLogsClient().send(
                new GetLogEventsCommand({
                    logGroupName: logGroup,
                    logStreamName: streamName,
                    startFromHead: false,
                    limit: 200,
                }),
            );

            const events = (logRes.events ?? []).map((e) => ({
                timestamp: e.timestamp ?? 0,
                message: e.message ?? "",
                ingestionTime: e.ingestionTime ?? 0,
            }));
            if (events.length > 0) return events;
        }
    } catch (e: unknown) {
        console.warn("[ECScope] Direct stream lookup failed:", e instanceof Error ? e.message : e);
    }

    try {
        const streamsRes = await getLogsClient().send(
            new DescribeLogStreamsCommand({
                logGroupName: logGroup,
                logStreamNamePrefix: logStreamPrefix ?? undefined,
                orderBy: "LastEventTime",
                descending: true,
                limit: 20,
            }),
        );

        console.log("[ECScope] Found streams:", streamsRes.logStreams?.map((s) => s.logStreamName));

        const matchingStream = streamsRes.logStreams?.find((s) =>
            s.logStreamName?.includes(taskId),
        );

        if (!matchingStream?.logStreamName) {
            throw new Error(
                `No log stream found for task ${taskId} in log group "${logGroup}".\n` +
                `Available streams: ${streamsRes.logStreams?.map((s) => s.logStreamName).join(", ") || "none"}`
            );
        }

        const logRes = await getLogsClient().send(
            new GetLogEventsCommand({
                logGroupName: logGroup,
                logStreamName: matchingStream.logStreamName,
                startFromHead: false,
                limit: 200,
            }),
        );

        return (logRes.events ?? []).map((e) => ({
            timestamp: e.timestamp ?? 0,
            message: e.message ?? "",
            ingestionTime: e.ingestionTime ?? 0,
        }));
    } catch (e: unknown) {
        if (e instanceof Error && e.message.startsWith("No log stream found")) throw e;
        throw new Error(`Failed to fetch logs from CloudWatch: ${e instanceof Error ? e.message : String(e)}`);
    }
}
