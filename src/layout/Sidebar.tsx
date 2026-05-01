import { useState } from "react";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";
import { Server, ChevronLeft, ChevronRight, Box, AlertCircle, Loader2 } from "lucide-react";

const logger = createLogger("Sidebar");

function SidebarFooter({ lastClickedCluster }: { lastClickedCluster: string | null }) {
    const { activeCluster, credentials, status, error } = useConfigStore();
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
            <div className="border-t border-border px-3 py-2 text-xs text-destructive" title={error ?? ""}>
                <div className="flex items-center gap-1 font-medium">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    Connection error
                </div>
                {lastClickedCluster && (
                    <div className="mt-0.5 truncate text-[11px] opacity-70">{lastClickedCluster}</div>
                )}
                {error && <div className="mt-0.5 break-words text-[11px] leading-tight opacity-80">{error}</div>}
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
    const { selectedCluster, selectCluster, sidebarCollapsed, toggleSidebar } = useNavigationStore();
    const { clusters, connectToCluster, status } = useConfigStore();
    const [lastClickedCluster, setLastClickedCluster] = useState<string | null>(null);

    const handleSelectCluster = async (clusterName: string) => {
        setLastClickedCluster(clusterName);
        await connectToCluster(clusterName);
        const { status: nextStatus } = useConfigStore.getState();
        if (nextStatus === "connected") {
            selectCluster(clusterName);
            logger.info(`Cluster selected: ${clusterName}`);
        } else {
            logger.warn(`Connection failed — not selecting cluster: ${clusterName}`);
        }
    };

    // Group clusters by their config `group` field. Ungrouped clusters go under their clusterName.
    const grouped = (() => {
        const groups = new Map<string, typeof clusters>();
        for (const cluster of clusters) {
            const key = cluster.group ?? cluster.clusterName;
            const arr = groups.get(key) ?? [];
            arr.push(cluster);
            groups.set(key, arr);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    })();

    return (
        <div
            className={cn(
                "relative flex flex-col border-r border-border bg-sidebar transition-all duration-200",
                sidebarCollapsed ? "w-12" : "w-60",
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-3 py-3">
                {!sidebarCollapsed && (
                    <div className="flex items-center gap-2">
                        <Box className="h-5 w-5 text-primary" />
                        <span className="text-sm font-bold tracking-wide text-foreground">ECScope</span>
                    </div>
                )}
                <button
                    onClick={toggleSidebar}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
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
                    <div className="px-3 py-4 text-xs text-muted-foreground">No clusters configured</div>
                )}

                {grouped.map(([groupName, groupClusters]) => (
                    <div key={groupName} className="mb-2">
                        {sidebarCollapsed ? (
                            <div
                                className="py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60"
                                title={groupName}
                            >
                                {groupName.slice(0, 2)}
                            </div>
                        ) : (
                            <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                {groupName}
                            </div>
                        )}
                        {groupClusters.map((cluster) => {
                            const isTarget = lastClickedCluster === cluster.clusterName;
                            const isConnecting = isTarget && status === "loading";
                            const hasError = isTarget && status === "error";
                            const infoLine = cluster.region
                                ? `${cluster.region} · ${cluster.profile}`
                                : cluster.profile;
                            const titleHeader = hasError
                                ? `${cluster.clusterName} — connection error`
                                : cluster.clusterName;
                            return (
                                <button
                                    key={cluster.clusterName}
                                    onClick={() => handleSelectCluster(cluster.clusterName)}
                                    disabled={isConnecting}
                                    className={cn(
                                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-l-4",
                                        selectedCluster === cluster.clusterName
                                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                            : hasError
                                              ? "bg-destructive/10 text-destructive"
                                              : isConnecting
                                                ? "bg-accent/40 text-foreground"
                                                : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                    style={{
                                        borderLeftColor: cluster.color ? `#${cluster.color}` : "transparent",
                                    }}
                                    title={`${titleHeader}\n${infoLine}`}
                                >
                                    {isConnecting ? (
                                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                    ) : hasError ? (
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                    ) : (
                                        <Server className="h-4 w-4 shrink-0" />
                                    )}
                                    {!sidebarCollapsed && (
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">
                                                {cluster.icon && <span className="mr-1">{cluster.icon}</span>}
                                                {cluster.clusterName}
                                            </div>
                                            <div className="truncate text-xs text-muted-foreground">
                                                {cluster.region
                                                    ? `${cluster.region} · ${cluster.profile}`
                                                    : cluster.profile}
                                            </div>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Footer */}
            {!sidebarCollapsed && <SidebarFooter lastClickedCluster={lastClickedCluster} />}
        </div>
    );
}
