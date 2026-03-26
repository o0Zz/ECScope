import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import type { EcsDeployment } from "@/api/types";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge } from "@/lib/format";

function rolloutBadge(state: string) {
  const upper = state.toUpperCase();
  if (upper === "COMPLETED") return "COMPLETED";
  if (upper === "IN_PROGRESS") return "IN_PROGRESS";
  if (upper === "FAILED") return "STOPPED";
  return upper || "UNKNOWN";
}

export function DeploymentStatusPanel({
  clusterName,
  serviceName,
}: {
  clusterName: string;
  serviceName: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [rollbackTarget, setRollbackTarget] = useState<EcsDeployment | null>(null);
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
  const queryClient = useQueryClient();

  const { data: service } = useQuery({
    queryKey: ["serviceDetail", clusterName, serviceName],
    queryFn: () => ecsApi.getService(clusterName, serviceName),
    enabled: !!clusterName && !!serviceName,
    refetchInterval: refreshIntervalMs,
  });

  const rollbackMutation = useMutation({
    mutationFn: (taskDefinition: string) =>
      ecsApi.rollbackService(clusterName, serviceName, taskDefinition),
    onSuccess: () => {
      setRollbackTarget(null);
      queryClient.invalidateQueries({ queryKey: ["serviceDetail", clusterName, serviceName] });
      queryClient.invalidateQueries({ queryKey: ["services", clusterName] });
      queryClient.invalidateQueries({ queryKey: ["tasks", clusterName, serviceName] });
    },
  });

  const deployments = service?.deployments ?? [];
  if (deployments.length === 0) return null;

  const hasMultiple = deployments.length > 1;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-muted/50 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        Deployments
        <span className="text-xs font-normal text-muted-foreground">
          ({deployments.length})
        </span>
        {hasMultiple && (
          <span className="ml-1 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
            Rollout in progress
          </span>
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-border">
          {deployments.map((dep) => {
            const isPrimary = dep.status === "PRIMARY";
            const isActive = dep.status === "ACTIVE";
            const isFailed = dep.rolloutState?.toUpperCase() === "FAILED";

            return (
              <div
                key={dep.id}
                className={cn(
                  "px-4 py-3 text-xs",
                  isFailed && "bg-destructive/5",
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <StatusBadge status={isPrimary ? "PRIMARY" : dep.status.toUpperCase()} />
                  <StatusBadge status={rolloutBadge(dep.rolloutState)} />
                  <span className="font-mono text-muted-foreground">{dep.taskDefinition}</span>
                  <span className="ml-auto text-muted-foreground">{formatAge(dep.createdAt)} ago</span>
                  {isActive && (
                    <button
                      onClick={() => setRollbackTarget(dep)}
                      className="ml-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                      title="Rollback to this task definition"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Rollback
                    </button>
                  )}
                </div>
                <div className="flex gap-4 text-muted-foreground">
                  <span>
                    Running <span className="font-mono text-foreground">{dep.runningCount}</span>/{dep.desiredCount}
                  </span>
                  {dep.pendingCount > 0 && (
                    <span>
                      Pending <span className="font-mono text-warning">{dep.pendingCount}</span>
                    </span>
                  )}
                </div>
                {dep.rolloutStateReason && (
                  <p className={cn("mt-1", isFailed ? "text-destructive" : "text-muted-foreground")}>
                    {dep.rolloutStateReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!rollbackTarget}
        title="Rollback Service"
        message={`Roll back to the previous task definition?`}
        detail={rollbackTarget?.taskDefinition}
        confirmLabel="Rollback"
        confirmingLabel="Rolling back…"
        isPending={rollbackMutation.isPending}
        onConfirm={() => rollbackMutation.mutate(rollbackTarget!.taskDefinition)}
        onCancel={() => setRollbackTarget(null)}
      />
    </div>
  );
}
