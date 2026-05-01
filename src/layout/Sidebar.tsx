import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";
import { Server, ChevronLeft, ChevronRight, Box } from "lucide-react";

const logger = createLogger("Sidebar");

function hexToRgb(hex?: string): { r: number; g: number; b: number } | null {
    if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
}

// Perceived lightness (BT.709 luma), 0 (black) → 1 (white).
// Clusters with no color are treated as "very light" so they stay on top.
function colorLightness(hex?: string): number {
    const rgb = hexToRgb(hex);
    if (!rgb) return 1;
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

// Red-dominant heuristic: red channel clearly above green and blue.
function isRedish(hex?: string): boolean {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    return rgb.r > 150 && rgb.r > rgb.g + 50 && rgb.r > rgb.b + 50;
}

function clusterGroup(name: string): string {
    const idx = name.indexOf("-");
    return idx === -1 ? name : name.slice(0, idx);
}

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
    const { selectedCluster, selectCluster, sidebarCollapsed, toggleSidebar } = useNavigationStore();
    const { clusters, connectToCluster } = useConfigStore();

    const handleSelectCluster = async (clusterName: string) => {
        await connectToCluster(clusterName);
        const { status } = useConfigStore.getState();
        if (status === "connected") {
            selectCluster(clusterName);
            logger.info(`Cluster selected: ${clusterName}`);
        } else {
            logger.warn(`Connection failed — not selecting cluster: ${clusterName}`);
        }
    };

    // Group by prefix (split before the first "-"), sort each group from light → dark/red
    // so problematic clusters fall to the bottom of their group.
    const grouped = (() => {
        const groups = new Map<string, typeof clusters>();
        for (const cluster of clusters) {
            const key = clusterGroup(cluster.clusterName);
            const arr = groups.get(key) ?? [];
            arr.push(cluster);
            groups.set(key, arr);
        }
        for (const arr of groups.values()) {
            arr.sort((a, b) => colorLightness(b.color) - colorLightness(a.color));
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
                        {!sidebarCollapsed && (
                            <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                {groupName}
                            </div>
                        )}
                        {groupClusters.map((cluster) => {
                            const redAlert = isRedish(cluster.color);
                            return (
                                <button
                                    key={cluster.clusterName}
                                    onClick={() => handleSelectCluster(cluster.clusterName)}
                                    className={cn(
                                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-l-4",
                                        selectedCluster === cluster.clusterName
                                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                            : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                    style={{
                                        borderLeftColor: cluster.color ? `#${cluster.color}` : "transparent",
                                    }}
                                    title={redAlert ? `${cluster.clusterName} — alerte` : cluster.clusterName}
                                >
                                    <Server className="h-4 w-4 shrink-0" />
                                    {!sidebarCollapsed && (
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1 truncate font-medium">
                                                {redAlert && (
                                                    <span aria-label="warning" title="Cluster en alerte">
                                                        ⚠️
                                                    </span>
                                                )}
                                                <span className="truncate">{cluster.clusterName}</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">{cluster.profile}</div>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Footer */}
            {!sidebarCollapsed && <SidebarFooter />}
        </div>
    );
}
