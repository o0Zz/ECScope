import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { Monitor, Terminal, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { DiagnosticsDialog } from "./DiagnosticsDialog";

export function NodeViewer() {
  const { selectedCluster } = useNavigationStore();
  const { activeCluster } = useConfigStore();
  const storage = useConfigStore((s) => s.storage);
  const [diagInstanceId, setDiagInstanceId] = useState<string | null>(null);
  const hasDiagnostics = !!(storage?.s3Bucket && storage?.s3AccessKeyId && storage?.s3SecretAccessKey);

  const { data: instances, isLoading } = useQuery({
    queryKey: ["nodes", selectedCluster],
    queryFn: () => ecsApi.listContainerInstances(selectedCluster!),
    enabled: !!selectedCluster,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading container instances…
      </div>
    );
  }

  if (!instances?.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No container instances found (Fargate-only cluster).
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Container Instances
        <span className="ml-2 text-sm font-normal text-muted-foreground">({instances.length})</span>
      </h2>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {instances.map((inst) => {
          const cpuUsed = inst.cpuRegistered - inst.cpuAvailable;
          const cpuPct = Math.round((cpuUsed / inst.cpuRegistered) * 100);
          const memUsed = inst.memoryRegistered - inst.memoryAvailable;
          const memPct = Math.round((memUsed / inst.memoryRegistered) * 100);

          return (
            <div key={inst.containerInstanceArn} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5 text-info" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm font-medium text-foreground">{inst.ec2InstanceId}</div>
                  <div className="text-xs text-muted-foreground">{inst.instanceType}</div>
                </div>
                <button
                  onClick={() => {
                    invoke("open_ssm_session", {
                      params: {
                        instance_id: inst.ec2InstanceId,
                        profile: activeCluster?.profile ?? "",
                        region: activeCluster?.region ?? "us-east-1",
                      },
                    }).catch((err) => console.error("[ECScope] SSM connect failed:", err));
                  }}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1.5"
                  title={`SSM connect to ${inst.ec2InstanceId}`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Connect
                </button>
                {hasDiagnostics && (
                  <button
                    onClick={() => setDiagInstanceId(inst.ec2InstanceId)}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1.5"
                    title={`Run diagnostics on ${inst.ec2InstanceId}`}
                  >
                    <Stethoscope className="h-3.5 w-3.5" />
                    Diagnostics
                  </button>
                )}
                <StatusBadge status={inst.status} />
              </div>

              {/* CPU bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">CPU</span>
                  <span className="text-foreground">{cpuUsed} / {inst.cpuRegistered} units ({cpuPct}%)</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", cpuPct > 80 ? "bg-destructive" : cpuPct > 60 ? "bg-warning" : "bg-info")}
                    style={{ width: `${cpuPct}%` }}
                  />
                </div>
              </div>

              {/* Memory bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Memory</span>
                  <span className="text-foreground">{memUsed} / {inst.memoryRegistered} MB ({memPct}%)</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", memPct > 80 ? "bg-destructive" : memPct > 60 ? "bg-warning" : "bg-primary")}
                    style={{ width: `${memPct}%` }}
                  />
                </div>
              </div>

              {/* Details */}
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span>Tasks: <span className="text-foreground">{inst.runningTasksCount} running</span></span>
                {inst.pendingTasksCount > 0 && (
                  <span className="text-warning">{inst.pendingTasksCount} pending</span>
                )}
                <span>Agent: {inst.agentVersion}</span>
              </div>
            </div>
          );
        })}
      </div>

      {diagInstanceId && (
        <DiagnosticsDialog
          instanceId={diagInstanceId}
          onClose={() => setDiagInstanceId(null)}
        />
      )}
    </div>
  );
}
