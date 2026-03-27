import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { ServiceMetricsChart } from "@/components/ServiceMetricsChart";
import { ServiceEventsTimeline } from "@/components/ServiceEventsTimeline";
import { DeploymentStatusPanel } from "@/components/DeploymentStatusPanel";
import { Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TaskDefinitionEditor } from "@/components/TaskDefinitionEditor";
import { TaskRow } from "./TaskRow";

export function TaskList() {
  const { selectedCluster, selectedService } =
    useNavigationStore();
  const { activeCluster } = useConfigStore();
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [confirmStopTask, setConfirmStopTask] = useState<string | null>(null);
  const [showTaskDefEditor, setShowTaskDefEditor] = useState(false);
  const queryClient = useQueryClient();

  const stopMutation = useMutation({
    mutationFn: (taskArn: string) =>
      ecsApi.stopTask(selectedCluster!, taskArn),
    onSuccess: () => {
      setConfirmStopTask(null);
      // Delay refetch so the task doesn't vanish instantly
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["tasks", selectedCluster, selectedService] });
        queryClient.invalidateQueries({ queryKey: ["services", selectedCluster] });
      }, 3000);
    },
  });

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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Tasks
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({tasks.length})
          </span>
        </h2>
        <button
          onClick={() => setShowTaskDefEditor(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Edit Task Definition"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit Task Definition
        </button>
      </div>
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
                onStop={() => setConfirmStopTask(task.taskArn)}
                isStopping={stopMutation.isPending && stopMutation.variables === task.taskArn}
                clusterName={selectedCluster!}
                profile={activeCluster?.profile ?? ""}
                region={activeCluster?.region ?? "us-east-1"}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation dialog for stop task */}
      <ConfirmDialog
        open={!!confirmStopTask}
        title="Stop Task"
        message="Are you sure you want to stop this task?"
        detail={confirmStopTask?.split("/").pop()}
        confirmLabel="Stop Task"
        confirmingLabel="Stopping…"
        variant="destructive"
        isPending={stopMutation.isPending}
        onConfirm={() => stopMutation.mutate(confirmStopTask!)}
        onCancel={() => setConfirmStopTask(null)}
      />

      {/* Deployment status & rollback */}
      <DeploymentStatusPanel
        clusterName={selectedCluster!}
        serviceName={selectedService!}
      />

      {/* CPU & Memory usage chart */}
      <ServiceMetricsChart
        clusterName={selectedCluster!}
        serviceName={selectedService!}
      />

      {/* Service events timeline */}
      <ServiceEventsTimeline
        clusterName={selectedCluster!}
        serviceName={selectedService!}
      />

      {/* Task definition editor modal */}
      {showTaskDefEditor && tasks[0] && (
        <TaskDefinitionEditor
          clusterName={selectedCluster!}
          serviceName={selectedService!}
          taskDefinition={tasks[0].taskDefinitionArn}
          onClose={() => setShowTaskDefEditor(false)}
        />
      )}
    </div>
  );
}
