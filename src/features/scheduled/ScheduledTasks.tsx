import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Play, Power, PowerOff, ExternalLink, AlertCircle, CalendarClock, CheckCircle2, X } from "lucide-react";
import { ecsApi } from "@/api";
import type { ScheduledTask } from "@/api/types";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ecsScheduledTasksUrl, schedulerScheduleUrl, openAwsUrl } from "@/lib/aws-urls";

type PendingAction = { kind: "run" | "enable" | "disable"; task: ScheduledTask };

function capacityLabel(task: ScheduledTask): string {
    if (task.capacityProviders.length > 0) return task.capacityProviders.map((cp) => cp.capacityProvider).join(", ");
    return task.launchType ?? "—";
}

export function ScheduledTasks() {
    const { t } = useTranslation();
    const selectedCluster = useNavigationStore((s) => s.selectedCluster);
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const region = useConfigStore((s) => s.credentials?.region ?? s.activeCluster?.region ?? "us-east-1");
    const queryClient = useQueryClient();
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [lastRun, setLastRun] = useState<{ name: string; taskIds: string[] } | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ["scheduledTasks", selectedCluster],
        queryFn: () => ecsApi.listScheduledTasks(selectedCluster!),
        enabled: !!selectedCluster,
        refetchInterval: refreshIntervalMs,
    });

    const actionMutation = useMutation({
        mutationFn: async ({ kind, task }: PendingAction) => {
            if (kind === "run") return ecsApi.runScheduledTaskNow(selectedCluster!, task);
            await ecsApi.setScheduledTaskEnabled(task, kind === "enable");
            return [];
        },
        onSuccess: (taskArns, { kind, task }) => {
            setPending(null);
            if (kind === "run") setLastRun({ name: task.name, taskIds: taskArns.map((a) => a.split("/").pop() ?? a) });
            queryClient.invalidateQueries({ queryKey: ["scheduledTasks", selectedCluster] });
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("scheduled.loading")}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {(error as Error).message}
            </div>
        );
    }

    const tasks = data?.tasks ?? [];

    return (
        <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                    {t("scheduled.title")}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">({tasks.length})</span>
                </h2>
                <button
                    onClick={() => openAwsUrl(ecsScheduledTasksUrl(region, selectedCluster!))}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("common.openConsole")}
                </button>
            </div>

            {data?.errors.map((e) => (
                <div
                    key={e.source}
                    className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
                >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="break-words">
                        <span className="font-medium">
                            {e.source === "rule" ? t("scheduled.rulesFailed") : t("scheduled.schedulerFailed")}
                        </span>{" "}
                        {e.message}
                    </span>
                </div>
            ))}

            {lastRun && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 break-words">
                        {t("scheduled.started", { name: lastRun.name, count: lastRun.taskIds.length })}{" "}
                        <span className="font-mono">{lastRun.taskIds.join(", ")}</span>
                    </span>
                    <button onClick={() => setLastRun(null)} className="rounded p-0.5 hover:bg-success/20">
                        <X className="h-3 w-3" />
                    </button>
                </div>
            )}

            {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <CalendarClock className="h-8 w-8 opacity-40" />
                    {t("scheduled.noTasks")}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                    {t("scheduled.columns.name")}
                                </th>
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                    {t("scheduled.columns.schedule")}
                                </th>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                                    {t("scheduled.columns.state")}
                                </th>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                                    {t("scheduled.columns.taskDef")}
                                </th>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                                    {t("scheduled.columns.launch")}
                                </th>
                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                                    {t("scheduled.columns.actions")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((task) => {
                                const enabled = task.state === "ENABLED";
                                const busy =
                                    actionMutation.isPending && actionMutation.variables?.task.key === task.key;
                                return (
                                    <tr
                                        key={task.key}
                                        className="border-b border-border last:border-b-0 hover:bg-accent/50"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">{task.name}</span>
                                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                                    {task.source === "rule"
                                                        ? t("scheduled.sourceRule")
                                                        : t("scheduled.sourceScheduler", { group: task.groupName })}
                                                </span>
                                            </div>
                                            {task.description && (
                                                <div className="mt-0.5 text-xs text-muted-foreground">
                                                    {task.description}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {task.scheduleExpression ? (
                                                <span className="font-mono text-xs text-foreground">
                                                    {task.scheduleExpression}
                                                </span>
                                            ) : (
                                                <span
                                                    className="text-xs italic text-muted-foreground"
                                                    title={task.eventPattern}
                                                >
                                                    {t("scheduled.eventPattern")}
                                                </span>
                                            )}
                                            {task.timezone && (
                                                <div className="text-[11px] text-muted-foreground">{task.timezone}</div>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            <StatusBadge status={task.state} />
                                        </td>
                                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                                            {task.taskDefinitionArn.split("/").pop()}
                                            {task.taskCount > 1 && (
                                                <span className="ml-1 text-foreground">×{task.taskCount}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-xs text-muted-foreground">
                                            {capacityLabel(task)}
                                            {task.subnets.length > 0 && (
                                                <div
                                                    className="text-[11px]"
                                                    title={[...task.subnets, ...task.securityGroups].join("\n")}
                                                >
                                                    {t("scheduled.network", {
                                                        subnets: task.subnets.length,
                                                        sgs: task.securityGroups.length,
                                                    })}
                                                    {task.assignPublicIp === "ENABLED" &&
                                                        ` · ${t("scheduled.publicIp")}`}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => setPending({ kind: "run", task })}
                                                    disabled={busy}
                                                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                                                    title={t("scheduled.runNow")}
                                                >
                                                    <Play className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setPending({ kind: enabled ? "disable" : "enable", task })
                                                    }
                                                    disabled={busy}
                                                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                                                    title={enabled ? t("scheduled.disable") : t("scheduled.enable")}
                                                >
                                                    {enabled ? (
                                                        <PowerOff className="h-3.5 w-3.5" />
                                                    ) : (
                                                        <Power className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        openAwsUrl(
                                                            task.source === "rule"
                                                                ? ecsScheduledTasksUrl(region, selectedCluster!)
                                                                : schedulerScheduleUrl(
                                                                      region,
                                                                      task.groupName ?? "default",
                                                                      task.name,
                                                                  ),
                                                        )
                                                    }
                                                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                                    title={t("common.openConsole")}
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {actionMutation.error && (
                <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {(actionMutation.error as Error).message}
                </div>
            )}

            <ConfirmDialog
                open={!!pending}
                title={
                    pending?.kind === "run"
                        ? t("scheduled.runNowTitle")
                        : pending?.kind === "enable"
                          ? t("scheduled.enableTitle")
                          : t("scheduled.disableTitle")
                }
                message={
                    pending?.kind === "run"
                        ? t("scheduled.runNowMessage", { count: pending.task.taskCount })
                        : pending?.kind === "enable"
                          ? t("scheduled.enableMessage")
                          : t("scheduled.disableMessage")
                }
                detail={pending?.task.name}
                confirmLabel={
                    pending?.kind === "run"
                        ? t("scheduled.runNow")
                        : pending?.kind === "enable"
                          ? t("scheduled.enable")
                          : t("scheduled.disable")
                }
                confirmingLabel={t("common.working")}
                variant={pending?.kind === "disable" ? "destructive" : "default"}
                isPending={actionMutation.isPending}
                onConfirm={() => actionMutation.mutate(pending!)}
                onCancel={() => {
                    setPending(null);
                    actionMutation.reset();
                }}
            />
        </div>
    );
}
