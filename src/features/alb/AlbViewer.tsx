import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { Globe, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export function AlbViewer() {
  const { selectedCluster } = useNavigationStore();

  const { data: albs, isLoading } = useQuery({
    queryKey: ["albs", selectedCluster],
    queryFn: () => ecsApi.listAlbs(selectedCluster!),
    enabled: !!selectedCluster,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading load balancers…
      </div>
    );
  }

  if (!albs?.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No ALBs found.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-lg font-semibold text-foreground">
        Application Load Balancers
        <span className="ml-2 text-sm font-normal text-muted-foreground">({albs.length})</span>
      </h2>

      {albs.map((alb) => (
        <div key={alb.albArn} className="rounded-lg border border-border bg-card">
          {/* ALB header */}
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-3">
              {alb.scheme === "internet-facing" ? (
                <Globe className="h-5 w-5 text-info" />
              ) : (
                <Shield className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium text-foreground">{alb.albName}</div>
                <div className="text-xs text-muted-foreground">{alb.dnsName}</div>
              </div>
              <StatusBadge status={alb.status.toUpperCase()} className="ml-auto" />
            </div>
            <div className="mt-3 flex gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Scheme: </span>
                <span className="text-foreground">{alb.scheme}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Requests: </span>
                <span className="text-foreground">{alb.requestCount.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Avg Latency: </span>
                <span className={cn("font-medium", alb.avgLatencyMs > 50 ? "text-warning" : "text-success")}>
                  {alb.avgLatencyMs}ms
                </span>
              </div>
            </div>
          </div>

          {/* Target Groups */}
          <div className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              Target Groups ({alb.targetGroups.length})
            </h3>
            <div className="space-y-3">
              {alb.targetGroups.map((tg) => (
                <div key={tg.targetGroupArn} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{tg.targetGroupName}</div>
                      <div className="text-xs text-muted-foreground">
                        {tg.protocol}:{tg.port} · Health check: {tg.healthCheckPath}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-success">{tg.healthyCount} healthy</span>
                      {tg.unhealthyCount > 0 && (
                        <span className="text-destructive">{tg.unhealthyCount} unhealthy</span>
                      )}
                    </div>
                  </div>

                  {/* Targets */}
                  <div className="mt-2 overflow-hidden rounded border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Target</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Port</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Health</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tg.targets.map((target, idx) => (
                          <tr key={idx} className="border-b border-border last:border-b-0">
                            <td className="px-3 py-1.5 font-mono text-foreground">{target.targetId}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{target.port}</td>
                            <td className="px-3 py-1.5">
                              <StatusBadge status={target.health.toUpperCase()} />
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{target.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
