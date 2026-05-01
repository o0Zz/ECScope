import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricBar } from "@/components/MetricBar";
import { Cog, ArrowRight, Plus, Minus, RotateCw, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";

function ClusterOverview({ clusterName }: { clusterName: string }) {
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
                <div className="text-xs text-muted-foreground">🖥️ Cluster CPU</div>
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
                <div className="text-xs text-muted-foreground">🧠 Cluster Memory</div>
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
                <div className="text-xs text-muted-foreground">🖥️ CPU Reserved</div>
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
                <div className="text-xs text-muted-foreground">🧠 Memory Reserved</div>
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
    const { selectedCluster, selectService } = useNavigationStore();
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const queryClient = useQueryClient();
    const [confirmRedeploy, setConfirmRedeploy] = useState<string | null>(null);
    const [confirmScaleToZero, setConfirmScaleToZero] = useState<string | null>(null);
    const [scalingDialog, setScalingDialog] = useState<{
        serviceName: string;
        minCapacity: number;
        maxCapacity: number;
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
        mutationFn: ({
            serviceName,
            minCapacity,
            maxCapacity,
        }: {
            serviceName: string;
            minCapacity: number;
            maxCapacity: number;
        }) => ecsApi.updateServiceScalingTarget(selectedCluster!, serviceName, minCapacity, maxCapacity),
        onSuccess: () => {
            setScalingDialog(null);
            queryClient.invalidateQueries({ queryKey: ["scalingTargets", selectedCluster] });
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading services…
            </div>
        );
    }

    if (!services?.length) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No services found.
            </div>
        );
    }

    return (
        <div className="p-4">
            <ClusterOverview clusterName={selectedCluster!} />

            <h2 className="mb-4 text-lg font-semibold text-foreground">
                Services
                <span className="ml-2 text-sm font-normal text-muted-foreground">({services.length})</span>
            </h2>
            <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Service</th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Scale</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Running</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">🖥️ CPU</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">🧠 Memory</th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Capacity Provider
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Task Def</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Actions</th>
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
                                            title="➖ Scale down"
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
                                            title="➕ Scale up"
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
                                                });
                                            }}
                                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            title="⚙️ Configure scaling limits"
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
                                                setConfirmRedeploy(svc.serviceName);
                                            }}
                                            disabled={redeployMutation.isPending}
                                            className="rounded p-1 text-muted-foreground hover:bg-info/20 hover:text-info disabled:opacity-30"
                                            title="🔄 Force new deployment"
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
                                            title="View tasks"
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
                title="🔄 Force New Deployment"
                message="Force a new deployment for this service? All tasks will be replaced with fresh ones."
                detail={confirmRedeploy ?? undefined}
                confirmLabel="Redeploy"
                confirmingLabel="Deploying…"
                isPending={redeployMutation.isPending}
                onConfirm={() => redeployMutation.mutate(confirmRedeploy!)}
                onCancel={() => setConfirmRedeploy(null)}
            />

            <ConfirmDialog
                open={!!confirmScaleToZero}
                title="🛑 Stop Service"
                message="Are you sure you want to scale this service to 0? All running tasks will be stopped."
                detail={confirmScaleToZero ?? undefined}
                confirmLabel="Scale to 0"
                confirmingLabel="Scaling…"
                variant="destructive"
                isPending={scaleMutation.isPending}
                onConfirm={() => {
                    scaleMutation.mutate({ serviceName: confirmScaleToZero!, desiredCount: 0 });
                    setConfirmScaleToZero(null);
                }}
                onCancel={() => setConfirmScaleToZero(null)}
            />

            {scalingDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-foreground">Scaling Limits</h3>
                            <button
                                onClick={() => setScalingDialog(null)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="text-xs font-mono text-foreground mb-4">{scalingDialog.serviceName}</p>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Min Capacity</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={scalingDialog.minCapacity}
                                    onChange={(e) =>
                                        setScalingDialog({
                                            ...scalingDialog,
                                            minCapacity: Math.max(0, parseInt(e.target.value) || 0),
                                        })
                                    }
                                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Max Capacity</label>
                                <input
                                    type="number"
                                    min={scalingDialog.minCapacity}
                                    value={scalingDialog.maxCapacity}
                                    onChange={(e) =>
                                        setScalingDialog({
                                            ...scalingDialog,
                                            maxCapacity: Math.max(
                                                scalingDialog.minCapacity,
                                                parseInt(e.target.value) || 0,
                                            ),
                                        })
                                    }
                                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setScalingDialog(null)}
                                disabled={scalingTargetMutation.isPending}
                                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() =>
                                    scalingTargetMutation.mutate({
                                        serviceName: scalingDialog.serviceName,
                                        minCapacity: scalingDialog.minCapacity,
                                        maxCapacity: scalingDialog.maxCapacity,
                                    })
                                }
                                disabled={
                                    scalingTargetMutation.isPending ||
                                    scalingDialog.maxCapacity < scalingDialog.minCapacity
                                }
                                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {scalingTargetMutation.isPending ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
