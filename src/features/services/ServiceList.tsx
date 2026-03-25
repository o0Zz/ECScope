import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { Cog, ArrowRight, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function MetricBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{value}% {label}</span>
    </div>
  );
}

function ClusterOverview({ clusterName }: { clusterName: string }) {
  const { data: metrics } = useQuery({
    queryKey: ["clusterMetrics", clusterName],
    queryFn: () => ecsApi.getClusterMetrics(clusterName),
    refetchInterval: 15000,
  });

  if (!metrics) return null;

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
      <div>
        <div className="text-xs text-muted-foreground">Cluster CPU</div>
        <div className="mt-1 text-lg font-semibold text-foreground">{metrics.cpuUtilization}%</div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", metrics.cpuUtilization > 80 ? "bg-destructive" : metrics.cpuUtilization > 60 ? "bg-warning" : "bg-success")}
            style={{ width: `${metrics.cpuUtilization}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{metrics.cpuReserved} / {metrics.cpuTotal} units</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Cluster Memory</div>
        <div className="mt-1 text-lg font-semibold text-foreground">{metrics.memoryUtilization}%</div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", metrics.memoryUtilization > 80 ? "bg-destructive" : metrics.memoryUtilization > 60 ? "bg-warning" : "bg-success")}
            style={{ width: `${metrics.memoryUtilization}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{metrics.memoryReservedMB} / {metrics.memoryTotalMB} MB</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">CPU Reserved</div>
        <div className="mt-1 text-lg font-semibold text-foreground">{metrics.cpuReserved}</div>
        <div className="mt-1 text-xs text-muted-foreground">units</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Memory Reserved</div>
        <div className="mt-1 text-lg font-semibold text-foreground">{metrics.memoryReservedMB}</div>
        <div className="mt-1 text-xs text-muted-foreground">MB</div>
      </div>
    </div>
  );
}

export function ServiceList() {
  const { selectedCluster, selectService } = useNavigationStore();
  const queryClient = useQueryClient();

  const { data: services, isLoading, error } = useQuery({
    queryKey: ["services", selectedCluster],
    queryFn: () => {
      console.log("[ServiceList] queryFn called for cluster:", selectedCluster);
      return ecsApi.listServices(selectedCluster!);
    },
    enabled: !!selectedCluster,
  });

  if (error) {
    console.error("[ServiceList] query error:", error);
  }
  if (services) {
    console.log("[ServiceList] services loaded:", services.length);
  }

  const scaleMutation = useMutation({
    mutationFn: ({ serviceName, desiredCount }: { serviceName: string; desiredCount: number }) =>
      ecsApi.updateServiceDesiredCount(selectedCluster!, serviceName, desiredCount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", selectedCluster] });
      queryClient.invalidateQueries({ queryKey: ["clusterMetrics", selectedCluster] });
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
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({services.length})
        </span>
      </h2>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Service</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Scale</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Running</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">CPU</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Memory</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Launch Type</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Task Def</th>
              <th className="w-10 px-4 py-2.5" />
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
                        scaleMutation.mutate({ serviceName: svc.serviceName, desiredCount: svc.desiredCount - 1 });
                      }}
                      disabled={svc.desiredCount <= 0 || scaleMutation.isPending}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Scale down"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[2rem] text-center font-mono font-medium text-foreground">
                      {svc.desiredCount}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        scaleMutation.mutate({ serviceName: svc.serviceName, desiredCount: svc.desiredCount + 1 });
                      }}
                      disabled={scaleMutation.isPending}
                      className="rounded p-1 text-muted-foreground hover:bg-success/20 hover:text-success disabled:opacity-30"
                      title="Scale up"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-foreground cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                  {svc.runningCount}/{svc.desiredCount}
                </td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                  <MetricBar value={svc.metrics.cpuUtilization} label="CPU" color={svc.metrics.cpuUtilization > 80 ? "bg-destructive" : svc.metrics.cpuUtilization > 60 ? "bg-warning" : "bg-info"} />
                </td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                  <MetricBar value={svc.metrics.memoryUtilization} label="RAM" color={svc.metrics.memoryUtilization > 80 ? "bg-destructive" : svc.metrics.memoryUtilization > 60 ? "bg-warning" : "bg-primary"} />
                </td>
                <td className="px-4 py-3 text-muted-foreground cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                  {svc.launchType}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                  {svc.taskDefinition}
                </td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => selectService(svc.serviceName)}>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
