import { DescribeClustersCommand, RunTaskCommand } from "@aws-sdk/client-ecs";
import type { RunTaskCommandInput, TaskOverride } from "@aws-sdk/client-ecs";
import {
    ListRuleNamesByTargetCommand,
    DescribeRuleCommand,
    ListTargetsByRuleCommand,
    EnableRuleCommand,
    DisableRuleCommand,
} from "@aws-sdk/client-eventbridge";
import type { EcsParameters as RuleEcsParameters } from "@aws-sdk/client-eventbridge";
import { ListSchedulesCommand, GetScheduleCommand, UpdateScheduleCommand } from "@aws-sdk/client-scheduler";
import { getEcsClient, getEventsClient, getSchedulerClient } from "./clients";
import { paginateAll } from "./pagination";
import type { ScheduledTask, ScheduledTasksResult } from "./types";
import { log } from "@/lib/logger";

// ─── Helpers ──────────────────────────────────────────────

async function getClusterArn(clusterName: string): Promise<string> {
    const res = await getEcsClient().send(new DescribeClustersCommand({ clusters: [clusterName] }));
    const arn = res.clusters?.[0]?.clusterArn;
    if (!arn) throw new Error(`Cluster ${clusterName} not found`);
    return arn;
}

/** EventBridge rules and EventBridge Scheduler share the same EcsParameters shape */
function mapEcsParameters(p: Omit<RuleEcsParameters, "Tags">) {
    const vpc = p.NetworkConfiguration?.awsvpcConfiguration;
    return {
        taskDefinitionArn: p.TaskDefinitionArn ?? "",
        taskCount: p.TaskCount ?? 1,
        launchType: p.LaunchType,
        capacityProviders: (p.CapacityProviderStrategy ?? []).map((cp) => ({
            capacityProvider: cp.capacityProvider ?? "",
            weight: cp.weight,
            base: cp.base,
        })),
        platformVersion: p.PlatformVersion,
        group: p.Group,
        subnets: vpc?.Subnets ?? [],
        securityGroups: vpc?.SecurityGroups ?? [],
        assignPublicIp: vpc?.AssignPublicIp,
        placementConstraints: p.PlacementConstraints ?? [],
        placementStrategy: p.PlacementStrategy ?? [],
    };
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Classic ECS scheduled tasks: EventBridge rules (default bus) with the cluster as target */
async function listRuleTasks(clusterArn: string): Promise<ScheduledTask[]> {
    const ruleNames = await paginateAll(
        (NextToken) => getEventsClient().send(new ListRuleNamesByTargetCommand({ TargetArn: clusterArn, NextToken })),
        (res) => res.RuleNames,
        (res) => res.NextToken,
    );

    const perRule = await Promise.all(
        ruleNames.map(async (name) => {
            const [rule, targets] = await Promise.all([
                getEventsClient().send(new DescribeRuleCommand({ Name: name })),
                paginateAll(
                    (NextToken) => getEventsClient().send(new ListTargetsByRuleCommand({ Rule: name, NextToken })),
                    (res) => res.Targets,
                    (res) => res.NextToken,
                ),
            ]);
            return targets
                .filter((target) => target.Arn === clusterArn && target.EcsParameters)
                .map((target): ScheduledTask => ({
                    source: "rule",
                    key: `rule:${name}:${target.Id}`,
                    name,
                    targetId: target.Id,
                    description: rule.Description ?? "",
                    scheduleExpression: rule.ScheduleExpression ?? "",
                    eventPattern: rule.EventPattern,
                    state: rule.State ?? "UNKNOWN",
                    input: target.Input,
                    roleArn: target.RoleArn,
                    ...mapEcsParameters(target.EcsParameters!),
                }));
        }),
    );
    return perRule.flat();
}

/** EventBridge Scheduler schedules (all groups) targeting the cluster */
async function listSchedulerTasks(clusterArn: string): Promise<ScheduledTask[]> {
    const summaries = await paginateAll(
        (NextToken) => getSchedulerClient().send(new ListSchedulesCommand({ NextToken })),
        (res) => res.Schedules,
        (res) => res.NextToken,
    );

    return Promise.all(
        summaries
            .filter((s) => s.Target?.Arn === clusterArn)
            .map(async (s): Promise<ScheduledTask> => {
                const sched = await getSchedulerClient().send(
                    new GetScheduleCommand({ Name: s.Name, GroupName: s.GroupName }),
                );
                return {
                    source: "scheduler",
                    key: `scheduler:${s.GroupName}:${s.Name}`,
                    name: s.Name ?? "",
                    groupName: s.GroupName,
                    description: sched.Description ?? "",
                    scheduleExpression: sched.ScheduleExpression ?? "",
                    timezone: sched.ScheduleExpressionTimezone,
                    state: sched.State ?? "UNKNOWN",
                    input: sched.Target?.Input,
                    roleArn: sched.Target?.RoleArn,
                    ...mapEcsParameters(sched.Target?.EcsParameters ?? { TaskDefinitionArn: "" }),
                };
            }),
    );
}

// ─── API ──────────────────────────────────────────────────

export async function listScheduledTasks(clusterName: string): Promise<ScheduledTasksResult> {
    log.ecs.debug(`Listing scheduled tasks for ${clusterName}`);
    const clusterArn = await getClusterArn(clusterName);

    const [rules, schedules] = await Promise.allSettled([listRuleTasks(clusterArn), listSchedulerTasks(clusterArn)]);
    const result: ScheduledTasksResult = { tasks: [], errors: [] };
    if (rules.status === "fulfilled") result.tasks.push(...rules.value);
    else result.errors.push({ source: "rule", message: errorMessage(rules.reason) });
    if (schedules.status === "fulfilled") result.tasks.push(...schedules.value);
    else result.errors.push({ source: "scheduler", message: errorMessage(schedules.reason) });

    result.tasks.sort((a, b) => a.name.localeCompare(b.name));
    return result;
}

export async function setScheduledTaskEnabled(task: ScheduledTask, enabled: boolean): Promise<void> {
    log.ecs.info(`${enabled ? "Enabling" : "Disabling"} ${task.source} ${task.name}`);
    if (task.source === "rule") {
        const Command = enabled ? EnableRuleCommand : DisableRuleCommand;
        await getEventsClient().send(new Command({ Name: task.name }));
        return;
    }

    // UpdateSchedule replaces the whole schedule — re-send the current definition with the new state
    const current = await getSchedulerClient().send(
        new GetScheduleCommand({ Name: task.name, GroupName: task.groupName }),
    );
    await getSchedulerClient().send(
        new UpdateScheduleCommand({
            Name: current.Name,
            GroupName: current.GroupName,
            ScheduleExpression: current.ScheduleExpression,
            ScheduleExpressionTimezone: current.ScheduleExpressionTimezone,
            StartDate: current.StartDate,
            EndDate: current.EndDate,
            Description: current.Description,
            KmsKeyArn: current.KmsKeyArn,
            Target: current.Target,
            FlexibleTimeWindow: current.FlexibleTimeWindow,
            ActionAfterCompletion: current.ActionAfterCompletion,
            State: enabled ? "ENABLED" : "DISABLED",
        }),
    );
}

/** Start the scheduled task immediately with the same parameters (and overrides) its schedule uses */
export async function runScheduledTaskNow(clusterName: string, task: ScheduledTask): Promise<string[]> {
    log.ecs.info(`Running scheduled task ${task.name} now on ${clusterName}`);

    let overrides: TaskOverride | undefined;
    if (task.input) {
        try {
            const parsed = JSON.parse(task.input);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) overrides = parsed;
        } catch {
            throw new Error(`Target input of ${task.name} is not valid JSON`);
        }
    }

    const input: RunTaskCommandInput = {
        cluster: clusterName,
        taskDefinition: task.taskDefinitionArn,
        count: task.taskCount,
        // launchType and capacityProviderStrategy are mutually exclusive
        ...(task.capacityProviders.length > 0
            ? { capacityProviderStrategy: task.capacityProviders }
            : { launchType: task.launchType as RunTaskCommandInput["launchType"] }),
        platformVersion: task.platformVersion,
        group: task.group,
        overrides,
        startedBy: "ecscope",
        placementConstraints: task.placementConstraints as RunTaskCommandInput["placementConstraints"],
        placementStrategy: task.placementStrategy as RunTaskCommandInput["placementStrategy"],
        networkConfiguration:
            task.subnets.length > 0
                ? {
                      awsvpcConfiguration: {
                          subnets: task.subnets,
                          securityGroups: task.securityGroups,
                          assignPublicIp: task.assignPublicIp as "ENABLED" | "DISABLED" | undefined,
                      },
                  }
                : undefined,
    };

    const res = await getEcsClient().send(new RunTaskCommand(input));
    const failure = res.failures?.[0];
    if (failure && !res.tasks?.length) {
        throw new Error(`${failure.reason ?? "RunTask failed"}${failure.detail ? `: ${failure.detail}` : ""}`);
    }
    return (res.tasks ?? []).map((t) => t.taskArn ?? "");
}
