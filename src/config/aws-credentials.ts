import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { invoke } from "@tauri-apps/api/core";
import type { ClusterConfig, AwsFiles } from "./config";
import { loadAwsFiles } from "./config";

export interface ResolvedCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
    /** Undefined for long-lived static keys */
    expiration?: Date;
}

/** Credential shape accepted by AWS SDK v3 clients (`credentials: provider`) */
export type CredentialProvider = () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
}>;

/** Thrown when the profile uses IAM Identity Center and the cached SSO token is missing or expired */
export class SsoLoginRequiredError extends Error {
    constructor(
        public profile: string,
        detail: string,
    ) {
        super(`AWS SSO session for profile "${profile}" is expired or missing. ${detail}`.trim());
        this.name = "SsoLoginRequiredError";
    }
}

/** Refresh temporary credentials this long before they expire */
const REFRESH_MARGIN_MS = 5 * 60_000;
const RETRY_AFTER_FAILURE_MS = 30_000;

type IniSection = Record<string, string>;
type IniFile = Record<string, IniSection>;

/** Parse an INI-format AWS file into { [sectionName]: { key: value } } */
function parseIniFile(content: string): IniFile {
    const result: IniFile = {};
    let currentSection = "";

    for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || line.startsWith(";")) continue;

        const sectionMatch = line.match(/^\[(.+)]$/);
        if (sectionMatch) {
            // Normalize: "[profile foo]" → "foo", "[foo]" → "foo"
            currentSection = sectionMatch[1].replace(/^profile\s+/, "").trim();
            if (!result[currentSection]) result[currentSection] = {};
            continue;
        }

        const eqIdx = line.indexOf("=");
        if (eqIdx > 0 && currentSection) {
            const key = line.slice(0, eqIdx).trim();
            const value = line.slice(eqIdx + 1).trim();
            result[currentSection][key] = value;
        }
    }
    return result;
}

export async function resolveCredentials(appConfig: ClusterConfig, awsFiles: AwsFiles): Promise<ResolvedCredentials> {
    const credSections = parseIniFile(awsFiles.credentials);
    const configSections = parseIniFile(awsFiles.config);

    const profileConfig = configSections[appConfig.profile] ?? {};
    const region =
        appConfig.region || profileConfig.region || configSections[profileConfig.source_profile]?.region || "us-east-1";

    const directCreds = credSections[appConfig.profile];
    const sourceCreds = profileConfig.source_profile ? credSections[profileConfig.source_profile] : undefined;
    const hasKeys = (s?: IniSection) => !!s?.aws_access_key_id && !!s?.aws_secret_access_key;
    // mfa_serial needs an interactive token code — let the CLI (and its credential cache) deal with it
    const needsCli = !!profileConfig.mfa_serial;

    // role_arn + source_profile with static source keys: assume the role ourselves
    if (!needsCli && profileConfig.role_arn && hasKeys(sourceCreds)) {
        const stsClient = new STSClient({
            region,
            credentials: {
                accessKeyId: sourceCreds!.aws_access_key_id,
                secretAccessKey: sourceCreds!.aws_secret_access_key,
                sessionToken: sourceCreds!.aws_session_token,
            },
        });

        const assumed = await stsClient.send(
            new AssumeRoleCommand({
                RoleArn: profileConfig.role_arn,
                RoleSessionName: "ecscope-session",
                DurationSeconds: 3600,
                ExternalId: profileConfig.external_id,
            }),
        );

        if (!assumed.Credentials) {
            throw new Error(`Failed to assume role ${profileConfig.role_arn}`);
        }

        return {
            accessKeyId: assumed.Credentials.AccessKeyId!,
            secretAccessKey: assumed.Credentials.SecretAccessKey!,
            sessionToken: assumed.Credentials.SessionToken,
            expiration: assumed.Credentials.Expiration,
            region,
        };
    }

    // Static keys straight from ~/.aws/credentials
    if (!needsCli && !profileConfig.role_arn && hasKeys(directCreds)) {
        return {
            accessKeyId: directCreds.aws_access_key_id,
            secretAccessKey: directCreds.aws_secret_access_key,
            sessionToken: directCreds.aws_session_token,
            region,
        };
    }

    // Everything else (SSO / Identity Center, credential_process, credential_source, web identity,
    // chained roles, MFA): delegate to the AWS CLI, which understands every profile type.
    return { ...(await exportCliCredentials(appConfig.profile, profileConfig)), region };
}

async function exportCliCredentials(
    profile: string,
    profileConfig: IniSection,
): Promise<Omit<ResolvedCredentials, "region">> {
    let raw = "";
    let failure: string | null = null;
    try {
        raw = await invoke<string>("export_aws_credentials", { profile });
    } catch (err) {
        failure = String(err);
    }
    if (failure !== null) {
        const isSso = !!(profileConfig.sso_session || profileConfig.sso_start_url);
        if (isSso && /sso|token|expired|login/i.test(failure)) throw new SsoLoginRequiredError(profile, failure);
        throw new Error(`Could not resolve credentials for profile "${profile}": ${failure}`);
    }

    const parsed = JSON.parse(raw) as {
        AccessKeyId: string;
        SecretAccessKey: string;
        SessionToken?: string;
        Expiration?: string;
    };
    return {
        accessKeyId: parsed.AccessKeyId,
        secretAccessKey: parsed.SecretAccessKey,
        sessionToken: parsed.SessionToken,
        expiration: parsed.Expiration ? new Date(parsed.Expiration) : undefined,
    };
}

/**
 * Wrap resolved credentials in a provider the SDK clients call before each request.
 * Temporary credentials are re-resolved shortly before expiry (concurrent callers share one refresh).
 */
export function createCredentialProvider(
    appConfig: ClusterConfig,
    initial: ResolvedCredentials,
    onRefresh: (result: { credentials: ResolvedCredentials } | { error: unknown }) => void,
): CredentialProvider & { retryNow: () => void } {
    let current = initial;
    let inflight: Promise<ResolvedCredentials> | null = null;
    // After a failed refresh, fail fast for a while instead of re-running the CLI on every request
    let lastFailure: { at: number; error: unknown } | null = null;

    const isFresh = () => !current.expiration || current.expiration.getTime() - Date.now() > REFRESH_MARGIN_MS;

    const refresh = () =>
        loadAwsFiles()
            .then((files) => resolveCredentials(appConfig, files))
            .then(
                (creds) => {
                    current = creds;
                    lastFailure = null;
                    onRefresh({ credentials: creds });
                    return creds;
                },
                (error) => {
                    lastFailure = { at: Date.now(), error };
                    onRefresh({ error });
                    throw error;
                },
            )
            .finally(() => {
                inflight = null;
            });

    const provider: CredentialProvider = async () => {
        if (!isFresh()) {
            try {
                if (lastFailure && Date.now() - lastFailure.at < RETRY_AFTER_FAILURE_MS) throw lastFailure.error;
                await (inflight ??= refresh());
            } catch (err) {
                // Keep serving the old credentials until they actually expire
                if (current.expiration!.getTime() <= Date.now()) throw err;
            }
        }
        const { accessKeyId, secretAccessKey, sessionToken, expiration } = current;
        return { accessKeyId, secretAccessKey, sessionToken, expiration };
    };
    // retryNow drops the failure back-off (e.g. right after an SSO login)
    return Object.assign(provider, {
        retryNow: () => {
            lastFailure = null;
        },
    });
}
