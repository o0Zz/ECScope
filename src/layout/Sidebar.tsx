import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { cn } from "@/lib/utils";
import {
  Server,
  ChevronLeft,
  ChevronRight,
  Box,
} from "lucide-react";

export function Sidebar() {
  const { selectedCluster, selectCluster, sidebarCollapsed, toggleSidebar } =
    useNavigationStore();

  const { data: clusters, isLoading } = useQuery({
    queryKey: ["clusters"],
    queryFn: () => ecsApi.listClusters(),
  });

  return (
    <div
      className={cn(
        "flex flex-col border-r border-border bg-sidebar transition-all duration-200",
        sidebarCollapsed ? "w-12" : "w-60",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold tracking-wide text-foreground">
              ECScope
            </span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Cluster list */}
      <div className="flex-1 overflow-y-auto py-2">
        {!sidebarCollapsed && (
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Clusters
          </div>
        )}

        {isLoading && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            Loading…
          </div>
        )}

        {clusters?.map((cluster) => (
          <button
            key={cluster.clusterArn}
            onClick={() => selectCluster(cluster.clusterName)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
              selectedCluster === cluster.clusterName
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
            )}
            title={cluster.clusterName}
          >
            <Server className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{cluster.clusterName}</div>
                <div className="text-xs text-muted-foreground">
                  {cluster.activeServicesCount} services ·{" "}
                  {cluster.runningTasksCount} tasks
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      {!sidebarCollapsed && (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          us-east-1 · mock
        </div>
      )}
    </div>
  );
}
