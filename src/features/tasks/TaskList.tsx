import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { Container, ArrowRight, Server } from "lucide-react";

export function TaskList() {
  const { selectedCluster, selectedService, selectTask } =
    useNavigationStore();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", selectedCluster, selectedService],
    queryFn: () => ecsApi.listTasks(selectedCluster!, selectedService!),
    enabled: !!selectedCluster && !!selectedService,
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
                Started
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Containers
              </th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const taskId = task.taskArn.split("/").pop() ?? "";
              return (
                <tr
                  key={task.taskArn}
                  onClick={() => selectTask(task.taskArn)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/50"
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
                    {new Date(task.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {task.containers.length}
                  </td>
                  <td className="px-4 py-3">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
