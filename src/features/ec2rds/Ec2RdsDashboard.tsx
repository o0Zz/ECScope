import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import type { VpcEc2Instance } from "@/api/types";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { Ec2MetricsChart } from "@/components/Ec2MetricsChart";
import { Database, Monitor, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge } from "@/lib/format";
import { useState } from "react";

function MetricCard({ label, value, unit, warn, crit }: { label: string; value: number; unit: string; warn?: number; crit?: number }) {
  const isWarn = warn !== undefined && value > warn;
  const isCrit = crit !== undefined && value > crit;
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold", isCrit ? "text-destructive" : isWarn ? "text-warning" : "text-foreground")}>
        {typeof value === "number" && value % 1 !== 0 ? value.toFixed(1) : value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function UsageBar({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", pct > 80 ? "bg-destructive" : pct > 60 ? "bg-warning" : "bg-success")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{used} / {total} {unit}</div>
    </div>
  );
}

export function Ec2RdsDashboard() {
  const { selectedCluster } = useNavigationStore();
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);

  const { data: instances, isLoading: loadingEc2 } = useQuery({
    queryKey: ["vpcInstances", selectedCluster],
    queryFn: () => ecsApi.listVpcInstances(selectedCluster!),
    enabled: !!selectedCluster,
    refetchInterval: refreshIntervalMs,
  });

  const { data: databases, isLoading: loadingDb } = useQuery({
    queryKey: ["databases", selectedCluster],
    queryFn: () => ecsApi.listDatabases(selectedCluster!),
    enabled: !!selectedCluster,
    refetchInterval: refreshIntervalMs,
  });

  const isLoading = loadingEc2 || loadingDb;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading EC2 / RDS…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* ── VPC EC2 Instances ── */}
      <Ec2InstancesSection instances={instances ?? []} />

      {/* ── RDS Databases ── */}
      {databases && databases.length > 0 && (
        <DatabaseSection databases={databases} />
      )}
    </div>
  );
}

/* ─── EC2 Instances Section ─────────────────────────────── */

function stateColor(state: string): string {
  switch (state) {
    case "running": return "ACTIVE";
    case "stopped": return "STOPPED";
    case "stopping": return "DRAINING";
    case "pending": return "PROVISIONING";
    default: return state.toUpperCase();
  }
}

function Ec2InstancesSection({ instances }: { instances: VpcEc2Instance[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        <Monitor className="mr-2 inline h-5 w-5 text-primary" />
        VPC EC2 Instances
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({instances.length})
        </span>
      </h2>

      {instances.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No non-node EC2 instances found in the cluster VPC.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Instance ID</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">State</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Private IP</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Public IP</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Platform</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Age</th>
                <th className="w-8 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {instances.map((inst) => (
                <Ec2InstanceRow
                  key={inst.instanceId}
                  instance={inst}
                  expanded={expandedId === inst.instanceId}
                  onToggle={() => setExpandedId(expandedId === inst.instanceId ? null : inst.instanceId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Ec2InstanceRow({
  instance: inst,
  expanded,
  onToggle,
}: {
  instance: VpcEc2Instance;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-border transition-colors hover:bg-accent/30"
      >
        <td className="px-4 py-2.5 font-medium text-foreground">
          {inst.name || <span className="text-muted-foreground italic">—</span>}
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inst.instanceId}</td>
        <td className="px-4 py-2.5 text-muted-foreground">{inst.instanceType}</td>
        <td className="px-4 py-2.5">
          <StatusBadge status={stateColor(inst.state)} />
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inst.privateIp || "—"}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inst.publicIp || "—"}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">{inst.platform}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">
          {inst.launchTime ? formatAge(inst.launchTime) : "—"}
        </td>
        <td className="px-4 py-2.5">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={9} className="px-4 py-4">
            {inst.state !== "running" ? (
              <div className="text-xs text-muted-foreground italic">
                Metrics unavailable — instance is {inst.state}.
              </div>
            ) : (
              <Ec2MetricsChart instanceId={inst.instanceId} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Database Section (kept for future RDS integration) ── */

function DatabaseSection({ databases }: { databases: import("@/api/types").DatabaseInstance[] }) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        <Database className="mr-2 inline h-5 w-5 text-primary" />
        RDS Databases
        <span className="ml-2 text-sm font-normal text-muted-foreground">({databases.length})</span>
      </h2>

      {databases.map((db) => {
        const m = db.metrics;
        const memUsed = m.totalMemoryMB - m.freeableMemoryMB;

        return (
          <div key={db.dbInstanceId} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium text-foreground">{db.dbInstanceId}</div>
                  <div className="text-xs text-muted-foreground">
                    {db.engine} {db.engineVersion} · {db.instanceClass}
                  </div>
                </div>
                <StatusBadge status={db.status.toUpperCase()} className="ml-auto" />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {db.endpoint}:{db.port}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
              <MetricCard label="CPU" value={m.cpuUtilization} unit="%" warn={60} crit={80} />
              <UsageBar label="Memory" used={memUsed} total={m.totalMemoryMB} unit="MB" />
              <UsageBar label="Connections" used={m.databaseConnections} total={m.maxConnections} unit="" />
              <MetricCard label="Query Throughput" value={m.queryThroughput} unit="q/s" />
            </div>

            <div className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-4">
              <MetricCard label="Read IOPS" value={m.readIOPS} unit="iops" />
              <MetricCard label="Write IOPS" value={m.writeIOPS} unit="iops" />
              <MetricCard label="Read Latency" value={m.readLatencyMs} unit="ms" warn={2} crit={5} />
              <MetricCard label="Write Latency" value={m.writeLatencyMs} unit="ms" warn={3} crit={8} />
            </div>

            {m.slowQueries.length > 0 && (
              <div className="border-t border-border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Slow Queries ({m.slowQueries.length})
                </div>
                <div className="space-y-2">
                  {m.slowQueries.map((sq, i) => (
                    <div key={i} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{new Date(sq.timestamp).toLocaleString()} · {sq.user}</span>
                        <span className="font-medium text-warning">{sq.durationMs}ms</span>
                      </div>
                      <pre className="mt-1 overflow-x-auto text-xs text-foreground/80">{sq.query}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
