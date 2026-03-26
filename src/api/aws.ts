import {
    ECSClient,
    DescribeClustersCommand,
    ListServicesCommand,
    DescribeServicesCommand,
    ListTasksCommand,
    DescribeTasksCommand,
    DescribeTaskDefinitionCommand,
    UpdateServiceCommand,
    ListContainerInstancesCommand,
    DescribeContainerInstancesCommand,
} from "@aws-sdk/client-ecs";
import {
    CloudWatchLogsClient,
    GetLogEventsCommand,
    DescribeLogStreamsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
    CloudWatchClient,
    GetMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
    SSMClient,
    SendCommandCommand,
    GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import {
    ElasticLoadBalancingV2Client,
    DescribeTargetGroupsCommand,
    DescribeTargetHealthCommand,
    DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import type { ResolvedCredentials } from "./aws-credentials";
import type {
    EcsCluster,
    ClusterMetrics,
    EcsService,
    EcsTask,
    LogEvent,
    AlbInfo,
    ContainerInstance,
    DatabaseInstance,
} from "./types";

let ecsClient: ECSClient;
let logsClient: CloudWatchLogsClient;
let cwClient: CloudWatchClient;
let ssmClient: SSMClient;
let elbv2Client: ElasticLoadBalancingV2Client;
let configuredCluster: string;

export function initAwsClients(creds: ResolvedCredentials, clusterName: string) {
    console.log("[aws] initAwsClients called", { region: creds.region, clusterName, hasAccessKey: !!creds.accessKeyId, hasSessionToken: !!creds.sessionToken });
    const credentials = {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
    };

    ecsClient = new ECSClient({ region: creds.region, credentials });
    logsClient = new CloudWatchLogsClient({ region: creds.region, credentials });
    cwClient = new CloudWatchClient({ region: creds.region, credentials });
    ssmClient = new SSMClient({ region: creds.region, credentials });
    elbv2Client = new ElasticLoadBalancingV2Client({ region: creds.region, credentials });
    configuredCluster = clusterName;
    console.log("[aws] AWS clients initialized, configuredCluster =", configuredCluster);
}

/** Expose SSM client for ssm-diagnostics module */
export function getSsmClient(): SSMClient { return ssmClient; }

// ─── Helpers ──────────────────────────────────────────────

/** Fetch average CPU and Memory utilization for a service from CloudWatch (last 5 min) */
async function fetchServiceMetrics(
    clusterName: string,
    serviceName: string,
): Promise<{ cpuUtilization: number; memoryUtilization: number }> {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    try {
        const res = await cwClient.send(
            new GetMetricDataCommand({
                StartTime: fiveMinAgo,
                EndTime: now,
                MetricDataQueries: [
                    {
                        Id: "cpu",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ECS",
                                MetricName: "CPUUtilization",
                                Dimensions: [
                                    { Name: "ClusterName", Value: clusterName },
                                    { Name: "ServiceName", Value: serviceName },
                                ],
                            },
                            Period: 300,
                            Stat: "Average",
                        },
                    },
                    {
                        Id: "mem",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ECS",
                                MetricName: "MemoryUtilization",
                                Dimensions: [
                                    { Name: "ClusterName", Value: clusterName },
                                    { Name: "ServiceName", Value: serviceName },
                                ],
                            },
                            Period: 300,
                            Stat: "Average",
                        },
                    },
                ],
            }),
        );

        const cpuValues = res.MetricDataResults?.find((r) => r.Id === "cpu")?.Values ?? [];
        const memValues = res.MetricDataResults?.find((r) => r.Id === "mem")?.Values ?? [];

        const cpu = cpuValues.length > 0 ? Math.round(cpuValues[0] * 10) / 10 : 0;
        const mem = memValues.length > 0 ? Math.round(memValues[0] * 10) / 10 : 0;

        console.log(`[aws] metrics for ${serviceName}:`, { cpu, mem });
        return { cpuUtilization: cpu, memoryUtilization: mem };
    } catch (err) {
        console.warn(`[aws] Failed to fetch metrics for ${serviceName}:`, err);
        return { cpuUtilization: 0, memoryUtilization: 0 };
    }
}

/** Paginate ListServices (returns all service ARNs) */
async function listAllServiceArns(cluster: string): Promise<string[]> {
    console.log("[aws] listAllServiceArns called", { cluster });
    const arns: string[] = [];
    let nextToken: string | undefined;
    do {
        const res = await ecsClient.send(
            new ListServicesCommand({ cluster, nextToken }),
        );
        console.log("[aws] ListServicesCommand response", { serviceArns: res.serviceArns, nextToken: res.nextToken });
        if (res.serviceArns) arns.push(...res.serviceArns);
        nextToken = res.nextToken;
    } while (nextToken);
    console.log("[aws] listAllServiceArns result", { totalArns: arns.length, arns });
    return arns;
}

/** DescribeServices in batches of 10 (AWS limit) */
async function describeServicesBatched(
    cluster: string,
    arns: string[],
) {
    const results: NonNullable<
        Awaited<ReturnType<ECSClient["send"]>>
    >[] = [];

    for (let i = 0; i < arns.length; i += 10) {
        const batch = arns.slice(i, i + 10);
        const res = await ecsClient.send(
            new DescribeServicesCommand({ cluster, services: batch }),
        );
        if (res.services) results.push(...(res.services as any[]));
    }
    return results;
}

// ─── API Implementation ──────────────────────────────────

async function listClusters(): Promise<EcsCluster[]> {
    console.log("[aws] listClusters called", { configuredCluster, hasEcsClient: !!ecsClient });
    const desc = await ecsClient.send(
        new DescribeClustersCommand({
            clusters: [configuredCluster],
            include: ["STATISTICS"],
        }),
    );
    console.log("[aws] DescribeClusters response", { clusters: desc.clusters?.map(c => c.clusterName) });

    return (desc.clusters ?? []).map((c) => ({
        clusterArn: c.clusterArn ?? "",
        clusterName: c.clusterName ?? "",
        status: c.status ?? "UNKNOWN",
        activeServicesCount: c.activeServicesCount ?? 0,
        runningTasksCount: c.runningTasksCount ?? 0,
        pendingTasksCount: c.pendingTasksCount ?? 0,
        registeredContainerInstancesCount:
            c.registeredContainerInstancesCount ?? 0,
    }));
}

async function getCluster(
    clusterName: string,
): Promise<EcsCluster | undefined> {
    const clusters = await listClusters();
    return clusters.find((c) => c.clusterName === clusterName);
}

async function listServices(clusterName: string): Promise<EcsService[]> {
    console.log("[aws] listServices called", { clusterName, configuredCluster, hasEcsClient: !!ecsClient });
    try {
        const arns = await listAllServiceArns(clusterName);
        console.log("[aws] listServices got arns", { count: arns.length });
        if (arns.length === 0) { console.log("[aws] listServices: no service ARNs found, returning []"); return []; }

        const rawServices = await describeServicesBatched(clusterName, arns);
        console.log("[aws] listServices described services", { count: rawServices.length });

        // Fetch CloudWatch metrics for all services in parallel
        const metricsResults = await Promise.all(
            rawServices.map((s: any) =>
                fetchServiceMetrics(clusterName, s.serviceName ?? ""),
            ),
        );

        return rawServices.map((s: any, i: number) => {
            const taskDef = s.taskDefinition?.split("/").pop() ?? s.taskDefinition ?? "";
            // Parse CPU/memory from task definition if available
            const cpuReserved = parseInt(s.cpu ?? "0", 10) || (s.desiredCount ?? 0) * 256;
            const memReservedMB = parseInt(s.memory ?? "0", 10) || (s.desiredCount ?? 0) * 512;

            return {
                serviceArn: s.serviceArn ?? "",
                serviceName: s.serviceName ?? "",
                clusterArn: s.clusterArn ?? "",
                status: s.status ?? "UNKNOWN",
                desiredCount: s.desiredCount ?? 0,
                runningCount: s.runningCount ?? 0,
                pendingCount: s.pendingCount ?? 0,
                launchType: s.launchType ?? s.capacityProviderStrategy?.[0]?.capacityProvider ?? "UNKNOWN",
                taskDefinition: taskDef,
                deployments: (s.deployments ?? []).map((d: any) => ({
                    id: d.id ?? "",
                    status: d.status ?? "",
                    desiredCount: d.desiredCount ?? 0,
                    runningCount: d.runningCount ?? 0,
                    pendingCount: d.pendingCount ?? 0,
                    rolloutState: d.rolloutState ?? "",
                    createdAt: d.createdAt?.toISOString?.() ?? "",
                })),
                createdAt: s.createdAt?.toISOString?.() ?? "",
                metrics: {
                    cpuUtilization: metricsResults[i].cpuUtilization,
                    memoryUtilization: metricsResults[i].memoryUtilization,
                    cpuReserved,
                    memoryReservedMB: memReservedMB,
                },
            };
        });
    } catch (err) {
        console.error("[aws] listServices ERROR", err);
        throw err;
    }
}

async function getService(
    clusterName: string,
    serviceName: string,
): Promise<EcsService | undefined> {
    const res = await ecsClient.send(
        new DescribeServicesCommand({
            cluster: clusterName,
            services: [serviceName],
        }),
    );

    const s = res.services?.[0];
    if (!s) return undefined;

    const metrics = await fetchServiceMetrics(clusterName, serviceName);
    const cpuReserved = (s.desiredCount ?? 0) * 256;
    const memoryReservedMB = (s.desiredCount ?? 0) * 512;

    return {
        serviceArn: s.serviceArn ?? "",
        serviceName: s.serviceName ?? "",
        clusterArn: s.clusterArn ?? "",
        status: s.status ?? "UNKNOWN",
        desiredCount: s.desiredCount ?? 0,
        runningCount: s.runningCount ?? 0,
        pendingCount: s.pendingCount ?? 0,
        launchType: s.launchType ?? s.capacityProviderStrategy?.[0]?.capacityProvider ?? "UNKNOWN",
        taskDefinition: s.taskDefinition?.split("/").pop() ?? s.taskDefinition ?? "",
        deployments: (s.deployments ?? []).map((d) => ({
            id: d.id ?? "",
            status: d.status ?? "",
            desiredCount: d.desiredCount ?? 0,
            runningCount: d.runningCount ?? 0,
            pendingCount: d.pendingCount ?? 0,
            rolloutState: d.rolloutState ?? "",
            createdAt: d.createdAt?.toISOString?.() ?? "",
        })),
        createdAt: s.createdAt?.toISOString?.() ?? "",
        metrics: {
            cpuUtilization: metrics.cpuUtilization,
            memoryUtilization: metrics.memoryUtilization,
            cpuReserved,
            memoryReservedMB,
        },
    };
}

async function listTasks(
    clusterName: string,
    serviceName: string,
): Promise<EcsTask[]> {
    const listRes = await ecsClient.send(
        new ListTasksCommand({
            cluster: clusterName,
            serviceName,
        }),
    );

    const taskArns = listRes.taskArns ?? [];
    if (taskArns.length === 0) return [];

    // DescribeTasks supports up to 100 at a time
    const allTasks: EcsTask[] = [];
    for (let i = 0; i < taskArns.length; i += 100) {
        const batch = taskArns.slice(i, i + 100);
        const descRes = await ecsClient.send(
            new DescribeTasksCommand({ cluster: clusterName, tasks: batch }),
        );

        for (const t of descRes.tasks ?? []) {
            allTasks.push({
                taskArn: t.taskArn ?? "",
                taskDefinitionArn: t.taskDefinitionArn ?? "",
                clusterArn: t.clusterArn ?? "",
                lastStatus: t.lastStatus ?? "UNKNOWN",
                desiredStatus: t.desiredStatus ?? "",
                launchType: t.launchType ?? "",
                cpu: t.cpu ?? "0",
                memory: t.memory ?? "0",
                startedAt: t.startedAt?.toISOString?.() ?? "",
                group: t.group ?? "",
                healthStatus: t.healthStatus ?? "UNKNOWN",
                containerInstanceArn: t.containerInstanceArn ?? "",
                ec2InstanceId: "",
                containers: (t.containers ?? []).map((c) => ({
                    containerArn: c.containerArn ?? "",
                    name: c.name ?? "",
                    image: c.image ?? "",
                    lastStatus: c.lastStatus ?? "",
                    healthStatus: c.healthStatus ?? "UNKNOWN",
                    cpu: c.cpu ?? "0",
                    memory: c.memory ?? "0",
                    networkBindings: (c.networkBindings ?? []).map((nb) => ({
                        containerPort: nb.containerPort ?? 0,
                        hostPort: nb.hostPort ?? 0,
                        protocol: nb.protocol ?? "tcp",
                    })),
                })),
            });
        }
    }

    // Resolve EC2 instance IDs from container instance ARNs
    const ciArns = [...new Set(allTasks.map((t) => t.containerInstanceArn).filter(Boolean))];
    if (ciArns.length > 0) {
        const ciRes = await ecsClient.send(
            new DescribeContainerInstancesCommand({
                cluster: clusterName,
                containerInstances: ciArns,
            }),
        );
        const ciMap = new Map<string, string>();
        for (const ci of ciRes.containerInstances ?? []) {
            if (ci.containerInstanceArn && ci.ec2InstanceId) {
                ciMap.set(ci.containerInstanceArn, ci.ec2InstanceId);
            }
        }
        for (const task of allTasks) {
            task.ec2InstanceId = ciMap.get(task.containerInstanceArn) ?? "";
        }
    }

    return allTasks;
}

async function getClusterMetrics(
    clusterName: string,
): Promise<ClusterMetrics> {
    console.log("[aws] getClusterMetrics called", { clusterName });
    // Get services (already includes real CloudWatch metrics)
    const services = await listServices(clusterName);

    // Aggregate CPU and memory from per-service metrics (weighted by running count)
    let totalCpu = 0;
    let totalMem = 0;
    let totalCpuReserved = 0;
    let totalMemReserved = 0;
    let totalWeight = 0;

    for (const svc of services) {
        const weight = svc.runningCount || 1;
        totalCpu += svc.metrics.cpuUtilization * weight;
        totalMem += svc.metrics.memoryUtilization * weight;
        totalCpuReserved += svc.metrics.cpuReserved;
        totalMemReserved += svc.metrics.memoryReservedMB;
        totalWeight += weight;
    }

    const avgCpu = totalWeight > 0 ? Math.round((totalCpu / totalWeight) * 10) / 10 : 0;
    const avgMem = totalWeight > 0 ? Math.round((totalMem / totalWeight) * 10) / 10 : 0;

    // Estimate total capacity (reserved / utilization)
    const cpuTotal = avgCpu > 0 ? Math.round(totalCpuReserved / (avgCpu / 100)) : totalCpuReserved * 2;
    const memTotal = avgMem > 0 ? Math.round(totalMemReserved / (avgMem / 100)) : totalMemReserved * 2;

    console.log("[aws] getClusterMetrics result", { avgCpu, avgMem, totalCpuReserved, totalMemReserved });

    return {
        cpuUtilization: avgCpu,
        memoryUtilization: avgMem,
        cpuReserved: totalCpuReserved,
        cpuTotal,
        memoryReservedMB: totalMemReserved,
        memoryTotalMB: memTotal,
    };
}

async function updateServiceDesiredCount(
    clusterName: string,
    serviceName: string,
    desiredCount: number,
): Promise<EcsService> {
    await ecsClient.send(
        new UpdateServiceCommand({
            cluster: clusterName,
            service: serviceName,
            desiredCount: Math.max(0, desiredCount),
        }),
    );

    // Re-fetch to get updated state
    const updated = await getService(clusterName, serviceName);
    if (!updated) throw new Error(`Service ${serviceName} not found after update`);
    return updated;
}

async function listContainerInstances(
    clusterName: string,
): Promise<ContainerInstance[]> {
    const listRes = await ecsClient.send(
        new ListContainerInstancesCommand({ cluster: clusterName }),
    );

    const ciArns = listRes.containerInstanceArns ?? [];
    if (ciArns.length === 0) return [];

    const descRes = await ecsClient.send(
        new DescribeContainerInstancesCommand({
            cluster: clusterName,
            containerInstances: ciArns,
        }),
    );

    return (descRes.containerInstances ?? []).map((ci) => {
        const cpuReg = ci.registeredResources?.find((r) => r.name === "CPU");
        const memReg = ci.registeredResources?.find((r) => r.name === "MEMORY");
        const cpuRem = ci.remainingResources?.find((r) => r.name === "CPU");
        const memRem = ci.remainingResources?.find((r) => r.name === "MEMORY");

        return {
            containerInstanceArn: ci.containerInstanceArn ?? "",
            ec2InstanceId: ci.ec2InstanceId ?? "",
            instanceType: ci.attributes?.find((a) => a.name === "ecs.instance-type")?.value ?? "unknown",
            status: ci.status ?? "UNKNOWN",
            runningTasksCount: ci.runningTasksCount ?? 0,
            pendingTasksCount: ci.pendingTasksCount ?? 0,
            cpuRegistered: cpuReg?.integerValue ?? 0,
            cpuAvailable: cpuRem?.integerValue ?? 0,
            memoryRegistered: memReg?.integerValue ?? 0,
            memoryAvailable: memRem?.integerValue ?? 0,
            agentVersion: ci.versionInfo?.agentVersion ?? "",
            launchType: "EC2" as const,
        };
    });
}

// ─── SSM Docker Logs Fallback ─────────────────────────────

/** Wait for SSM command to finish and return output */
async function waitForSsmCommand(commandId: string, instanceId: string): Promise<string> {
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
            const res = await ssmClient.send(
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

    // Find a container with a runtimeId (Docker container ID)
    const container = task.containers?.find((c) => c.runtimeId);
    if (!container?.runtimeId) {
        throw new Error(
            "No container has a Docker runtime ID. The task may not be running yet.",
        );
    }

    // Resolve EC2 instance ID from container instance ARN
    const ciRes = await ecsClient.send(
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

    // Send docker logs command via SSM
    const sendRes = await ssmClient.send(
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

    // Wait for command completion
    const output = await waitForSsmCommand(commandId, ec2InstanceId);

    // Parse docker logs output (each line: timestamp message)
    const lines = output.split("\n").filter((l) => l.trim());
    const now = Date.now();

    return lines.map((line, i) => {
        // Docker --timestamps format: 2024-01-15T10:30:00.123456789Z message
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

async function getTaskLogs(taskArn: string): Promise<LogEvent[]> {
    // Extract task ID and cluster from ARN
    // ARN format: arn:aws:ecs:region:account:task/cluster-name/task-id
    const arnParts = taskArn.split("/");
    const taskId = arnParts[arnParts.length - 1];
    const clusterName = arnParts.length >= 3 ? arnParts[arnParts.length - 2] : configuredCluster;

    // Get task to find task definition
    const descRes = await ecsClient.send(
        new DescribeTasksCommand({
            cluster: clusterName,
            tasks: [taskArn],
        }),
    );

    const task = descRes.tasks?.[0];
    if (!task?.taskDefinitionArn) {
        throw new Error("Task not found or has no task definition. The task may have been stopped and deregistered.");
    }

    // Get task definition to find log configuration
    const tdRes = await ecsClient.send(
        new DescribeTaskDefinitionCommand({
            taskDefinition: task.taskDefinitionArn,
        }),
    );

    const containers = tdRes.taskDefinition?.containerDefinitions ?? [];
    if (containers.length === 0) {
        throw new Error("Task definition has no container definitions.");
    }

    // Collect log driver info for diagnostics
    const logDrivers = containers.map((c) => ({
        name: c.name,
        driver: c.logConfiguration?.logDriver ?? "none (docker default)",
        options: c.logConfiguration?.options,
    }));
    console.log("[ECScope] Container log configs:", logDrivers);

    // Find the first container with awslogs log driver
    const logContainer = containers.find(
        (c) => c.logConfiguration?.logDriver === "awslogs",
    );

    if (!logContainer) {
        // No awslogs driver — try SSM + docker logs on the EC2 instance
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

    // Build log stream name: prefix/container-name/task-id
    const streamName = logStreamPrefix
        ? `${logStreamPrefix}/${logContainer.name}/${taskId}`
        : undefined;

    console.log("[ECScope] Looking for logs in group:", logGroup, "stream:", streamName ?? "(searching...)");

    try {
        if (streamName) {
            const logRes = await logsClient.send(
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
            // Stream exists but empty, or stream doesn't exist — fall through to search
        }
    } catch (e: unknown) {
        // Stream not found — fall through to broader search
        console.warn("[ECScope] Direct stream lookup failed:", e instanceof Error ? e.message : e);
    }

    // Fallback: search for log streams matching the task ID
    try {
        const streamsRes = await logsClient.send(
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

        const logRes = await logsClient.send(
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

// Not yet implemented — return empty arrays
async function listAlbs(clusterName: string): Promise<AlbInfo[]> {
    console.log("[aws] listAlbs called", { clusterName });

    // 1. Get all services to collect target group ARNs
    const arns = await listAllServiceArns(clusterName);
    if (arns.length === 0) return [];

    const rawServices = await describeServicesBatched(clusterName, arns);

    // Collect unique target group ARNs from service load balancer configs
    const tgArnSet = new Set<string>();
    for (const svc of rawServices) {
        for (const lb of (svc as any).loadBalancers ?? []) {
            if (lb.targetGroupArn) tgArnSet.add(lb.targetGroupArn);
        }
    }

    const tgArns = [...tgArnSet];
    console.log("[aws] listAlbs found target group ARNs:", tgArns);
    if (tgArns.length === 0) return [];

    // 2. Describe target groups (batches of 20)
    const allTargetGroups: any[] = [];
    for (let i = 0; i < tgArns.length; i += 20) {
        const batch = tgArns.slice(i, i + 20);
        const tgRes = await elbv2Client.send(
            new DescribeTargetGroupsCommand({ TargetGroupArns: batch }),
        );
        allTargetGroups.push(...(tgRes.TargetGroups ?? []));
    }

    // 3. Collect unique ALB ARNs from target groups
    const albArnSet = new Set<string>();
    for (const tg of allTargetGroups) {
        for (const lbArn of tg.LoadBalancerArns ?? []) {
            albArnSet.add(lbArn);
        }
    }

    const albArns = [...albArnSet];
    console.log("[aws] listAlbs found ALB ARNs:", albArns);
    if (albArns.length === 0) return [];

    // 4. Describe ALBs (batches of 20)
    const allAlbs: any[] = [];
    for (let i = 0; i < albArns.length; i += 20) {
        const batch = albArns.slice(i, i + 20);
        const albRes = await elbv2Client.send(
            new DescribeLoadBalancersCommand({ LoadBalancerArns: batch }),
        );
        allAlbs.push(...(albRes.LoadBalancers ?? []));
    }

    // 5. Get target health for each target group in parallel
    const tgHealthMap = new Map<string, { healthyCount: number; unhealthyCount: number; targets: { targetId: string; port: number; health: string; description: string }[] }>();
    await Promise.all(
        allTargetGroups.map(async (tg) => {
            try {
                const healthRes = await elbv2Client.send(
                    new DescribeTargetHealthCommand({ TargetGroupArn: tg.TargetGroupArn }),
                );
                let healthyCount = 0;
                let unhealthyCount = 0;
                const targets = (healthRes.TargetHealthDescriptions ?? []).map((thd) => {
                    const state = thd.TargetHealth?.State ?? "unknown";
                    if (state === "healthy") healthyCount++;
                    else unhealthyCount++;
                    return {
                        targetId: thd.Target?.Id ?? "",
                        port: thd.Target?.Port ?? 0,
                        health: state,
                        description: thd.TargetHealth?.Description ?? "",
                    };
                });
                tgHealthMap.set(tg.TargetGroupArn, { healthyCount, unhealthyCount, targets });
            } catch (e) {
                console.warn("[aws] Failed to get target health for", tg.TargetGroupArn, e);
                tgHealthMap.set(tg.TargetGroupArn, { healthyCount: 0, unhealthyCount: 0, targets: [] });
            }
        }),
    );

    // 6. Build AlbInfo objects
    // Fetch CloudWatch metrics for request count and latency
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    return Promise.all(
        allAlbs.map(async (alb) => {
            const albArn = alb.LoadBalancerArn ?? "";
            const albName = alb.LoadBalancerName ?? "";

            // Find target groups belonging to this ALB
            const albTargetGroups = allTargetGroups
                .filter((tg) => (tg.LoadBalancerArns ?? []).includes(albArn))
                .map((tg) => {
                    const health = tgHealthMap.get(tg.TargetGroupArn) ?? { healthyCount: 0, unhealthyCount: 0, targets: [] };
                    return {
                        targetGroupArn: tg.TargetGroupArn ?? "",
                        targetGroupName: tg.TargetGroupName ?? "",
                        port: tg.Port ?? 0,
                        protocol: tg.Protocol ?? "",
                        healthCheckPath: tg.HealthCheckPath ?? "/",
                        healthyCount: health.healthyCount,
                        unhealthyCount: health.unhealthyCount,
                        targets: health.targets,
                    };
                });

            // Fetch request count and latency from CloudWatch
            let requestCount = 0;
            let avgLatencyMs = 0;
            try {
                // ALB dimension uses the short name from ARN: app/my-alb/50dc6c495c0c9188
                const albDimension = albArn.split(":loadbalancer/")[1] ?? "";
                const metricsRes = await cwClient.send(
                    new GetMetricDataCommand({
                        StartTime: fiveMinAgo,
                        EndTime: now,
                        MetricDataQueries: [
                            {
                                Id: "requests",
                                MetricStat: {
                                    Metric: {
                                        Namespace: "AWS/ApplicationELB",
                                        MetricName: "RequestCount",
                                        Dimensions: [{ Name: "LoadBalancer", Value: albDimension }],
                                    },
                                    Period: 300,
                                    Stat: "Sum",
                                },
                            },
                            {
                                Id: "latency",
                                MetricStat: {
                                    Metric: {
                                        Namespace: "AWS/ApplicationELB",
                                        MetricName: "TargetResponseTime",
                                        Dimensions: [{ Name: "LoadBalancer", Value: albDimension }],
                                    },
                                    Period: 300,
                                    Stat: "Average",
                                },
                            },
                        ],
                    }),
                );
                const reqValues = metricsRes.MetricDataResults?.find((r) => r.Id === "requests")?.Values ?? [];
                const latValues = metricsRes.MetricDataResults?.find((r) => r.Id === "latency")?.Values ?? [];
                requestCount = reqValues.length > 0 ? Math.round(reqValues[0]) : 0;
                avgLatencyMs = latValues.length > 0 ? Math.round(latValues[0] * 1000) : 0;
            } catch (e) {
                console.warn("[aws] Failed to get ALB metrics for", albName, e);
            }

            return {
                albArn,
                albName,
                dnsName: alb.DNSName ?? "",
                scheme: alb.Scheme ?? "unknown",
                status: alb.State?.Code ?? "unknown",
                targetGroups: albTargetGroups,
                requestCount,
                avgLatencyMs,
            };
        }),
    );
}

async function listDatabases(_clusterName: string): Promise<DatabaseInstance[]> {
    return [];
}

async function getServiceMetricsHistory(
    clusterName: string,
    serviceName: string,
): Promise<import("./types").MetricsDataPoint[]> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
        const res = await cwClient.send(
            new GetMetricDataCommand({
                StartTime: oneDayAgo,
                EndTime: now,
                MetricDataQueries: [
                    {
                        Id: "cpu",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ECS",
                                MetricName: "CPUUtilization",
                                Dimensions: [
                                    { Name: "ClusterName", Value: clusterName },
                                    { Name: "ServiceName", Value: serviceName },
                                ],
                            },
                            Period: 300,
                            Stat: "Average",
                        },
                    },
                    {
                        Id: "mem",
                        MetricStat: {
                            Metric: {
                                Namespace: "AWS/ECS",
                                MetricName: "MemoryUtilization",
                                Dimensions: [
                                    { Name: "ClusterName", Value: clusterName },
                                    { Name: "ServiceName", Value: serviceName },
                                ],
                            },
                            Period: 300,
                            Stat: "Average",
                        },
                    },
                ],
            }),
        );

        const cpuResult = res.MetricDataResults?.find((r) => r.Id === "cpu");
        const memResult = res.MetricDataResults?.find((r) => r.Id === "mem");
        const timestamps = cpuResult?.Timestamps ?? [];
        const cpuValues = cpuResult?.Values ?? [];
        const memValues = memResult?.Values ?? [];

        return timestamps
            .map((ts, i) => ({
                timestamp: new Date(ts).getTime(),
                cpuUtilization: Math.round((cpuValues[i] ?? 0) * 10) / 10,
                memoryUtilization: Math.round((memValues[i] ?? 0) * 10) / 10,
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        console.warn(`[aws] Failed to fetch metrics history for ${serviceName}:`, err);
        return [];
    }
}

export const awsApi = {
    listClusters,
    getCluster,
    listServices,
    getService,
    listTasks,
    getClusterMetrics,
    updateServiceDesiredCount,
    getTaskLogs,
    listAlbs,
    listContainerInstances,
    listDatabases,
    getServiceMetricsHistory,
};
