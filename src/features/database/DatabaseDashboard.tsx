import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { Database, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function DatabaseDashboard() {
  const { selectedCluster } = useNavigationStore();

  const { data: databases, isLoading } = useQuery({
    queryKey: ["databases", selectedCluster],
    queryFn: () => ecsApi.listDatabases(selectedCluster!),
    enabled: !!selectedCluster,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading databases…
      </div>
    );
  }

  if (!databases?.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No databases found.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-lg font-semibold text-foreground">
        Database Metrics
        <span className="ml-2 text-sm font-normal text-muted-foreground">({databases.length})</span>
      </h2>

      {databases.map((db) => {
        const m = db.metrics;
        const memUsed = m.totalMemoryMB - m.freeableMemoryMB;

        return (
          <div key={db.dbInstanceId} className="rounded-lg border border-border bg-card">
            {/* DB header */}
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

            {/* Metrics grid */}
            <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
              <MetricCard label="CPU" value={m.cpuUtilization} unit="%" warn={60} crit={80} />
              <UsageBar label="Memory" used={memUsed} total={m.totalMemoryMB} unit="MB" />
              <UsageBar label="Connections" used={m.databaseConnections} total={m.maxConnections} unit="" />
              <MetricCard label="Query Throughput" value={m.queryThroughput} unit="q/s" />
            </div>

            {/* IOPS & Latency */}
            <div className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-4">
              <MetricCard label="Read IOPS" value={m.readIOPS} unit="iops" />
              <MetricCard label="Write IOPS" value={m.writeIOPS} unit="iops" />
              <MetricCard label="Read Latency" value={m.readLatencyMs} unit="ms" warn={2} crit={5} />
              <MetricCard label="Write Latency" value={m.writeLatencyMs} unit="ms" warn={3} crit={8} />
            </div>

            {/* Slow queries */}
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
