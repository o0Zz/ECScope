import { create } from "zustand";
import type { ClusterConfig } from "@/config/config";
import type { ResolvedCredentials } from "@/config/aws-credentials";
import { loadConfig, loadAwsFiles } from "@/config/config";
import { resolveCredentials, createCredentialProvider, SsoLoginRequiredError } from "@/config/aws-credentials";
import { initAwsClients } from "@/api/clients";
import { invoke } from "@tauri-apps/api/core";
import { useNavigationStore } from "@/store/navigation";
import { log } from "@/lib/logger";
import { changeLanguage } from "@/i18n";
import { checkForUpdates } from "@/lib/update-checker";

type ConnectionStatus = "idle" | "loading" | "connected" | "error";

/** Provider of the active connection — kept to reset its back-off after an SSO login */
let activeProvider: ReturnType<typeof createCredentialProvider> | null = null;

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

interface ConfigState {
    clusters: ClusterConfig[];
    /** Auto-refresh interval in milliseconds */
    refreshIntervalMs: number;
    /** Default theme from config */
    theme: "dark" | "light";
    /** UI language from config */
    language: string;
    /** Currently active cluster config (after selection) */
    activeCluster: ClusterConfig | null;
    credentials: ResolvedCredentials | null;
    status: ConnectionStatus;
    error: string | null;
    /** Available update info, null if no update or not checked */
    updateAvailable: { version: string; url: string } | null;
    /** Cluster of the last connection attempt (used to retry after an SSO login) */
    lastClusterName: string | null;
    /** Set when the connection (or a credential refresh) needs `aws sso login` */
    ssoLoginRequired: boolean;
    ssoLoginPending: boolean;
    /** Credential refresh failure while connected (session expired, SSO token gone…) */
    sessionError: string | null;

    /** Load all cluster configs from the config file */
    initialize: () => Promise<void>;
    /** Connect to a specific cluster by name */
    connectToCluster: (clusterName: string) => Promise<void>;
    /** Run `aws sso login` for the current/last profile, then reconnect */
    ssoLogin: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
    clusters: [],
    refreshIntervalMs: 10_000,
    theme: "dark",
    language: "en",
    activeCluster: null,
    credentials: null,
    status: "idle",
    error: null,
    updateAvailable: null,
    lastClusterName: null,
    ssoLoginRequired: false,
    ssoLoginPending: false,
    sessionError: null,

    initialize: async () => {
        if (get().status === "loading") return;
        log.config.info(`Loading configuration...`);
        set({ status: "loading", error: null });

        try {
            const config = await loadConfig();
            log.config.info(`Loaded ${config.clusters.length} clusters (refresh: ${config.refreshPeriodSeconds}s)`);
            set({
                clusters: config.clusters,
                refreshIntervalMs: config.refreshPeriodSeconds * 1000,
                theme: config.theme,
                language: config.language,
                status: "idle",
            });
            changeLanguage(config.language);

            // Check for updates in the background (non-blocking)
            if (config.updateUrl) {
                checkForUpdates(config.updateUrl).then((result) => {
                    if (result?.hasUpdate) {
                        set({ updateAvailable: { version: result.latestVersion, url: result.downloadUrl } });
                    }
                });
            }
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

        set({
            status: "loading",
            error: null,
            lastClusterName: clusterName,
            ssoLoginRequired: false,
            sessionError: null,
        });
        log.config.debug(`Resolving credentials for profile ${clusterConfig.profile}`);

        try {
            const awsFiles = await loadAwsFiles();
            log.config.debug(`AWS config files loaded`);
            const credentials = await resolveCredentials(clusterConfig, awsFiles);
            log.config.info(`Credentials resolved for region ${credentials.region}`);
            activeProvider = createCredentialProvider(clusterConfig, credentials, (result) => {
                if ("credentials" in result) {
                    log.config.info(`Credentials refreshed for profile ${clusterConfig.profile}`);
                    set({ credentials: result.credentials, sessionError: null, ssoLoginRequired: false });
                } else {
                    log.config.error(`Credential refresh failed: ${errorMessage(result.error)}`);
                    set({
                        sessionError: errorMessage(result.error),
                        ssoLoginRequired: result.error instanceof SsoLoginRequiredError,
                    });
                }
            });
            initAwsClients(activeProvider, credentials.region, clusterConfig.clusterName);
            log.config.info(`AWS clients initialized`);
            set({ credentials, activeCluster: clusterConfig, status: "connected" });
            log.config.info(`Connected to cluster ${clusterName}`);
        } catch (err) {
            const message = errorMessage(err);
            log.config.error(`Failed to connect to cluster ${clusterName}: ${message}`);
            set({
                status: "error",
                error: message,
                activeCluster: null,
                credentials: null,
                ssoLoginRequired: err instanceof SsoLoginRequiredError,
            });
        }
    },

    ssoLogin: async () => {
        const { activeCluster, lastClusterName, clusters, status } = get();
        const target = activeCluster ?? clusters.find((c) => c.clusterName === lastClusterName);
        if (!target) return;

        log.config.info(`Starting AWS SSO login for profile ${target.profile}`);
        set({ ssoLoginPending: true });
        try {
            await invoke("aws_sso_login", { profile: target.profile });
        } catch (err) {
            log.config.error(`AWS SSO login failed: ${errorMessage(err)}`);
            set({ ssoLoginPending: false, sessionError: errorMessage(err) });
            return;
        }
        set({ ssoLoginPending: false });

        if (status === "connected" && activeProvider) {
            // Session refresh: the next SDK call re-resolves credentials with the new SSO token
            activeProvider.retryNow();
            set({ sessionError: null, ssoLoginRequired: false });
            return;
        }
        await get().connectToCluster(target.clusterName);
        if (get().status === "connected") useNavigationStore.getState().selectCluster(target.clusterName);
    },
}));
