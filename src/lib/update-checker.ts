import { invoke } from "@tauri-apps/api/core";
import { log } from "@/lib/logger";

interface LatestRelease {
    version: string;
    url: string;
}

export interface UpdateCheckResult {
    hasUpdate: boolean;
    latestVersion: string;
    downloadUrl: string;
}

/**
 * Parse a version string like "v1.2.3" or "1.2.3" into [major, minor, patch].
 */
function parseVersion(v: string): [number, number, number] | null {
    const match = v.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Returns true if `remote` is strictly newer than `current`.
 */
function isNewer(remote: string, current: string): boolean {
    const r = parseVersion(remote);
    const c = parseVersion(current);
    if (!r || !c) return false;
    if (r[0] !== c[0]) return r[0] > c[0];
    if (r[1] !== c[1]) return r[1] > c[1];
    return r[2] > c[2];
}

/**
 * Fetch latest.json from the given URL and compare with current app version.
 * Returns null if no update or on any error (silent failure).
 */
export async function checkForUpdates(updateUrl: string): Promise<UpdateCheckResult | null> {
    try {
        const body = await invoke<string>("fetch_url", { url: updateUrl });
        const data: LatestRelease = JSON.parse(body);

        if (!data.version || !data.url) {
            log.config.warn("Update check: latest.json missing version or url field");
            return null;
        }

        const currentVersion = __APP_VERSION__;
        const hasUpdate = isNewer(data.version, currentVersion);

        log.config.info(`Update check: current=${currentVersion}, latest=${data.version}, hasUpdate=${hasUpdate}`);

        return {
            hasUpdate,
            latestVersion: data.version,
            downloadUrl: data.url,
        };
    } catch (err) {
        log.config.warn(`Update check failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
