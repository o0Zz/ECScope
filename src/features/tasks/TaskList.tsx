import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import type { EcsTask } from "@/api/types";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { ServiceMetricsChart } from "@/components/ServiceMetricsChart";
import { Container, Server, ChevronDown, FileCode, Copy, Check, KeyRound, Terminal, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge } from "@/lib/format";
import { invoke } from "@tauri-apps/api/core";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1 inline-flex items-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
      title="Copy value"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function EnvVarPanel({ task }: { task: EcsTask }) {
  const [filter, setFilter] = useState("");
  const lowerFilter = filter.toLowerCase();

  const totalEnvCount = task.containers.reduce((s, c) => s + c.environment.length + c.secrets.length, 0);
  if (totalEnvCount === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">
        No environment variables found in the task definition.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Environment Variables</span>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="Filter…"
          className="ml-2 h-6 w-48 rounded border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {task.containers.map((container) => {
        const envRows: { name: string; value: string; source?: string; isSecret: boolean; resolved: boolean }[] = container.environment
          .filter((e) => e.name.toLowerCase().includes(lowerFilter) || e.value.toLowerCase().includes(lowerFilter))
          .map((e) => ({ name: e.name, value: e.value, isSecret: false, resolved: true }));
        const secretRows: typeof envRows = container.secrets
          .filter((s) => {
            const resolved = s.resolvedValue ?? s.valueFrom;
            return s.name.toLowerCase().includes(lowerFilter) || resolved.toLowerCase().includes(lowerFilter);
          })
          .map((s) => ({ name: s.name, value: s.resolvedValue ?? "", source: s.valueFrom, isSecret: true, resolved: !!s.resolvedValue }));
        const allRows = [...envRows, ...secretRows].sort((a, b) => a.name.localeCompare(b.name));

        if (allRows.length === 0 && filter) return null;
        return (
          <div key={container.containerArn} className="rounded border border-border bg-card">
            <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              {container.name}
              <span className="ml-1.5 text-muted-foreground/60">
                ({envRows.length} env{secretRows.length > 0 && `, ${secretRows.length} secrets`})
              </span>
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <tbody>
                  {allRows.map((row) => (
                    <tr key={row.name} className="border-b border-border last:border-b-0 hover:bg-accent/30">
                      <td className="w-1/3 px-3 py-1 font-mono font-medium text-foreground align-top">
                        <span className="flex items-center gap-1">
                          {row.isSecret && <span title={`Source: ${row.source}`}><KeyRound className="h-3 w-3 text-warning shrink-0" /></span>}
                          {row.name}
                        </span>
                      </td>
                      <td className="px-3 py-1 font-mono text-muted-foreground break-all">
                        {row.isSecret ? (
                          row.resolved ? (
                            <span>{row.value}</span>
                          ) : (
                            <span className="text-warning/60 italic">{row.source}</span>
                          )
                        ) : (
                          row.value
                        )}
                        <CopyButton text={row.isSecret && row.resolved ? row.value : row.isSecret ? (row.source ?? "") : row.value} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({
  task,
  expanded,
  onToggleEnv,
  clusterName,
  profile,
  region,
}: {
  task: EcsTask;
  expanded: boolean;
  onToggleEnv: () => void;
  clusterName: string;
  profile: string;
  region: string;
}) {
  const taskId = task.taskArn.split("/").pop() ?? "";
  const containerName = task.containers[0]?.name ?? "";

  const handleExec = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke("open_ecs_exec", {
      params: {
        cluster: clusterName,
        task_id: taskId,
        container: containerName,
        profile,
        region,
      },
    }).catch((err) => console.error("[ECScope] ECS exec failed:", err));
  };

  const container = task.containers[0];
  const canStreamLogs = !!task.ec2InstanceId && !!container?.runtimeId;
  const handleLogs = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canStreamLogs) return;
    invoke("open_ecs_logs", {
      params: {
        instance_id: task.ec2InstanceId,
        runtime_id: container.runtimeId,
        container_name: container.name,
        profile,
        region,
      },
    }).catch((err) => console.error("[ECScope] ECS logs failed:", err));
  };

  return (
    <>
      <tr
        className="border-b border-border last:border-b-0 hover:bg-accent/50"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Container className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-xs font-medium text-foreground">
              {taskId}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={task.lastStatus} />
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={task.healthStatus} />
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {task.launchType}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
          {task.cpu} / {task.memory} MB
        </td>
        <td className="px-4 py-3">
          {task.ec2InstanceId ? (
            <div className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-xs text-foreground">{task.ec2InstanceId}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Fargate</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {formatAge(task.startedAt)}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {task.containers.length}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={handleExec}
              className="rounded p-1 transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
              title={`Shell into ${containerName}`}
            >
              <Terminal className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleLogs}
              className={cn(
                "rounded p-1 transition-colors hover:bg-accent",
                canStreamLogs ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed",
              )}
              title={canStreamLogs ? `Live logs for ${containerName}` : "Docker logs requires EC2 launch type"}
              disabled={!canStreamLogs}
            >
              <ScrollText className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleEnv(); }}
              className={cn(
                "rounded p-1 transition-colors hover:bg-accent",
                expanded ? "text-foreground" : "text-muted-foreground",
              )}
              title="Show environment variables"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <FileCode className="h-3.5 w-3.5" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={9} className="bg-muted/20">
            <EnvVarPanel task={task} />
          </td>
        </tr>
      )}
    </>
  );
}

export function TaskList() {
  const { selectedCluster, selectedService } =
    useNavigationStore();
  const { activeCluster } = useConfigStore();
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", selectedCluster, selectedService],
    queryFn: () => ecsApi.listTasks(selectedCluster!, selectedService!),
    enabled: !!selectedCluster && !!selectedService,
    refetchInterval: refreshIntervalMs,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading tasks…
      </div>
    );
  }

  if (!tasks?.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No tasks found.
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Tasks
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({tasks.length})
        </span>
      </h2>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Task ID
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Health
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Launch Type
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                CPU / Memory
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Node
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Age
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Containers
              </th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <TaskRow
                key={task.taskArn}
                task={task}
                expanded={expandedTask === task.taskArn}
                onToggleEnv={() =>
                  setExpandedTask(expandedTask === task.taskArn ? null : task.taskArn)
                }
                clusterName={selectedCluster!}
                profile={activeCluster?.profile ?? ""}
                region={activeCluster?.region ?? "us-east-1"}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* CPU & Memory usage chart */}
      <ServiceMetricsChart
        clusterName={selectedCluster!}
        serviceName={selectedService!}
      />
    </div>
  );
}
