import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricBar } from "@/components/MetricBar";
import { Monitor, Terminal, Download, Upload, Minus, Plus, Server } from "lucide-react";
import { formatAge } from "@/lib/format";
import { invoke, createLogger } from "@/lib/logger";
import { useFileTransfer } from "./useFileTransfer";
import { FileTransferDialog } from "./FileTransferDialog";

const logger = createLogger("NodeViewer");

export function NodeViewer() {
    const { t } = useTranslation();
    const { selectedCluster } = useNavigationStore();
    const { activeCluster } = useConfigStore();
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);

    const transfer = useFileTransfer(activeCluster);
    const queryClient = useQueryClient();

    const { data: instances, isLoading } = useQuery({
        queryKey: ["nodes", selectedCluster],
        queryFn: () => ecsApi.listContainerInstances(selectedCluster!),
        enabled: !!selectedCluster,
        refetchInterval: refreshIntervalMs,
    });

    const { data: asgInfo } = useQuery({
        queryKey: ["asgInfo", selectedCluster],
        queryFn: () => ecsApi.getClusterAsgInfo(selectedCluster!),
        enabled: !!selectedCluster,
        refetchInterval: refreshIntervalMs,
    });

    const scaleMutation = useMutation({
        mutationFn: (desiredCapacity: number) =>
            ecsApi.updateAsgDesiredCapacity(asgInfo!.asgName, desiredCapacity, asgInfo!.maxSize),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["asgInfo", selectedCluster] });
            queryClient.invalidateQueries({ queryKey: ["nodes", selectedCluster] });
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("nodes.loading")}
            </div>
        );
    }

    if (!instances?.length) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("nodes.noInstances")}
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                    {t("nodes.title")}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">({instances.length})</span>
                </h2>

                {asgInfo && (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{t("nodes.asg")}</span>
                        <span className="text-xs font-medium text-foreground truncate max-w-48" title={asgInfo.asgName}>
                            {asgInfo.asgName}
                        </span>
                        <div className="flex items-center gap-1.5 ml-2">
                            <button
                                onClick={() => scaleMutation.mutate(asgInfo.desiredCapacity - 1)}
                                disabled={asgInfo.desiredCapacity <= asgInfo.minSize || scaleMutation.isPending}
                                className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                title={t("nodes.actions.scaleDown", { min: asgInfo.minSize })}
                            >
                                <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-[2rem] text-center text-sm font-semibold text-foreground">
                                {asgInfo.desiredCapacity}
                            </span>
                            <button
                                onClick={() => scaleMutation.mutate(asgInfo.desiredCapacity + 1)}
                                disabled={scaleMutation.isPending}
                                className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                title={t("nodes.actions.scaleUp")}
                            >
                                <Plus className="h-3 w-3" />
                            </button>
                        </div>
                        <span className="text-xs text-muted-foreground ml-1">
                            ({asgInfo.minSize}–{asgInfo.maxSize})
                        </span>
                    </div>
                )}
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("nodes.columns.instance")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("nodes.columns.type")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("nodes.columns.status")}
                            </th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                {t("nodes.columns.tasks")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("nodes.columns.cpuReserved")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("nodes.columns.memoryReserved")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("nodes.columns.agent")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("nodes.columns.age")}
                            </th>
                            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                                {t("nodes.columns.actions")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {[...instances]
                            .sort((a, b) => (b.registeredAt ?? 0) - (a.registeredAt ?? 0))
                            .map((inst) => {
                                const cpuUsed = inst.cpuRegistered - inst.cpuAvailable;
                                const cpuPct = Math.round((cpuUsed / inst.cpuRegistered) * 100);
                                const memUsed = inst.memoryRegistered - inst.memoryAvailable;
                                const memPct = Math.round((memUsed / inst.memoryRegistered) * 100);

                                return (
                                    <tr
                                        key={inst.containerInstanceArn}
                                        className="border-b border-border last:border-b-0 hover:bg-accent/50"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Monitor className="h-4 w-4 text-info" />
                                                <span className="font-mono text-xs font-medium text-foreground">
                                                    {inst.ec2InstanceId}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{inst.instanceType}</td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={inst.status} />
                                        </td>
                                        <td className="px-4 py-3 text-center text-foreground">
                                            {inst.runningTasksCount}
                                            {inst.pendingTasksCount > 0 && (
                                                <span className="ml-1 text-warning">+{inst.pendingTasksCount}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <MetricBar
                                                value={cpuPct}
                                                label={`${cpuUsed}/${inst.cpuRegistered}`}
                                                color={
                                                    cpuPct > 80
                                                        ? "bg-destructive"
                                                        : cpuPct > 60
                                                          ? "bg-warning"
                                                          : "bg-info"
                                                }
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <MetricBar
                                                value={memPct}
                                                label={`${memUsed}/${inst.memoryRegistered}MB`}
                                                color={
                                                    memPct > 80
                                                        ? "bg-destructive"
                                                        : memPct > 60
                                                          ? "bg-warning"
                                                          : "bg-primary"
                                                }
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">{inst.agentVersion}</td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            {formatAge(inst.registeredAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => {
                                                        invoke("open_ssm_session", {
                                                            params: {
                                                                instance_id: inst.ec2InstanceId,
                                                                profile: activeCluster?.profile ?? "",
                                                                region: activeCluster?.region ?? "us-east-1",
                                                            },
                                                        }).catch((err) =>
                                                            logger.error(
                                                                `SSM connect to ${inst.ec2InstanceId} failed`,
                                                                err,
                                                            ),
                                                        );
                                                    }}
                                                    className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1"
                                                    title={t("tasks.actions.ssmConnect", { id: inst.ec2InstanceId })}
                                                >
                                                    <Terminal className="h-3 w-3" />
                                                    {t("nodes.actions.connect")}
                                                </button>
                                                {transfer.hasFileTransfer && (
                                                    <button
                                                        onClick={() => transfer.startDownload(inst.ec2InstanceId)}
                                                        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1"
                                                        title={t("nodes.actions.downloadFrom", {
                                                            id: inst.ec2InstanceId,
                                                        })}
                                                    >
                                                        <Download className="h-3 w-3" />
                                                        {t("nodes.actions.download")}
                                                    </button>
                                                )}
                                                {transfer.hasFileTransfer && (
                                                    <button
                                                        onClick={() => transfer.startUpload(inst.ec2InstanceId)}
                                                        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1"
                                                        title={t("nodes.actions.uploadTo", { id: inst.ec2InstanceId })}
                                                    >
                                                        <Upload className="h-3 w-3" />
                                                        {t("nodes.actions.upload")}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            <FileTransferDialog
                open={transfer.dialogOpen}
                title={
                    transfer.dialogMode === "download"
                        ? t("nodes.transfer.downloadTitle")
                        : t("nodes.transfer.uploadTitle")
                }
                label={
                    transfer.dialogMode === "download"
                        ? t("nodes.transfer.downloadLabel")
                        : t("nodes.transfer.uploadLabel")
                }
                placeholder={
                    transfer.dialogMode === "download"
                        ? t("nodes.transfer.downloadPlaceholder")
                        : t("nodes.transfer.uploadPlaceholder")
                }
                error={transfer.error}
                isPending={transfer.isPending}
                progress={transfer.progress}
                rate={transfer.rate}
                onConfirm={transfer.confirm}
                onCancel={transfer.cancel}
            />
        </div>
    );
}
