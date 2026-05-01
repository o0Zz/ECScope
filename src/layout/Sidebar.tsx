import { useState } from "react";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";
import { Server, ChevronLeft, ChevronRight, Box, AlertCircle, Loader2 } from "lucide-react";

const logger = createLogger("Sidebar");

function hexToRgb(hex?: string): { r: number; g: number; b: number } | null {
    if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
}

// HSL conversion for hue-based color classification.
function hexToHsl(hex?: string): { h: number; s: number; l: number } | null {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: h * 60, s, l };
}

// Red-dominant heuristic: red channel clearly above green and blue.
function isRedish(hex?: string): boolean {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    return rgb.r > 150 && rgb.r > rgb.g + 50 && rgb.r > rgb.b + 50;
}

// Color category ranking — lower = healthier visually.
//   0 = blue / green / cyan / purple / no-color (cool, calm)
//   1 = yellow / orange (warning)
//   2 = red (alert)
function colorRank(hex?: string): number {
    if (isRedish(hex)) return 2;
    const hsl = hexToHsl(hex);
    if (!hsl || hsl.s < 0.15) return 0; // grey / desaturated / no color → cool
    // Hue wheel: 0=red, 60=yellow, 120=green, 180=cyan, 240=blue, 300=magenta
    if (hsl.h >= 345 || hsl.h <= 15) return 2; // red wrap-around
    if (hsl.h > 15 && hsl.h <= 65) return 1; // orange + yellow
    return 0; // green / cyan / blue / purple
}

function clusterGroup(name: string): string {
    const idx = name.indexOf("-");
    return idx === -1 ? name : name.slice(0, idx);
}

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

    // Group by prefix (split before the first "-"), sort each group by color category
    // so cool clusters (blue/green) stay on top, yellow/orange in the middle, red at the bottom.
    const grouped = (() => {
        const groups = new Map<string, typeof clusters>();
        for (const cluster of clusters) {
            const key = clusterGroup(cluster.clusterName);
            const arr = groups.get(key) ?? [];
            arr.push(cluster);
            groups.set(key, arr);
        }
        for (const arr of groups.values()) {
            arr.sort((a, b) => colorRank(a.color) - colorRank(b.color));
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
                            const redAlert = isRedish(cluster.color);
                            const isTarget = lastClickedCluster === cluster.clusterName;
                            const isConnecting = isTarget && status === "loading";
                            const hasError = isTarget && status === "error";
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
                                    title={
                                        hasError
                                            ? `${cluster.clusterName} — connection error`
                                            : redAlert
                                              ? `${cluster.clusterName} — alerte`
                                              : cluster.clusterName
                                    }
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
                                            <div className="flex items-center gap-1 truncate font-medium">
                                                {redAlert && (
                                                    <span aria-label="warning" title="Cluster en alerte">
                                                        ⚠️
                                                    </span>
                                                )}
                                                <span className="truncate">{cluster.clusterName}</span>
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
