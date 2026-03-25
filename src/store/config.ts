import { create } from "zustand";
import type { ClusterConfig, StorageConfig } from "@/api/config";
import type { ResolvedCredentials } from "@/api/aws-credentials";
import { loadConfig, loadAwsFiles } from "@/api/config";
import { resolveCredentials } from "@/api/aws-credentials";

type ConnectionStatus = "idle" | "loading" | "connected" | "error";

interface ConfigState {
    clusters: ClusterConfig[];
    /** Global S3 storage config for diagnostics */
    storage: StorageConfig | null;
    /** Currently active cluster config (after selection) */
    activeCluster: ClusterConfig | null;
    credentials: ResolvedCredentials | null;
    status: ConnectionStatus;
    error: string | null;

    /** Load all cluster configs from the config file */
    initialize: () => Promise<void>;
    /** Connect to a specific cluster by name */
    connectToCluster: (clusterName: string) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
    clusters: [],
    storage: null,
    activeCluster: null,
    credentials: null,
    status: "idle",
    error: null,

    initialize: async () => {
        if (get().status === "loading") return;
        console.log("[config-store] initialize: loading configs...");
        set({ status: "loading", error: null });

        try {
            const config = await loadConfig();
            console.log("[config-store] initialize: loaded clusters", config.clusters.map(c => c.clusterName), "storage:", !!config.storage);
            set({ clusters: config.clusters, storage: config.storage, status: "idle" });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[config-store] initialize ERROR", message);
            set({ status: "error", error: message });
        }
    },

    connectToCluster: async (clusterName: string) => {
        console.log("[config-store] connectToCluster:", clusterName);
        const { clusters } = get();
        const clusterConfig = clusters.find((c) => c.clusterName === clusterName);
        if (!clusterConfig) {
            console.warn("[config-store] connectToCluster: cluster not found in config!", { clusterName, available: clusters.map(c => c.clusterName) });
            return;
        }

        set({ status: "loading", error: null, activeCluster: clusterConfig });
        console.log("[config-store] connectToCluster: resolving credentials for profile", clusterConfig.profile);

        try {
            const awsFiles = await loadAwsFiles();
            console.log("[config-store] connectToCluster: AWS files loaded");
            const credentials = await resolveCredentials(clusterConfig, awsFiles);
            console.log("[config-store] connectToCluster: credentials resolved", { region: credentials.region, hasAccessKey: !!credentials.accessKeyId });
            set({ credentials, status: "connected" });
            console.log("[config-store] connectToCluster: status set to connected");
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[config-store] connectToCluster ERROR", message);
            set({ status: "error", error: message });
        }
    },
}));
