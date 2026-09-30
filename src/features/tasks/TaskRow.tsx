import type { EcsTask, EcsContainer } from "@/api/types";
import { StatusBadge } from "@/components/StatusBadge";
import {
    Container,
    Server,
    ChevronDown,
    FileCode,
    Terminal,
    ScrollText,
    Square,
    AlertTriangle,
    Radio,
    ExternalLink,
    FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatAge } from "@/lib/format";
import { openEcsExec, openTaskLogs, openHttpCapture } from "./TaskActions";
import { CaptureConfigDialog, type CaptureConfig } from "./CaptureConfigDialog";
import { EnvVarPanel } from "./EnvVarPanel";
import { LogViewer, type LogTarget } from "./LogViewer";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ecsTaskUrl, openAwsUrl } from "@/lib/aws-urls";

/** Well-known container exit codes → translation key */
const EXIT_HINTS: Record<number, string> = {
    0: "tasks.exitHints.ok",
    1: "tasks.exitHints.error",
    126: "tasks.exitHints.notExecutable",
    127: "tasks.exitHints.notFound",
    134: "tasks.exitHints.abort",
    137: "tasks.exitHints.sigkill",
    139: "tasks.exitHints.segfault",
    143: "tasks.exitHints.sigterm",
};

/** awslogs stream naming: "<prefix>/<container>/<taskId>", or the Docker container id when no prefix is set */
function containerLogTarget(c: EcsContainer, taskId: string): LogTarget | null {
    if (!c.logGroup) return null;
    const streamName = c.logStreamPrefix ? `${c.logStreamPrefix}/${c.name}/${taskId}` : c.runtimeId;
    if (!streamName) return null;
    return { label: c.name, logGroup: c.logGroup, source: { kind: "stream", streamName } };
}

export function TaskRow({
    task,
    expanded,
    onToggleEnv,
    onStop,
    isStopping,
    clusterName,
    serviceName,
    profile,
    region,
}: {
    task: EcsTask;
    expanded: boolean;
    onToggleEnv: () => void;
    onStop: () => void;
    isStopping: boolean;
    clusterName: string;
    serviceName: string;
    profile: string;
    region: string;
}) {
    const { t } = useTranslation();
    const taskId = task.taskArn.split("/").pop() ?? "";
    const containerName = task.containers[0]?.name ?? "";
    const container = task.containers[0];
    const canStreamLogs = !!task.ec2InstanceId && !!container?.runtimeId;
    const canHttpCapture = !!task.ec2InstanceId && !!container?.runtimeId;
    const isStopped = task.lastStatus === "STOPPED";
    const actionParams = { profile, region };
    const [captureDialogOpen, setCaptureDialogOpen] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const logTargets = task.containers
        .map((c) => containerLogTarget(c, taskId))
        .filter((target): target is LogTarget => target !== null);
    const exitedContainers = task.containers.filter((c) => c.exitCode != null || c.reason);

    const handleExec = (e: React.MouseEvent) => {
        e.stopPropagation();
        openEcsExec(clusterName, taskId, containerName, actionParams);
    };

    const handleLogs = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canStreamLogs) return;
        openTaskLogs(task.ec2InstanceId!, container.runtimeId!, container.name, actionParams);
    };

    const handleHttpCapture = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canHttpCapture) return;
        setCaptureDialogOpen(true);
    };

    const handleCaptureConfirm = (config: CaptureConfig) => {
        setCaptureDialogOpen(false);
        openHttpCapture(task.ec2InstanceId!, container.runtimeId!, container.name, actionParams, config);
    };

    return (
        <>
            <tr className="border-b border-border last:border-b-0 hover:bg-accent/50">
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Container className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <span className="font-mono text-xs font-medium text-foreground">{taskId}</span>
                            {task.lastStatus === "STOPPED" && task.stoppedReason && (
                                <div className="mt-0.5 flex items-start gap-1">
                                    <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                                    <span className="text-[11px] text-warning break-words">
                                        {task.stopCode && <span className="font-medium">{task.stopCode}: </span>}
                                        {task.stoppedReason}
                                    </span>
                                </div>
                            )}
                            {isStopped &&
                                exitedContainers.map((c) => (
                                    <div key={c.name} className="mt-0.5 text-[11px] text-muted-foreground break-words">
                                        <span className="font-mono text-foreground">{c.name}</span>
                                        {c.exitCode != null && (
                                            <span
                                                className={cn(
                                                    "ml-1 rounded px-1 font-mono",
                                                    c.exitCode === 0
                                                        ? "bg-success/15 text-success"
                                                        : "bg-destructive/15 text-destructive",
                                                )}
                                            >
                                                {t("tasks.exitCode", { code: c.exitCode })}
                                                {EXIT_HINTS[c.exitCode] && ` · ${t(EXIT_HINTS[c.exitCode])}`}
                                            </span>
                                        )}
                                        {c.reason && <span className="ml-1">{c.reason}</span>}
                                    </div>
                                ))}
                        </div>
                    </div>
                </td>
                <td className="px-4 py-3">
                    <StatusBadge status={task.lastStatus} />
                    {task.lastStatus === "STOPPED" && task.stoppedAt && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatAge(task.stoppedAt)} {t("common.ago")}
                        </div>
                    )}
                </td>
                <td className="px-4 py-3">
                    <StatusBadge status={task.healthStatus} />
                </td>
                <td className="px-3 py-3 text-muted-foreground">{task.launchType}</td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {task.cpu} / {task.memory} {t("common.mb")}
                </td>
                <td className="px-3 py-3">
                    {task.ec2InstanceId ? (
                        <div className="flex items-center gap-1.5">
                            <Server className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-mono text-xs text-foreground">{task.ec2InstanceId}</span>
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground">{t("tasks.fargate")}</span>
                    )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatAge(task.startedAt)}
                </td>
                <td className="px-3 py-3 text-muted-foreground">{task.containers.length}</td>
                <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openAwsUrl(ecsTaskUrl(region, clusterName, taskId));
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title={t("common.openConsole")}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStop();
                            }}
                            disabled={isStopping || isStopped}
                            className="rounded p-1 transition-colors text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                            title={t("tasks.actions.stopTask")}
                        >
                            <Square className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={handleExec}
                            disabled={isStopped}
                            className={cn(
                                "rounded p-1 transition-colors",
                                isStopped
                                    ? "text-muted-foreground/30 cursor-not-allowed"
                                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                            title={t("tasks.actions.shell", { name: containerName })}
                        >
                            <Terminal className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={handleLogs}
                            className={cn(
                                "rounded p-1 transition-colors hover:bg-accent",
                                isStopped || !canStreamLogs
                                    ? "text-muted-foreground/30 cursor-not-allowed"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                            title={
                                isStopped
                                    ? t("tasks.actions.taskStopped")
                                    : canStreamLogs
                                      ? t("tasks.actions.liveLogs", { name: containerName })
                                      : t("tasks.actions.dockerLogsEc2Only")
                            }
                            disabled={isStopped || !canStreamLogs}
                        >
                            <ScrollText className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setLogsOpen(true);
                            }}
                            disabled={logTargets.length === 0}
                            className={cn(
                                "rounded p-1 transition-colors hover:bg-accent",
                                logTargets.length === 0
                                    ? "text-muted-foreground/30 cursor-not-allowed"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                            title={
                                logTargets.length > 0
                                    ? t("tasks.actions.cloudwatchLogs")
                                    : t("tasks.actions.cloudwatchLogsUnavailable")
                            }
                        >
                            <FileText className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={handleHttpCapture}
                            className={cn(
                                "rounded p-1 transition-colors hover:bg-accent",
                                isStopped || !canHttpCapture
                                    ? "text-muted-foreground/30 cursor-not-allowed"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                            title={
                                isStopped
                                    ? t("tasks.actions.taskStopped")
                                    : canHttpCapture
                                      ? t("tasks.actions.httpCapture", { name: containerName })
                                      : t("tasks.actions.httpCaptureEc2Only")
                            }
                            disabled={isStopped || !canHttpCapture}
                        >
                            <Radio className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleEnv();
                            }}
                            className={cn(
                                "rounded p-1 transition-colors hover:bg-accent",
                                expanded ? "text-foreground" : "text-muted-foreground",
                            )}
                            title={t("tasks.actions.showEnv")}
                        >
                            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <FileCode className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-border">
                    <td colSpan={9} className="bg-muted/20">
                        <EnvVarPanel task={task} clusterName={clusterName} serviceName={serviceName} />
                    </td>
                </tr>
            )}

            {/* Portal: a modal <div> is not valid inside <tbody> */}
            {logsOpen &&
                createPortal(
                    <LogViewer
                        title={t("logs.taskTitle", { id: taskId })}
                        targets={logTargets}
                        onClose={() => setLogsOpen(false)}
                    />,
                    document.body,
                )}

            <CaptureConfigDialog
                open={captureDialogOpen}
                containerName={containerName}
                onConfirm={handleCaptureConfirm}
                onCancel={() => setCaptureDialogOpen(false)}
            />
        </>
    );
}
