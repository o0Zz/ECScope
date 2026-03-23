import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { Cog, ArrowRight } from "lucide-react";

export function ServiceList() {
  const { selectedCluster, selectService } = useNavigationStore();

  const { data: services, isLoading } = useQuery({
    queryKey: ["services", selectedCluster],
    queryFn: () => ecsApi.listServices(selectedCluster!),
    enabled: !!selectedCluster,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading services…
      </div>
    );
  }

  if (!services?.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No services found.
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Services
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({services.length})
        </span>
      </h2>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Service
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                Desired
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                Running
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                Pending
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Launch Type
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Task Def
              </th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr
                key={svc.serviceArn}
                onClick={() => selectService(svc.serviceName)}
                className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Cog className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      {svc.serviceName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={svc.status} />
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {svc.desiredCount}
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {svc.runningCount}
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {svc.pendingCount}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {svc.launchType}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {svc.taskDefinition}
                </td>
                <td className="px-4 py-3">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
