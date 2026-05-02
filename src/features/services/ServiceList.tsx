import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricBar } from "@/components/MetricBar";
import { Cog, ArrowRight, Plus, Minus, RotateCw, Settings2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScalingLimitsDialog } from "@/components/ScalingLimitsDialog";
import { ecsServiceUrl, openAwsUrl } from "@/lib/aws-urls";

function ClusterOverview({ clusterName }: { clusterName: string }) {
    const { t } = useTranslation();
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const { data: metrics } = useQuery({
        queryKey: ["clusterMetrics", clusterName],
        queryFn: () => ecsApi.getClusterMetrics(clusterName),
        refetchInterval: refreshIntervalMs,
    });

    if (!metrics) return null;

    const cpuReservedPct = metrics.cpuTotal > 0 ? Math.round((metrics.cpuReserved / metrics.cpuTotal) * 100) : 0;
    const memReservedPct =
        metrics.memoryTotalMB > 0 ? Math.round((metrics.memoryReservedMB / metrics.memoryTotalMB) * 100) : 0;

    const barColor = (pct: number) => (pct > 80 ? "bg-destructive" : pct > 60 ? "bg-warning" : "bg-success");

    return (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
            <div>
                <div className="text-xs text-muted-foreground">{t("cluster.cpu")}</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{metrics.cpuUtilization}%</div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className={cn("h-full rounded-full", barColor(metrics.cpuUtilization))}
                        style={{ width: `${metrics.cpuUtilization}%` }}
                    />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                    {metrics.cpuReserved} / {metrics.cpuTotal} units
                </div>
            </div>
            <div>
                <div className="text-xs text-muted-foreground">{t("cluster.memory")}</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{metrics.memoryUtilization}%</div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className={cn("h-full rounded-full", barColor(metrics.memoryUtilization))}
                        style={{ width: `${metrics.memoryUtilization}%` }}
                    />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                    {metrics.memoryReservedMB} / {metrics.memoryTotalMB} MB
                </div>
            </div>
            <div>
                <div className="text-xs text-muted-foreground">{t("cluster.cpuReserved")}</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{cpuReservedPct}%</div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className={cn("h-full rounded-full", barColor(cpuReservedPct))}
                        style={{ width: `${cpuReservedPct}%` }}
                    />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                    {metrics.cpuReserved} / {metrics.cpuTotal} units
                </div>
            </div>
            <div>
                <div className="text-xs text-muted-foreground">{t("cluster.memoryReserved")}</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{memReservedPct}%</div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className={cn("h-full rounded-full", barColor(memReservedPct))}
                        style={{ width: `${memReservedPct}%` }}
                    />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                    {metrics.memoryReservedMB} / {metrics.memoryTotalMB} MB
                </div>
            </div>
        </div>
    );
}

export function ServiceList() {
    const { t } = useTranslation();
    const { selectedCluster, selectService } = useNavigationStore();
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const activeCluster = useConfigStore((s) => s.activeCluster);
    const region = activeCluster?.region ?? "us-east-1";
    const queryClient = useQueryClient();
    const [confirmRedeploy, setConfirmRedeploy] = useState<string | null>(null);
    const [confirmScaleToZero, setConfirmScaleToZero] = useState<string | null>(null);
    const [scalingDialog, setScalingDialog] = useState<{
        serviceName: string;
        minCapacity: number;
        maxCapacity: number;
        desiredCount: number;
    } | null>(null);

    const { data: services, isLoading } = useQuery({
        queryKey: ["services", selectedCluster],
        queryFn: () => {
            return ecsApi.listServices(selectedCluster!);
        },
        enabled: !!selectedCluster,
        refetchInterval: refreshIntervalMs,
    });

    const scaleMutation = useMutation({
        mutationFn: ({ serviceName, desiredCount }: { serviceName: string; desiredCount: number }) =>
            ecsApi.updateServiceDesiredCount(selectedCluster!, serviceName, desiredCount),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["services", selectedCluster] });
            queryClient.invalidateQueries({ queryKey: ["clusterMetrics", selectedCluster] });
        },
    });

    const redeployMutation = useMutation({
        mutationFn: (serviceName: string) => ecsApi.forceNewDeployment(selectedCluster!, serviceName),
        onSuccess: () => {
            setConfirmRedeploy(null);
            queryClient.invalidateQueries({ queryKey: ["services", selectedCluster] });
        },
    });

    const { data: scalingTargets } = useQuery({
        queryKey: ["scalingTargets", selectedCluster],
        queryFn: () => ecsApi.getServiceScalingTargets(selectedCluster!),
        enabled: !!selectedCluster,
        refetchInterval: refreshIntervalMs,
    });

    const scalingTargetMutation = useMutation({
        mutationFn: async ({
            serviceName,
            minCapacity,
            maxCapacity,
            desiredCount,
        }: {
            serviceName: string;
            minCapacity: number;
            maxCapacity: number;
            desiredCount: number;
        }) => {
            await ecsApi.updateServiceScalingTarget(selectedCluster!, serviceName, minCapacity, maxCapacity);
            await ecsApi.updateServiceDesiredCount(selectedCluster!, serviceName, desiredCount);
        },
        onSuccess: () => {
            setScalingDialog(null);
            queryClient.invalidateQueries({ queryKey: ["scalingTargets", selectedCluster] });
            queryClient.invalidateQueries({ queryKey: ["services", selectedCluster] });
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("services.loading")}
            </div>
        );
    }

    if (!services?.length) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("services.noServices")}
            </div>
        );
    }

    return (
        <div className="p-4">
            <ClusterOverview clusterName={selectedCluster!} />

            <h2 className="mb-4 text-lg font-semibold text-foreground">
                {t("services.title")}
                <span className="ml-2 text-sm font-normal text-muted-foreground">({services.length})</span>
            </h2>
            <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("services.columns.service")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("services.columns.status")}
                            </th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                {t("services.columns.scale")}
                            </th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                {t("services.columns.running")}
                            </th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                {t("services.columns.cpu")}
                            </th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                {t("services.columns.memory")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("services.columns.capacityProvider")}
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                {t("services.columns.taskDef")}
                            </th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                {t("services.columns.actions")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {services.map((svc) => (
                            <tr
                                key={svc.serviceArn}
                                className="border-b border-border last:border-b-0 hover:bg-accent/50"
                            >
                                <td className="px-4 py-3 cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                                    <div className="flex items-center gap-2">
                                        <Cog className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium text-foreground">{svc.serviceName}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                                    <StatusBadge status={svc.status} />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-center gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (svc.desiredCount === 1) {
                                                    setConfirmScaleToZero(svc.serviceName);
                                                } else {
                                                    scaleMutation.mutate({
                                                        serviceName: svc.serviceName,
                                                        desiredCount: svc.desiredCount - 1,
                                                    });
                                                }
                                            }}
                                            disabled={svc.desiredCount <= 0 || scaleMutation.isPending}
                                            className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                                            title={t("services.actions.scaleDown")}
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </button>
                                        <span className="min-w-[2rem] text-center font-mono font-medium text-foreground">
                                            {svc.desiredCount}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                scaleMutation.mutate({
                                                    serviceName: svc.serviceName,
                                                    desiredCount: svc.desiredCount + 1,
                                                });
                                            }}
                                            disabled={scaleMutation.isPending}
                                            className="rounded p-1 text-muted-foreground hover:bg-success/20 hover:text-success disabled:opacity-30"
                                            title={t("services.actions.scaleUp")}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const target = scalingTargets?.get(svc.serviceName);
                                                setScalingDialog({
                                                    serviceName: svc.serviceName,
                                                    minCapacity: target?.minCapacity ?? svc.desiredCount,
                                                    maxCapacity: target?.maxCapacity ?? svc.desiredCount,
                                                    desiredCount: svc.desiredCount,
                                                });
                                            }}
                                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            title={t("services.actions.configureScaling")}
                                        >
                                            <Settings2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </td>
                                <td
                                    className="px-4 py-3 text-center text-foreground cursor-pointer"
                                    onClick={() => selectService(svc.serviceName)}
                                >
                                    {svc.runningCount}/{svc.desiredCount}
                                </td>
                                <td className="px-4 py-3 cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                                    <MetricBar
                                        value={svc.metrics.cpuUtilization}
                                        label="CPU"
                                        color={
                                            svc.metrics.cpuUtilization > 80
                                                ? "bg-destructive"
                                                : svc.metrics.cpuUtilization > 60
                                                  ? "bg-warning"
                                                  : "bg-info"
                                        }
                                    />
                                </td>
                                <td className="px-4 py-3 cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                                    <MetricBar
                                        value={svc.metrics.memoryUtilization}
                                        label="RAM"
                                        color={
                                            svc.metrics.memoryUtilization > 80
                                                ? "bg-destructive"
                                                : svc.metrics.memoryUtilization > 60
                                                  ? "bg-warning"
                                                  : "bg-primary"
                                        }
                                    />
                                </td>
                                <td
                                    className="px-4 py-3 text-muted-foreground cursor-pointer"
                                    onClick={() => selectService(svc.serviceName)}
                                >
                                    {svc.launchType}
                                </td>
                                <td
                                    className="px-4 py-3 font-mono text-xs text-muted-foreground cursor-pointer"
                                    onClick={() => selectService(svc.serviceName)}
                                >
                                    {svc.taskDefinition}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-center gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openAwsUrl(ecsServiceUrl(region, selectedCluster!, svc.serviceName));
                                            }}
                                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            title={t("common.openConsole")}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmRedeploy(svc.serviceName);
                                            }}
                                            disabled={redeployMutation.isPending}
                                            className="rounded p-1 text-muted-foreground hover:bg-info/20 hover:text-info disabled:opacity-30"
                                            title={t("services.actions.forceDeployment")}
                                        >
                                            <RotateCw
                                                className={cn(
                                                    "h-3.5 w-3.5",
                                                    redeployMutation.isPending && "animate-spin",
                                                )}
                                            />
                                        </button>
                                        <button
                                            onClick={() => selectService(svc.serviceName)}
                                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            title={t("services.actions.viewTasks")}
                                        >
                                            <ArrowRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmDialog
                open={!!confirmRedeploy}
                title={t("services.actions.forceDeploymentTitle")}
                message={t("services.dialogs.redeployMessage")}
                detail={confirmRedeploy ?? undefined}
                confirmLabel={t("services.dialogs.redeployConfirm")}
                confirmingLabel={t("services.dialogs.redeployPending")}
                isPending={redeployMutation.isPending}
                onConfirm={() => redeployMutation.mutate(confirmRedeploy!)}
                onCancel={() => setConfirmRedeploy(null)}
            />

            <ConfirmDialog
                open={!!confirmScaleToZero}
                title={t("services.actions.stopService")}
                message={t("services.dialogs.stopMessage")}
                detail={confirmScaleToZero ?? undefined}
                confirmLabel={t("services.dialogs.stopConfirm")}
                confirmingLabel={t("services.dialogs.stopPending")}
                variant="destructive"
                isPending={scaleMutation.isPending}
                onConfirm={() => {
                    scaleMutation.mutate({ serviceName: confirmScaleToZero!, desiredCount: 0 });
                    setConfirmScaleToZero(null);
                }}
                onCancel={() => setConfirmScaleToZero(null)}
            />

            <ScalingLimitsDialog
                open={!!scalingDialog}
                title={t("services.dialogs.scalingLimits")}
                subtitle={scalingDialog?.serviceName}
                fields={
                    scalingDialog
                        ? [
                              {
                                  key: "minCapacity",
                                  label: t("services.dialogs.minCapacity"),
                                  value: scalingDialog.minCapacity,
                                  min: 0,
                              },
                              {
                                  key: "maxCapacity",
                                  label: t("services.dialogs.maxCapacity"),
                                  value: scalingDialog.maxCapacity,
                                  min: scalingDialog.minCapacity,
                              },
                              {
                                  key: "desiredCount",
                                  label: t("services.dialogs.desiredCount"),
                                  value: scalingDialog.desiredCount,
                                  min: scalingDialog.minCapacity,
                                  max: scalingDialog.maxCapacity,
                              },
                          ]
                        : []
                }
                isPending={scalingTargetMutation.isPending}
                onConfirm={(values) =>
                    scalingTargetMutation.mutate({
                        serviceName: scalingDialog!.serviceName,
                        minCapacity: values.minCapacity,
                        maxCapacity: values.maxCapacity,
                        desiredCount: values.desiredCount,
                    })
                }
                onCancel={() => setScalingDialog(null)}
            />
        </div>
    );
}
