import {
    ListServicesCommand,
    DescribeServicesCommand,
    UpdateServiceCommand,
    DescribeTaskDefinitionCommand,
    RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import type { ECSClient } from "@aws-sdk/client-ecs";
import { getEcsClient } from "./clients";
import { queryMetrics } from "./cloudwatch";
import { paginateAll } from "./pagination";
import type { ClusterMetrics, EcsService, EcsServiceEvent, EcsDeployment } from "./types";
import { log } from "@/lib/logger";

// ─── Helpers ──────────────────────────────────────────────

/** Fetch average CPU and Memory utilization for a service from CloudWatch (last 5 min) */
async function fetchServiceMetrics(
    clusterName: string,
    serviceName: string,
): Promise<{ cpuUtilization: number; memoryUtilization: number }> {
    try {
        log.ecs.debug(`Fetching metrics for ${clusterName}/${serviceName}...`);

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

        return { cpuUtilization: cpu, memoryUtilization: mem };
    } catch (err) {
        log.ecs.warn(`Failed to fetch metrics for ${clusterName}/${serviceName}`, err);
        return { cpuUtilization: 0, memoryUtilization: 0 };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeployment(d: any): EcsDeployment {
    return {
        id: d.id ?? "",
        status: d.status ?? "",
        taskDefinition: d.taskDefinition?.split("/").pop() ?? d.taskDefinition ?? "",
        desiredCount: d.desiredCount ?? 0,
        runningCount: d.runningCount ?? 0,
        pendingCount: d.pendingCount ?? 0,
        rolloutState: d.rolloutState ?? "",
        rolloutStateReason: d.rolloutStateReason ?? "",
        createdAt: d.createdAt?.toISOString?.() ?? "",
    };
}

/** Map a raw AWS ECS service response to our EcsService type */
function mapService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s: any,
    metrics: { cpuUtilization: number; memoryUtilization: number },
): EcsService {
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
        launchType: s.capacityProviderStrategy?.[0]?.capacityProvider ?? s.launchType ?? "UNKNOWN",
        taskDefinition: taskDef,
        deployments: (s.deployments ?? []).map(mapDeployment),
        createdAt: s.createdAt?.toISOString?.() ?? "",
        metrics: {
            cpuUtilization: metrics.cpuUtilization,
            memoryUtilization: metrics.memoryUtilization,
            cpuReserved,
            memoryReservedMB: memReservedMB,
        },
    };
}

// ─── API ──────────────────────────────────────────────────

/** Paginate ListServices (returns all service ARNs) */
export async function listAllServiceArns(cluster: string): Promise<string[]> {
    log.ecs.debug(`Listing service ARNs for cluster ${cluster}`);
    const arns = await paginateAll(
        (nextToken) => getEcsClient().send(new ListServicesCommand({ cluster, nextToken })),
        (res) => res.serviceArns,
        (res) => res.nextToken,
    );
    log.ecs.debug(`Found ${arns.length} service ARNs for cluster ${cluster}`);
    return arns;
}

/** DescribeServices in batches of 10 (AWS limit) */
export async function describeServicesBatched(cluster: string, arns: string[]) {
    const results: NonNullable<Awaited<ReturnType<ECSClient["send"]>>>[] = [];

    for (let i = 0; i < arns.length; i += 10) {
        const batch = arns.slice(i, i + 10);
        const res = await getEcsClient().send(new DescribeServicesCommand({ cluster, services: batch }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (res.services) results.push(...(res.services as any[]));
    }
    return results;
}

export async function listServices(clusterName: string): Promise<EcsService[]> {
    log.ecs.debug(`Listing services for cluster ${clusterName}`);
    try {
        const arns = await listAllServiceArns(clusterName);
        if (arns.length === 0) {
            log.ecs.debug(`No services found for cluster ${clusterName}`);
            return [];
        }

        const rawServices = await describeServicesBatched(clusterName, arns);

        // Fetch CloudWatch metrics for all services in parallel
        const metricsResults = await Promise.all(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawServices.map((s: any) => fetchServiceMetrics(clusterName, s.serviceName ?? "")),
        );

        return rawServices.map((s, i) => mapService(s, metricsResults[i]));
    } catch (err) {
        log.ecs.error(`Failed to list services for cluster ${clusterName}`, err);
        throw err;
    }
}

export async function getService(clusterName: string, serviceName: string): Promise<EcsService | undefined> {
    log.ecs.debug(`Getting service ${clusterName}/${serviceName}...`);
    const res = await getEcsClient().send(
        new DescribeServicesCommand({
            cluster: clusterName,
            services: [serviceName],
        }),
    );

    const s = res.services?.[0];
    if (!s) return undefined;

    const metrics = await fetchServiceMetrics(clusterName, serviceName);
    return mapService(s, metrics);
}

export async function getServiceEvents(
    clusterName: string,
    serviceName: string,
    limit = 20,
): Promise<EcsServiceEvent[]> {
    log.ecs.debug(`Fetching last ${limit} events for ${clusterName}/${serviceName}`);
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

export async function getClusterMetrics(clusterName: string): Promise<ClusterMetrics> {
    log.ecs.debug(`Fetching cluster metrics for ${clusterName}`);
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
    log.ecs.info(`Updating desired count for service ${clusterName}/${serviceName} to ${desiredCount}`);
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

export async function rollbackService(clusterName: string, serviceName: string, taskDefinition: string): Promise<void> {
    log.ecs.info(`Rolling back ${clusterName}/${serviceName} to ${taskDefinition}`);
    await getEcsClient().send(
        new UpdateServiceCommand({
            cluster: clusterName,
            service: serviceName,
            taskDefinition,
        }),
    );
}

export async function forceNewDeployment(clusterName: string, serviceName: string): Promise<void> {
    log.ecs.info(`Forcing new deployment for ${clusterName}/${serviceName}`);
    await getEcsClient().send(
        new UpdateServiceCommand({
            cluster: clusterName,
            service: serviceName,
            forceNewDeployment: true,
        }),
    );
}

/** Fetch the raw task definition JSON (stripping read-only fields) */
export async function getTaskDefinitionJson(taskDefinition: string): Promise<Record<string, unknown>> {
    log.ecs.debug(`Fetching task definition JSON for ${taskDefinition}`);
    const res = await getEcsClient().send(new DescribeTaskDefinitionCommand({ taskDefinition }));
    const td = res.taskDefinition;
    if (!td) throw new Error(`Task definition ${taskDefinition} not found`);

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
    log.ecs.info(`Registering and deploying task definition for ${clusterName}/${serviceName}`);
    const regRes = await getEcsClient().send(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
