import {
    DescribeClustersCommand,
    ListServicesCommand,
    DescribeServicesCommand,
    ListTasksCommand,
    DescribeTasksCommand,
    DescribeTaskDefinitionCommand,
    UpdateServiceCommand,
    StopTaskCommand,
    RegisterTaskDefinitionCommand,
    ListContainerInstancesCommand,
    DescribeContainerInstancesCommand,
} from "@aws-sdk/client-ecs";
import type { ECSClient } from "@aws-sdk/client-ecs";
import { GetParametersCommand } from "@aws-sdk/client-ssm";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { getEcsClient, getSsmClient, getSmClient, getEc2Client, getConfiguredCluster } from "./clients";
import { queryMetrics } from "./cloudwatch";
import type {
    EcsCluster,
    ClusterMetrics,
    EcsService,
    EcsServiceEvent,
    EcsTask,
    ContainerInstance,
} from "./types";
import { DescribeInstancesCommand, DescribeSubnetsCommand } from "@aws-sdk/client-ec2";

// ─── Helpers ──────────────────────────────────────────────

/** Fetch average CPU and Memory utilization for a service from CloudWatch (last 5 min) */
async function fetchServiceMetrics(
    clusterName: string,
    serviceName: string,
): Promise<{ cpuUtilization: number; memoryUtilization: number }> {
    try {
        const dims = [
            { Name: "ClusterName" as const, Value: clusterName },
            { Name: "ServiceName" as const, Value: serviceName },
        ];
        const { values } = await queryMetrics(
            [
                { id: "cpu", namespace: "AWS/ECS", metricName: "CPUUtilization", dimensions: dims, stat: "Average" },
                { id: "mem", namespace: "AWS/ECS", metricName: "MemoryUtilization", dimensions: dims, stat: "Average" },
            ],
            300,
            5 * 60 * 1000,
        );
        const cpuVals = values.get("cpu") ?? [];
        const memVals = values.get("mem") ?? [];
        const cpu = cpuVals.length > 0 ? Math.round(cpuVals[0] * 10) / 10 : 0;
        const mem = memVals.length > 0 ? Math.round(memVals[0] * 10) / 10 : 0;

        console.log(`[aws] metrics for ${serviceName}:`, { cpu, mem });
        return { cpuUtilization: cpu, memoryUtilization: mem };
    } catch (err) {
        console.warn(`[aws] Failed to fetch metrics for ${serviceName}:`, err);
        return { cpuUtilization: 0, memoryUtilization: 0 };
    }
}

/** Paginate ListServices (returns all service ARNs) */
export async function listAllServiceArns(cluster: string): Promise<string[]> {
    console.log("[aws] listAllServiceArns called", { cluster });
    const arns: string[] = [];
    let nextToken: string | undefined;
    do {
        const res = await getEcsClient().send(
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
export async function describeServicesBatched(
    cluster: string,
    arns: string[],
) {
    const results: NonNullable<
        Awaited<ReturnType<ECSClient["send"]>>
    >[] = [];

    for (let i = 0; i < arns.length; i += 10) {
        const batch = arns.slice(i, i + 10);
        const res = await getEcsClient().send(
            new DescribeServicesCommand({ cluster, services: batch }),
        );
        if (res.services) results.push(...(res.services as any[]));
    }
    return results;
}

// ─── API Implementation ──────────────────────────────────

export async function listClusters(): Promise<EcsCluster[]> {
    const configuredCluster = getConfiguredCluster();
    console.log("[aws] listClusters called", { configuredCluster, hasEcsClient: !!getEcsClient() });
    const desc = await getEcsClient().send(
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

export async function getCluster(
    clusterName: string,
): Promise<EcsCluster | undefined> {
    const clusters = await listClusters();
    return clusters.find((c) => c.clusterName === clusterName);
}

export async function listServices(clusterName: string): Promise<EcsService[]> {
    console.log("[aws] listServices called", { clusterName, hasEcsClient: !!getEcsClient() });
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
                    taskDefinition: d.taskDefinition?.split("/").pop() ?? d.taskDefinition ?? "",
                    desiredCount: d.desiredCount ?? 0,
                    runningCount: d.runningCount ?? 0,
                    pendingCount: d.pendingCount ?? 0,
                    rolloutState: d.rolloutState ?? "",
                    rolloutStateReason: d.rolloutStateReason ?? "",
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

export async function getService(
    clusterName: string,
    serviceName: string,
): Promise<EcsService | undefined> {
    console.log("[aws] getService called", { clusterName, serviceName });
    const res = await getEcsClient().send(
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
            taskDefinition: d.taskDefinition?.split("/").pop() ?? d.taskDefinition ?? "",
            desiredCount: d.desiredCount ?? 0,
            runningCount: d.runningCount ?? 0,
            pendingCount: d.pendingCount ?? 0,
            rolloutState: d.rolloutState ?? "",
            rolloutStateReason: d.rolloutStateReason ?? "",
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

export async function getServiceEvents(
    clusterName: string,
    serviceName: string,
    limit = 20,
): Promise<EcsServiceEvent[]> {
    console.log("[aws] getServiceEvents called", { clusterName, serviceName, limit });
    const res = await getEcsClient().send(
        new DescribeServicesCommand({
            cluster: clusterName,
            services: [serviceName],
        }),
    );

    const events = res.services?.[0]?.events ?? [];
    return events.slice(0, limit).map((e) => ({
        id: e.id ?? "",
        createdAt: e.createdAt?.toISOString?.() ?? "",
        message: e.message ?? "",
    }));
}

export async function listTasks(
    clusterName: string,
    serviceName: string,
): Promise<EcsTask[]> {
    console.log("[aws] listTasks called", { clusterName, serviceName });
    // Fetch both RUNNING and STOPPED tasks
    const [runningRes, stoppedRes] = await Promise.all([
        getEcsClient().send(
            new ListTasksCommand({ cluster: clusterName, serviceName, desiredStatus: "RUNNING" }),
        ),
        getEcsClient().send(
            new ListTasksCommand({ cluster: clusterName, serviceName, desiredStatus: "STOPPED" }),
        ),
    ]);

    const taskArns = [
        ...(runningRes.taskArns ?? []),
        ...(stoppedRes.taskArns ?? []),
    ];
    if (taskArns.length === 0) return [];

    const allTasks: EcsTask[] = [];
    for (let i = 0; i < taskArns.length; i += 100) {
        const batch = taskArns.slice(i, i + 100);
        const descRes = await getEcsClient().send(
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
                stoppedAt: t.stoppedAt?.toISOString?.() ?? "",
                stoppedReason: t.stoppedReason ?? "",
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
                    runtimeId: c.runtimeId ?? "",
                    reason: c.reason ?? "",
                    exitCode: c.exitCode ?? null,
                    networkBindings: (c.networkBindings ?? []).map((nb) => ({
                        containerPort: nb.containerPort ?? 0,
                        hostPort: nb.hostPort ?? 0,
                        protocol: nb.protocol ?? "tcp",
                    })),
                    environment: [],
                    secrets: [],
                })),
            });
        }
    }

    // Resolve EC2 instance IDs from container instance ARNs
    const ciArns = [...new Set(allTasks.map((t) => t.containerInstanceArn).filter(Boolean))];
    if (ciArns.length > 0) {
        const ciRes = await getEcsClient().send(
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

    // Resolve environment variables from task definitions
    const tdArns = [...new Set(allTasks.map((t) => t.taskDefinitionArn).filter(Boolean))];
    const tdEnvMap = new Map<string, Map<string, { env: { name: string; value: string }[]; secrets: { name: string; valueFrom: string }[]; logGroup?: string; logStreamPrefix?: string }>>();
    await Promise.all(
        tdArns.map(async (tdArn) => {
            try {
                const tdRes = await getEcsClient().send(
                    new DescribeTaskDefinitionCommand({ taskDefinition: tdArn }),
                );
                const containerEnvs = new Map<string, { env: { name: string; value: string }[]; secrets: { name: string; valueFrom: string }[]; logGroup?: string; logStreamPrefix?: string }>();
                for (const cd of tdRes.taskDefinition?.containerDefinitions ?? []) {
                    const logOpts = cd.logConfiguration?.logDriver === "awslogs" ? cd.logConfiguration.options : undefined;
                    containerEnvs.set(cd.name ?? "", {
                        env: (cd.environment ?? []).map((e) => ({
                            name: e.name ?? "",
                            value: e.value ?? "",
                        })),
                        secrets: (cd.secrets ?? []).map((s) => ({
                            name: s.name ?? "",
                            valueFrom: s.valueFrom ?? "",
                        })),
                        logGroup: logOpts?.["awslogs-group"],
                        logStreamPrefix: logOpts?.["awslogs-stream-prefix"],
                    });
                }
                tdEnvMap.set(tdArn, containerEnvs);
            } catch (err) {
                console.warn(`[aws] Failed to describe task definition ${tdArn}:`, err);
            }
        }),
    );
    for (const task of allTasks) {
        const containerEnvs = tdEnvMap.get(task.taskDefinitionArn);
        if (containerEnvs) {
            for (const container of task.containers) {
                const defs = containerEnvs.get(container.name);
                container.environment = defs?.env ?? [];
                container.secrets = (defs?.secrets ?? []).map((s) => ({
                    name: s.name,
                    valueFrom: s.valueFrom,
                }));
                container.logGroup = defs?.logGroup;
                container.logStreamPrefix = defs?.logStreamPrefix;
            }
        }
    }

    // Resolve secret values from SSM Parameter Store and Secrets Manager
    const allSecretRefs = new Map<string, string>(); // valueFrom -> resolved value
    const ssmNames: string[] = [];
    const smArns: string[] = [];

    for (const task of allTasks) {
        for (const container of task.containers) {
            for (const secret of container.secrets) {
                if (allSecretRefs.has(secret.valueFrom)) continue;
                allSecretRefs.set(secret.valueFrom, "");
                if (secret.valueFrom.startsWith("arn:aws:secretsmanager:")) {
                    smArns.push(secret.valueFrom);
                } else {
                    // SSM parameter — can be a name or an ARN
                    ssmNames.push(secret.valueFrom.startsWith("arn:") ? secret.valueFrom : secret.valueFrom);
                }
            }
        }
    }

    // Resolve SSM parameters in batches of 10
    for (let i = 0; i < ssmNames.length; i += 10) {
        const batch = ssmNames.slice(i, i + 10);
        try {
            const res = await getSsmClient().send(
                new GetParametersCommand({ Names: batch, WithDecryption: true }),
            );
            for (const p of res.Parameters ?? []) {
                // Match by Name or ARN
                const ref = batch.find((n) => n === p.Name || n === p.ARN) ?? p.Name ?? "";
                if (ref) allSecretRefs.set(ref, p.Value ?? "");
            }
        } catch (err) {
            console.warn("[aws] Failed to resolve SSM parameters:", batch, err);
        }
    }

    // Resolve Secrets Manager secrets (one at a time; they don't support batch)
    await Promise.all(
        smArns.map(async (arn) => {
            try {
                // Handle ARN with JSON key suffix: arn:...:secret-name:key::
                const baseArn = arn.split(":").length > 7 ? arn.split(":").slice(0, 7).join(":") : arn;
                const jsonKeyMatch = arn.match(/:([^:]+)::$/);
                const jsonKey = jsonKeyMatch?.[1];

                const res = await getSmClient().send(
                    new GetSecretValueCommand({ SecretId: baseArn }),
                );
                let value = res.SecretString ?? "";
                if (jsonKey && value) {
                    try {
                        const parsed = JSON.parse(value);
                        value = typeof parsed[jsonKey] === "string" ? parsed[jsonKey] : JSON.stringify(parsed[jsonKey]);
                    } catch {
                        // Not JSON, keep raw value
                    }
                }
                allSecretRefs.set(arn, value);
            } catch (err) {
                console.warn("[aws] Failed to resolve Secrets Manager secret:", arn, err);
            }
        }),
    );

    // Apply resolved values to containers
    for (const task of allTasks) {
        for (const container of task.containers) {
            for (const secret of container.secrets) {
                secret.resolvedValue = allSecretRefs.get(secret.valueFrom) || undefined;
            }
        }
    }

    return allTasks;
}

export async function getClusterMetrics(
    clusterName: string,
): Promise<ClusterMetrics> {
    console.log("[aws] getClusterMetrics called", { clusterName });
    const services = await listServices(clusterName);

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

export async function updateServiceDesiredCount(
    clusterName: string,
    serviceName: string,
    desiredCount: number,
): Promise<EcsService> {
    console.log("[aws] updateServiceDesiredCount called", { clusterName, serviceName, desiredCount });
    await getEcsClient().send(
        new UpdateServiceCommand({
            cluster: clusterName,
            service: serviceName,
            desiredCount: Math.max(0, desiredCount),
        }),
    );

    const updated = await getService(clusterName, serviceName);
    if (!updated) throw new Error(`Service ${serviceName} not found after update`);
    return updated;
}

export async function stopTask(
    clusterName: string,
    taskArn: string,
    reason = "Stopped via ECScope",
): Promise<void> {
    console.log("[aws] stopTask called", { clusterName, taskArn });
    await getEcsClient().send(
        new StopTaskCommand({
            cluster: clusterName,
            task: taskArn,
            reason,
        }),
    );
}

export async function rollbackService(
    clusterName: string,
    serviceName: string,
    taskDefinition: string,
): Promise<void> {
    console.log("[aws] rollbackService called", { clusterName, serviceName, taskDefinition });
    await getEcsClient().send(
        new UpdateServiceCommand({
            cluster: clusterName,
            service: serviceName,
            taskDefinition,
        }),
    );
}

export async function forceNewDeployment(
    clusterName: string,
    serviceName: string,
): Promise<void> {
    console.log("[aws] forceNewDeployment called", { clusterName, serviceName });
    await getEcsClient().send(
        new UpdateServiceCommand({
            cluster: clusterName,
            service: serviceName,
            forceNewDeployment: true,
        }),
    );
}

/** Fetch the raw task definition JSON (stripping read-only fields) */
export async function getTaskDefinitionJson(
    taskDefinition: string,
): Promise<Record<string, unknown>> {
    console.log("[aws] getTaskDefinitionJson called", { taskDefinition });
    const res = await getEcsClient().send(
        new DescribeTaskDefinitionCommand({ taskDefinition }),
    );
    const td = res.taskDefinition;
    if (!td) throw new Error(`Task definition ${taskDefinition} not found`);

    // Convert to plain object and strip read-only fields that can't be passed to RegisterTaskDefinition
    const raw = { ...td } as Record<string, unknown>;
    delete raw.taskDefinitionArn;
    delete raw.revision;
    delete raw.status;
    delete raw.requiresAttributes;
    delete raw.compatibilities;
    delete raw.registeredAt;
    delete raw.registeredBy;
    delete raw.deregisteredAt;
    return raw;
}

/** Register a new task definition revision from JSON and update the service */
export async function registerAndDeployTaskDefinition(
    clusterName: string,
    serviceName: string,
    taskDefJson: Record<string, unknown>,
): Promise<string> {
    console.log("[aws] registerAndDeployTaskDefinition called", { clusterName, serviceName });
    const regRes = await getEcsClient().send(
        new RegisterTaskDefinitionCommand(taskDefJson as any),
    );
    const newArn = regRes.taskDefinition?.taskDefinitionArn;
    if (!newArn) throw new Error("Failed to register task definition");

    await getEcsClient().send(
        new UpdateServiceCommand({
            cluster: clusterName,
            service: serviceName,
            taskDefinition: newArn,
            forceNewDeployment: true,
        }),
    );
    return newArn;
}

export async function listContainerInstances(
    clusterName: string,
): Promise<ContainerInstance[]> {
    console.log("[aws] listContainerInstances called", { clusterName });
    const listRes = await getEcsClient().send(
        new ListContainerInstancesCommand({ cluster: clusterName }),
    );

    const ciArns = listRes.containerInstanceArns ?? [];
    if (ciArns.length === 0) return [];

    const descRes = await getEcsClient().send(
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
            registeredAt: ci.registeredAt ? new Date(ci.registeredAt).getTime() : undefined,
        };
    });
}

/**
 * Discover the VPC of an ECS cluster by inspecting its container instances' EC2 data,
 * or by inspecting the service network configuration subnets.
 */
export async function getClusterVpcId(clusterName: string): Promise<string | null> {
    console.log("[aws] getClusterVpcId called", { clusterName });
    // Try to get VPC from container instances first (EC2 launch type)
    const listRes = await getEcsClient().send(
        new ListContainerInstancesCommand({ cluster: clusterName }),
    );
    const ciArns = listRes.containerInstanceArns ?? [];

    if (ciArns.length > 0) {
        const descRes = await getEcsClient().send(
            new DescribeContainerInstancesCommand({
                cluster: clusterName,
                containerInstances: ciArns.slice(0, 1),
            }),
        );
        const ec2Id = descRes.containerInstances?.[0]?.ec2InstanceId;
        if (ec2Id) {
            const ec2Res = await getEc2Client().send(
                new DescribeInstancesCommand({ InstanceIds: [ec2Id] }),
            );
            const vpcId = ec2Res.Reservations?.[0]?.Instances?.[0]?.VpcId;
            if (vpcId) return vpcId;
        }
    }

    // Fallback: look at the first service's awsvpc config subnet to derive VPC
    const arns = await listAllServiceArns(clusterName);
    if (arns.length > 0) {
        const svcRes = await getEcsClient().send(
            new DescribeServicesCommand({ cluster: clusterName, services: [arns[0]] }),
        );
        const subnets = svcRes.services?.[0]?.networkConfiguration?.awsvpcConfiguration?.subnets;
        if (subnets?.length) {
            const subnetRes = await getEc2Client().send(
                new DescribeSubnetsCommand({ SubnetIds: [subnets[0]] }),
            );
            const vpcId = subnetRes.Subnets?.[0]?.VpcId;
            if (vpcId) return vpcId;
        }
    }

    console.log("[aws] getClusterVpcId: could not determine VPC");
    return null;
}
