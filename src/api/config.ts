import { invoke } from "@tauri-apps/api/core";

export interface ClusterConfig {
    profile: string;
    region?: string;
    clusterName: string;
}

/** Global S3 storage config for SSM diagnostics file transfer */
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
}

export async function loadConfig(): Promise<ParsedConfig> {
    const raw = await invoke<string>("read_app_config");
    const parsed = JSON.parse(raw);

    // New format: { clusters: [...], storage: { ... } }
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.clusters)) {
        const clusters = parseClusterEntries(parsed.clusters);
        const storage = parseStorage(parsed.storage);
        return { clusters, storage };
    }

    // Legacy format: array of cluster configs (or single object)
    const entries: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const clusters = parseClusterEntries(entries);
    return { clusters, storage: null };
}

function parseClusterEntries(entries: unknown[]): ClusterConfig[] {
    if (entries.length === 0) {
        throw new Error("ecscope.config.json must contain at least one cluster config");
    }
    return entries.map((entry: any, i: number) => {
        if (!entry.profile || !entry.clusterName) {
            throw new Error(
                `ecscope.config.json cluster #${i + 1} must contain "profile" and "clusterName" fields`,
            );
        }
        return {
            profile: entry.profile,
            region: entry.region,
            clusterName: entry.clusterName,
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

/** @deprecated Use loadConfig() instead */
export async function loadAppConfigs(): Promise<ClusterConfig[]> {
    const config = await loadConfig();
    return config.clusters;
}

export async function loadAwsFiles(): Promise<AwsFiles> {
    return invoke<AwsFiles>("read_aws_files");
}
