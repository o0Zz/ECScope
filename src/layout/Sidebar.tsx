import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { initAwsClients } from "@/api";
import { cn } from "@/lib/utils";
import {
  Server,
  ChevronLeft,
  ChevronRight,
  Box,
} from "lucide-react";

function SidebarFooter() {
  const { activeCluster, credentials, status } = useConfigStore();
  if (status === "connected" && activeCluster) {
    return (
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {credentials?.region ?? activeCluster.region ?? "us-east-1"} · {activeCluster.profile}
        </div>
        <div className="mt-0.5 truncate opacity-60">{activeCluster.clusterName}</div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="border-t border-border px-3 py-2 text-xs text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Connection error
      </div>
    );
  }
  return (
    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
      {status === "loading" ? "Connecting…" : "Select a cluster"}
    </div>
  );
}

export function Sidebar() {
  const { selectedCluster, selectCluster, sidebarCollapsed, toggleSidebar } =
    useNavigationStore();
  const { clusters, connectToCluster } = useConfigStore();

  const handleSelectCluster = async (clusterName: string) => {
    console.log("[sidebar] handleSelectCluster:", clusterName);
    // First connect + init AWS clients BEFORE selecting the cluster in nav
    await connectToCluster(clusterName);
    const { status, credentials, activeCluster } = useConfigStore.getState();
    console.log("[sidebar] after connectToCluster:", { status, hasCredentials: !!credentials, activeCluster: activeCluster?.clusterName });
    if (status === "connected" && credentials && activeCluster) {
      initAwsClients(credentials, activeCluster.clusterName);
      console.log("[sidebar] AWS clients initialized for", activeCluster.clusterName);
    } else {
      console.warn("[sidebar] NOT initializing AWS clients — status:", status);
    }
    // NOW select the cluster — this triggers ServiceList to mount/query using AWS
    selectCluster(clusterName);
    console.log("[sidebar] cluster selected in navigation:", clusterName);
  };

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

        {clusters.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No clusters configured
          </div>
        )}

        {clusters.map((cluster) => (
          <button
            key={cluster.clusterName}
            onClick={() => handleSelectCluster(cluster.clusterName)}
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
                  {cluster.profile}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      {!sidebarCollapsed && (
        <SidebarFooter />
      )}
    </div>
  );
}
