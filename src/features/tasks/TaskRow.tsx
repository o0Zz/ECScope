import type { EcsTask } from "@/api/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Container, Server, ChevronDown, FileCode, Terminal, ScrollText, Square, AlertTriangle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge } from "@/lib/format";
import { openEcsExec, openTaskLogs, openHttpCapture } from "./TaskActions";
import { EnvVarPanel } from "./EnvVarPanel";

export function TaskRow({
    task,
    expanded,
    onToggleEnv,
    onStop,
    isStopping,
    clusterName,
    profile,
    region,
}: {
    task: EcsTask;
    expanded: boolean;
    onToggleEnv: () => void;
    onStop: () => void;
    isStopping: boolean;
    clusterName: string;
    profile: string;
    region: string;
}) {
    const taskId = task.taskArn.split("/").pop() ?? "";
    const containerName = task.containers[0]?.name ?? "";
    const container = task.containers[0];
    const canStreamLogs = !!task.ec2InstanceId && !!container?.runtimeId;
    const canHttpCapture = !!task.ec2InstanceId && !!container?.runtimeId;
    const isStopped = task.lastStatus === "STOPPED";
    const actionParams = { profile, region };

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
        openHttpCapture(task.ec2InstanceId!, container.runtimeId!, container.name, actionParams);
    };

    return (
        <>
            <tr
                className="border-b border-border last:border-b-0 hover:bg-accent/50"
            >
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Container className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <span className="font-mono text-xs font-medium text-foreground">
                                {taskId}
                            </span>
                            {task.lastStatus === "STOPPED" && task.stoppedReason && (
                                <div className="mt-0.5 flex items-start gap-1">
                                    <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                                    <span className="text-[11px] text-warning break-words">{task.stoppedReason}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </td>
                <td className="px-4 py-3">
                    <StatusBadge status={task.lastStatus} />
                    {task.lastStatus === "STOPPED" && task.stoppedAt && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatAge(task.stoppedAt)} ago
                        </div>
                    )}
                </td>
                <td className="px-4 py-3">
                    <StatusBadge status={task.healthStatus} />
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                    {task.launchType}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {task.cpu} / {task.memory} MB
                </td>
                <td className="px-3 py-3">
                    {task.ec2InstanceId ? (
                        <div className="flex items-center gap-1.5">
                            <Server className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-mono text-xs text-foreground">{task.ec2InstanceId}</span>
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground">Fargate</span>
                    )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatAge(task.startedAt)}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                    {task.containers.length}
                </td>
                <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStop();
                            }}
                            disabled={isStopping || isStopped}
                            className="rounded p-1 transition-colors text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Stop task"
                        >
                            <Square className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={handleExec}
                            disabled={isStopped}
                            className={cn(
                                "rounded p-1 transition-colors",
                                isStopped ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                            title={`Shell into ${containerName}`}
                        >
                            <Terminal className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={handleLogs}
                            className={cn(
                                "rounded p-1 transition-colors hover:bg-accent",
                                isStopped || !canStreamLogs ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={isStopped ? "Task is stopped" : canStreamLogs ? `Live logs for ${containerName}` : "Docker logs requires EC2 launch type"}
                            disabled={isStopped || !canStreamLogs}
                        >
                            <ScrollText className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={handleHttpCapture}
                            className={cn(
                                "rounded p-1 transition-colors hover:bg-accent",
                                isStopped || !canHttpCapture ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={isStopped ? "Task is stopped" : canHttpCapture ? `HTTP capture for ${containerName}` : "HTTP capture requires EC2 launch type"}
                            disabled={isStopped || !canHttpCapture}
                        >
                            <Radio className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleEnv(); }}
                            className={cn(
                                "rounded p-1 transition-colors hover:bg-accent",
                                expanded ? "text-foreground" : "text-muted-foreground",
                            )}
                            title="Show environment variables"
                        >
                            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <FileCode className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-border">
                    <td colSpan={9} className="bg-muted/20">
                        <EnvVarPanel task={task} />
                    </td>
                </tr>
            )}
        </>
    );
}
