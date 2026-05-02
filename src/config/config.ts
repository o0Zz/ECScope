import { invoke } from "@tauri-apps/api/core";

export interface ClusterConfig {
    profile: string;
    region?: string;
    clusterName: string;
    /** SSH username for SFTP file transfer (default: "ec2-user") */
    sshUser?: string;
    /** Optional sidebar accent color for this cluster (hex RGB, e.g. "ff0000") */
    color?: string;
    /** Group name for sidebar grouping */
    group?: string;
    /** Optional emoji/icon displayed before the cluster name (e.g. "⚠️") */
    icon?: string;
}

/** Global S3 storage config for file transfer */
export interface StorageConfig {
    s3Bucket: string;
    s3AccessKeyId: string;
    s3SecretAccessKey: string;
    /** Region of the S3 bucket (defaults to first cluster's region) */
    s3Region?: string;
}

export interface AwsFiles {
    credentials: string;
    config: string;
}

export interface ParsedConfig {
    clusters: ClusterConfig[];
    storage: StorageConfig | null;
    refreshPeriodSeconds: number;
    /** Default theme: "dark" or "light" */
    theme: "dark" | "light";
    /** UI language: "en" (clean) or "en-emoji" (with emojis) */
    language: string;
}

const DEFAULT_REFRESH_PERIOD = 10;

export async function loadConfig(): Promise<ParsedConfig> {
    const raw = await invoke<string>("read_app_config");
    const parsed = JSON.parse(raw);

    // New format: { clusters: [...], storage: { ... } }
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.clusters)) {
        const clusters = parseClusterEntries(parsed.clusters);
        const storage = parseStorage(parsed.storage);
        const refreshPeriodSeconds =
            typeof parsed.refreshPeriodSeconds === "number" && parsed.refreshPeriodSeconds > 0
                ? parsed.refreshPeriodSeconds
                : DEFAULT_REFRESH_PERIOD;
        const theme = parsed.theme === "light" ? "light" : "dark";
        const language = typeof parsed.language === "string" ? parsed.language : "en";
        return { clusters, storage, refreshPeriodSeconds, theme, language };
    }

    // Legacy format: array of cluster configs (or single object)
    const entries: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const clusters = parseClusterEntries(entries);
    return { clusters, storage: null, refreshPeriodSeconds: DEFAULT_REFRESH_PERIOD, theme: "dark", language: "en" };
}

function parseClusterEntries(entries: unknown[]): ClusterConfig[] {
    if (entries.length === 0) {
        throw new Error("ecscope.config.json must contain at least one cluster config");
    }
    return entries.map((entry: any, i: number) => {
        if (!entry.profile || !entry.clusterName) {
            throw new Error(`ecscope.config.json cluster #${i + 1} must contain "profile" and "clusterName" fields`);
        }
        return {
            profile: entry.profile,
            region: entry.region,
            clusterName: entry.clusterName,
            color: typeof entry.color === "string" && /^[0-9a-fA-F]{6}$/.test(entry.color) ? entry.color : undefined,
            group: typeof entry.group === "string" && entry.group.trim() ? entry.group.trim() : undefined,
            icon: typeof entry.icon === "string" && entry.icon.trim() ? entry.icon.trim() : undefined,
        };
    });
}

function parseStorage(raw: any): StorageConfig | null {
    if (!raw || !raw.s3Bucket) return null;
    return {
        s3Bucket: raw.s3Bucket,
        s3AccessKeyId: raw.s3AccessKeyId ?? "",
        s3SecretAccessKey: raw.s3SecretAccessKey ?? "",
        s3Region: raw.s3Region,
    };
}

export async function loadAwsFiles(): Promise<AwsFiles> {
    return invoke<AwsFiles>("read_aws_files");
}
