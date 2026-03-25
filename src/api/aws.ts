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
    configuredCluster = clusterName;
    console.log("[aws] AWS clients initialized, configuredCluster =", configuredCluster);
}

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
    if (!task?.taskDefinitionArn) return [];

    // Get task definition to find log configuration
    const tdRes = await ecsClient.send(
        new DescribeTaskDefinitionCommand({
            taskDefinition: task.taskDefinitionArn,
        }),
    );

    const containers = tdRes.taskDefinition?.containerDefinitions ?? [];
    if (containers.length === 0) return [];

    // Find the first container with awslogs log driver
    const logContainer = containers.find(
        (c) => c.logConfiguration?.logDriver === "awslogs",
    ) ?? containers[0];

    const logConfig = logContainer?.logConfiguration;
    if (!logConfig || logConfig.logDriver !== "awslogs") return [];

    const logGroup = logConfig.options?.["awslogs-group"];
    const logStreamPrefix = logConfig.options?.["awslogs-stream-prefix"];

    if (!logGroup) return [];

    // Build log stream name: prefix/container-name/task-id
    const streamName = logStreamPrefix
        ? `${logStreamPrefix}/${logContainer.name}/${taskId}`
        : undefined;

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

            return (logRes.events ?? []).map((e) => ({
                timestamp: e.timestamp ?? 0,
                message: e.message ?? "",
                ingestionTime: e.ingestionTime ?? 0,
            }));
        }

        // Fallback: find the most recent log stream containing the task ID
        const streamsRes = await logsClient.send(
            new DescribeLogStreamsCommand({
                logGroupName: logGroup,
                logStreamNamePrefix: logStreamPrefix ?? undefined,
                orderBy: "LastEventTime",
                descending: true,
                limit: 10,
            }),
        );

        const matchingStream = streamsRes.logStreams?.find((s) =>
            s.logStreamName?.includes(taskId),
        );

        if (!matchingStream?.logStreamName) return [];

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
    } catch {
        return [];
    }
}

// Not yet implemented — return empty arrays
async function listAlbs(_clusterName: string): Promise<AlbInfo[]> {
    return [];
}

async function listDatabases(_clusterName: string): Promise<DatabaseInstance[]> {
    return [];
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
};
