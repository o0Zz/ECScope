export interface ScheduledTask {
    /** EventBridge rule (classic ECS "scheduled tasks") or EventBridge Scheduler schedule */
    source: "rule" | "scheduler";
    /** Unique within the list (rule + target id, or group + schedule name) */
    key: string;
    name: string;
    /** Scheduler group name (scheduler only) */
    groupName?: string;
    /** Rule target id (rules only) */
    targetId?: string;
    description: string;
    /** cron(...) / rate(...) / at(...); empty for event-pattern rules */
    scheduleExpression: string;
    /** Set for rules triggered by an event pattern instead of a schedule */
    eventPattern?: string;
    timezone?: string;
    state: string;
    taskDefinitionArn: string;
    taskCount: number;
    launchType?: string;
    capacityProviders: { capacityProvider: string; weight?: number; base?: number }[];
    platformVersion?: string;
    group?: string;
    subnets: string[];
    securityGroups: string[];
    assignPublicIp?: string;
    placementConstraints: { type?: string; expression?: string }[];
    placementStrategy: { type?: string; field?: string }[];
    /** Target input JSON (task overrides) */
    input?: string;
    roleArn?: string;
}

export interface ScheduledTasksResult {
    tasks: ScheduledTask[];
    /** Per-source failures (e.g. missing IAM permission) — the other source still loads */
    errors: { source: ScheduledTask["source"]; message: string }[];
}
