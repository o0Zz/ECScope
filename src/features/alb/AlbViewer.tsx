import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import type { AlbInfo } from "@/api/types";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { Globe, Shield, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlbMetricsChart } from "@/components/AlbMetricsChart";

function AlbRow({ alb }: { alb: AlbInfo }) {
  const [expanded, setExpanded] = useState(false);
  const totalHealthy = alb.targetGroups.reduce((s, tg) => s + tg.healthyCount, 0);
  const totalUnhealthy = alb.targetGroups.reduce((s, tg) => s + tg.unhealthyCount, 0);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer border-b border-border hover:bg-accent/50"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {alb.scheme === "internet-facing" ? (
              <Globe className="h-4 w-4 text-info" />
            ) : (
              <Shield className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium text-foreground">{alb.albName}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{alb.scheme}</td>
        <td className="px-4 py-3">
          <StatusBadge status={alb.status.toUpperCase()} />
        </td>
        <td className="px-4 py-3 text-center text-foreground">{alb.targetGroups.length}</td>
        <td className="px-4 py-3 text-center">
          <span className="text-success">{totalHealthy}</span>
          {totalUnhealthy > 0 && (
            <span className="ml-1 text-destructive">/ {totalUnhealthy}</span>
          )}
        </td>
        <td className="px-4 py-3 text-center text-foreground">{alb.requestCount.toLocaleString()}</td>
        <td className="px-4 py-3 text-center">
          <span className={cn("font-mono font-medium", alb.avgLatencyMs > 50 ? "text-warning" : "text-success")}>
            {alb.avgLatencyMs}ms
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={7} className="bg-muted/20 px-4 py-3">
            <div className="mb-1 text-xs font-mono text-muted-foreground truncate">{alb.dnsName}</div>
            <AlbMetricsChart albArn={alb.albArn} albName={alb.albName} />
            <div className="mt-3 space-y-2">
              {alb.targetGroups.map((tg) => (
                <TargetGroupRow key={tg.targetGroupArn} tg={tg} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function TargetGroupRow({ tg }: { tg: AlbInfo["targetGroups"][number] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded border border-border bg-card">
      <div
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex cursor-pointer items-center gap-3 px-3 py-2 text-xs hover:bg-accent/30"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="font-medium text-foreground">{tg.targetGroupName}</span>
        <span className="text-muted-foreground">{tg.protocol}:{tg.port}</span>
        <span className="text-muted-foreground">· {tg.healthCheckPath}</span>
        <span className="ml-auto text-success">{tg.healthyCount} healthy</span>
        {tg.unhealthyCount > 0 && (
          <span className="text-destructive">{tg.unhealthyCount} unhealthy</span>
        )}
      </div>
      {expanded && (
        <div className="border-t border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-1 text-left font-medium text-muted-foreground">Target</th>
                <th className="px-3 py-1 text-left font-medium text-muted-foreground">Port</th>
                <th className="px-3 py-1 text-left font-medium text-muted-foreground">Health</th>
                <th className="px-3 py-1 text-left font-medium text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              {tg.targets.map((target, idx) => (
                <tr key={idx} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-1 font-mono text-foreground">{target.targetId}</td>
                  <td className="px-3 py-1 text-muted-foreground">{target.port}</td>
                  <td className="px-3 py-1">
                    <StatusBadge status={target.health.toUpperCase()} />
                  </td>
                  <td className="px-3 py-1 text-muted-foreground">{target.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AlbViewer() {
  const { selectedCluster } = useNavigationStore();
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);

  const { data: albs, isLoading } = useQuery({
    queryKey: ["albs", selectedCluster],
    queryFn: () => ecsApi.listAlbs(selectedCluster!),
    enabled: !!selectedCluster,
    refetchInterval: refreshIntervalMs,
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
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Application Load Balancers
        <span className="ml-2 text-sm font-normal text-muted-foreground">({albs.length})</span>
      </h2>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Scheme</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Target Groups</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Targets</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Requests</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Latency</th>
            </tr>
          </thead>
          <tbody>
            {albs.map((alb) => (
              <AlbRow key={alb.albArn} alb={alb} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
