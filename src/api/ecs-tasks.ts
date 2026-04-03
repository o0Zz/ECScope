import {
    ListTasksCommand,
    DescribeTasksCommand,
    DescribeTaskDefinitionCommand,
    StopTaskCommand,
    DescribeContainerInstancesCommand,
} from "@aws-sdk/client-ecs";
import { GetParametersCommand } from "@aws-sdk/client-ssm";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { getEcsClient, getSsmClient, getSmClient } from "./clients";
import { paginateAll } from "./pagination";
import type { EcsTask } from "./types";
import { log } from "@/lib/logger";

// ─── Helpers ──────────────────────────────────────────────

async function paginateTaskArns(
    clusterName: string,
    serviceName: string,
    desiredStatus: "RUNNING" | "STOPPED",
): Promise<string[]> {
    return paginateAll(
        (nextToken) =>
            getEcsClient().send(new ListTasksCommand({ cluster: clusterName, serviceName, desiredStatus, nextToken })),
        (res) => res.taskArns,
        (res) => res.nextToken,
    );
}

async function resolveEc2InstanceIds(clusterName: string, allTasks: EcsTask[]): Promise<void> {
    const ciArns = [...new Set(allTasks.map((t) => t.containerInstanceArn).filter(Boolean))];
    if (ciArns.length === 0) return;

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

async function resolveTaskDefinitionEnvs(allTasks: EcsTask[]): Promise<void> {
    const tdArns = [...new Set(allTasks.map((t) => t.taskDefinitionArn).filter(Boolean))];
    const tdEnvMap = new Map<
        string,
        Map<
            string,
            {
                env: { name: string; value: string }[];
                secrets: { name: string; valueFrom: string }[];
                logGroup?: string;
                logStreamPrefix?: string;
            }
        >
    >();

    await Promise.all(
        tdArns.map(async (tdArn) => {
            try {
                const tdRes = await getEcsClient().send(new DescribeTaskDefinitionCommand({ taskDefinition: tdArn }));
                const containerEnvs = new Map<
                    string,
                    {
                        env: { name: string; value: string }[];
                        secrets: { name: string; valueFrom: string }[];
                        logGroup?: string;
                        logStreamPrefix?: string;
                    }
                >();
                for (const cd of tdRes.taskDefinition?.containerDefinitions ?? []) {
                    const logOpts =
                        cd.logConfiguration?.logDriver === "awslogs" ? cd.logConfiguration.options : undefined;
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
                log.ecs.warn(`Failed to describe task definition ${tdArn}`, err);
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
}

async function resolveSecretValues(allTasks: EcsTask[]): Promise<void> {
    const allSecretRefs = new Map<string, string>();
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
                    ssmNames.push(secret.valueFrom);
                }
            }
        }
    }

    // Resolve SSM parameters in batches of 10
    for (let i = 0; i < ssmNames.length; i += 10) {
        const batch = ssmNames.slice(i, i + 10);
        try {
            const res = await getSsmClient().send(new GetParametersCommand({ Names: batch, WithDecryption: true }));
            for (const p of res.Parameters ?? []) {
                const ref = batch.find((n) => n === p.Name || n === p.ARN) ?? p.Name ?? "";
                if (ref) allSecretRefs.set(ref, p.Value ?? "");
            }
        } catch (err) {
            log.ecs.warn(`Failed to resolve SSM parameters [${batch.join(", ")}]`, err);
        }
    }

    // Resolve Secrets Manager secrets (one at a time; they don't support batch)
    await Promise.all(
        smArns.map(async (arn) => {
            try {
                const baseArn = arn.split(":").length > 7 ? arn.split(":").slice(0, 7).join(":") : arn;
                const jsonKeyMatch = arn.match(/:([^:]+)::$/);
                const jsonKey = jsonKeyMatch?.[1];

                const res = await getSmClient().send(new GetSecretValueCommand({ SecretId: baseArn }));
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
                log.ecs.warn(`Failed to resolve secret ${arn}`, err);
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
}

// ─── API ──────────────────────────────────────────────────

export async function listTasks(clusterName: string, serviceName: string): Promise<EcsTask[]> {
    log.ecs.debug(`Listing tasks for ${clusterName}/${serviceName}`);

    const [runningArns, stoppedArns] = await Promise.all([
        paginateTaskArns(clusterName, serviceName, "RUNNING"),
        paginateTaskArns(clusterName, serviceName, "STOPPED"),
    ]);

    const taskArns = [...runningArns, ...stoppedArns];
    if (taskArns.length === 0) return [];

    const allTasks: EcsTask[] = [];
    for (let i = 0; i < taskArns.length; i += 100) {
        const batch = taskArns.slice(i, i + 100);
        const descRes = await getEcsClient().send(new DescribeTasksCommand({ cluster: clusterName, tasks: batch }));

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

    await resolveEc2InstanceIds(clusterName, allTasks);
    await resolveTaskDefinitionEnvs(allTasks);
    await resolveSecretValues(allTasks);

    return allTasks;
}

export async function stopTask(clusterName: string, taskArn: string, reason = "Stopped via ECScope"): Promise<void> {
    log.ecs.info(`Stopping task ${taskArn} on cluster ${clusterName}`);
    await getEcsClient().send(
        new StopTaskCommand({
            cluster: clusterName,
            task: taskArn,
            reason,
        }),
    );
}
