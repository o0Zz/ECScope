import { create } from "zustand";
import type { ClusterConfig, StorageConfig } from "@/config/config";
import type { ResolvedCredentials } from "@/config/aws-credentials";
import { loadConfig, loadAwsFiles } from "@/config/config";
import { resolveCredentials } from "@/config/aws-credentials";
import { initAwsClients } from "@/api/clients";
import { log } from "@/lib/logger";

type ConnectionStatus = "idle" | "loading" | "connected" | "error";

interface ConfigState {
    clusters: ClusterConfig[];
    /** Global S3 storage config for file transfer */
    storage: StorageConfig | null;
    /** Auto-refresh interval in milliseconds */
    refreshIntervalMs: number;
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
    refreshIntervalMs: 10_000,
    activeCluster: null,
    credentials: null,
    status: "idle",
    error: null,

    initialize: async () => {
        if (get().status === "loading") return;
        log.config.info(`Loading configuration...`);
        set({ status: "loading", error: null });

        try {
            const config = await loadConfig();
            log.config.info(`Loaded ${config.clusters.length} clusters (refresh: ${config.refreshPeriodSeconds}s)`);
            set({ clusters: config.clusters, storage: config.storage, refreshIntervalMs: config.refreshPeriodSeconds * 1000, status: "idle" });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.config.error(`Failed to load configuration: ${message}`);
            set({ status: "error", error: message });
        }
    },

    connectToCluster: async (clusterName: string) => {
        log.config.info(`Connecting to cluster ${clusterName}`);
        const { clusters } = get();
        const clusterConfig = clusters.find((c) => c.clusterName === clusterName);
        if (!clusterConfig) {
            log.config.warn(`Cluster ${clusterName} not found in config`);
            return;
        }

        set({ status: "loading", error: null });
        log.config.debug(`Resolving credentials for profile ${clusterConfig.profile}`);

        try {
            const awsFiles = await loadAwsFiles();
            log.config.debug(`AWS config files loaded`);
            const credentials = await resolveCredentials(clusterConfig, awsFiles);
            log.config.info(`Credentials resolved for region ${credentials.region}`);
            initAwsClients(credentials, clusterConfig.clusterName);
            log.config.info(`AWS clients initialized`);
            set({ credentials, activeCluster: clusterConfig, status: "connected" });
            log.config.info(`Connected to cluster ${clusterName}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.config.error(`Failed to connect to cluster ${clusterName}: ${message}`);
            set({ status: "error", error: message, activeCluster: null, credentials: null });
        }
    },
}));
