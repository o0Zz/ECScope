import { invoke } from "@tauri-apps/api/core";

export interface ClusterConfig {
    profile: string;
    region?: string;
    clusterName: string;
}

/** @deprecated Use ClusterConfig[] instead */
export type AppConfig = ClusterConfig;

export interface AwsFiles {
    credentials: string;
    config: string;
}

export async function loadAppConfigs(): Promise<ClusterConfig[]> {
    const raw = await invoke<string>("read_app_config");
    const parsed = JSON.parse(raw);

    // Support both single object (legacy) and array format
    const entries: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

    if (entries.length === 0) {
        throw new Error("ecscope.config.json must contain at least one cluster config");
    }

    return entries.map((entry: any, i: number) => {
        if (!entry.profile || !entry.clusterName) {
            throw new Error(
                `ecscope.config.json entry #${i + 1} must contain "profile" and "clusterName" fields`,
            );
        }
        return {
            profile: entry.profile,
            region: entry.region,
            clusterName: entry.clusterName,
        };
    });
}

/** @deprecated Use loadAppConfigs() instead */
export async function loadAppConfig(): Promise<ClusterConfig> {
    const configs = await loadAppConfigs();
    return configs[0];
}

export async function loadAwsFiles(): Promise<AwsFiles> {
    return invoke<AwsFiles>("read_aws_files");
}
