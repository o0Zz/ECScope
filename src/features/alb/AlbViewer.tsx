import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import type { AlbInfo } from "@/api/types";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { Globe, Shield, ChevronRight, ChevronDown, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlbMetricsChart } from "@/components/AlbMetricsChart";
import { NlbMetricsChart } from "@/components/NlbMetricsChart";

function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function LbTypeBadge({ type }: { type: AlbInfo["lbType"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
        type === "application"
          ? "bg-blue-500/15 text-blue-400"
          : "bg-violet-500/15 text-violet-400",
      )}
    >
      {type === "application" ? "ALB" : "NLB"}
    </span>
  );
}

function LbRow({ alb }: { alb: AlbInfo }) {
  const [expanded, setExpanded] = useState(false);
  const totalHealthy = alb.targetGroups.reduce((s, tg) => s + tg.healthyCount, 0);
  const totalUnhealthy = alb.targetGroups.reduce((s, tg) => s + tg.unhealthyCount, 0);
  const isNlb = alb.lbType === "network";

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
            {isNlb ? (
              <Network className="h-4 w-4 text-violet-400" />
            ) : alb.scheme === "internet-facing" ? (
              <Globe className="h-4 w-4 text-info" />
            ) : (
              <Shield className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium text-foreground">{alb.albName}</span>
            <LbTypeBadge type={alb.lbType} />
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
        <td className="px-4 py-3 text-center text-foreground">
          {isNlb
            ? (alb.activeFlowCount ?? 0).toLocaleString()
            : alb.requestCount.toLocaleString()}
        </td>
        <td className="px-4 py-3 text-center">
          {isNlb ? (
            <span className="font-mono font-medium text-foreground">
              {formatBytes(alb.processedBytes ?? 0)}
            </span>
          ) : (
            <span className={cn("font-mono font-medium", alb.avgLatencyMs > 50 ? "text-warning" : "text-success")}>
              {alb.avgLatencyMs}ms
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={7} className="bg-muted/20 px-4 py-3">
            <div className="mb-1 text-xs font-mono text-muted-foreground truncate">{alb.dnsName}</div>
            {isNlb ? (
              <NlbMetricsChart nlbArn={alb.albArn} nlbName={alb.albName} />
            ) : (
              <AlbMetricsChart albArn={alb.albArn} albName={alb.albName} />
            )}
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
        No load balancers found.
      </div>
    );
  }

  const albCount = albs.filter((lb) => lb.lbType === "application").length;
  const nlbCount = albs.filter((lb) => lb.lbType === "network").length;

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Load Balancers
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({albs.length}{albCount > 0 && nlbCount > 0 ? ` · ${albCount} ALB, ${nlbCount} NLB` : ""})
        </span>
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
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Reqs / Flows</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Latency / Bytes</th>
            </tr>
          </thead>
          <tbody>
            {albs.map((alb) => (
              <LbRow key={alb.albArn} alb={alb} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
