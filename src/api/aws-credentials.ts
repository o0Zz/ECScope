import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import type { ClusterConfig, AwsFiles } from "./config";

export interface ResolvedCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
}

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
            currentSection = sectionMatch[1]
                .replace(/^profile\s+/, "")
                .trim();
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

export async function resolveCredentials(
    appConfig: ClusterConfig,
    awsFiles: AwsFiles,
): Promise<ResolvedCredentials> {
    const credSections = parseIniFile(awsFiles.credentials);
    const configSections = parseIniFile(awsFiles.config);

    const profileConfig = configSections[appConfig.profile] ?? {};
    const region =
        appConfig.region ||
        profileConfig.region ||
        configSections[profileConfig.source_profile]?.region ||
        "us-east-1";

    // If the profile has a role_arn, we need to assume the role
    if (profileConfig.role_arn && profileConfig.source_profile) {
        const sourceProfile = profileConfig.source_profile;
        const sourceCreds = credSections[sourceProfile];

        if (!sourceCreds?.aws_access_key_id || !sourceCreds?.aws_secret_access_key) {
            throw new Error(
                `Source profile "${sourceProfile}" not found in ~/.aws/credentials or missing keys`,
            );
        }

        const stsClient = new STSClient({
            region,
            credentials: {
                accessKeyId: sourceCreds.aws_access_key_id,
                secretAccessKey: sourceCreds.aws_secret_access_key,
            },
        });

        const assumed = await stsClient.send(
            new AssumeRoleCommand({
                RoleArn: profileConfig.role_arn,
                RoleSessionName: "ecscope-session",
                DurationSeconds: 3600,
            }),
        );

        if (!assumed.Credentials) {
            throw new Error(`Failed to assume role ${profileConfig.role_arn}`);
        }

        return {
            accessKeyId: assumed.Credentials.AccessKeyId!,
            secretAccessKey: assumed.Credentials.SecretAccessKey!,
            sessionToken: assumed.Credentials.SessionToken,
            region,
        };
    }

    // Direct credentials (no role assumption)
    const directCreds = credSections[appConfig.profile];
    if (!directCreds?.aws_access_key_id || !directCreds?.aws_secret_access_key) {
        throw new Error(
            `Profile "${appConfig.profile}" not found in ~/.aws/credentials or missing keys`,
        );
    }

    return {
        accessKeyId: directCreds.aws_access_key_id,
        secretAccessKey: directCreds.aws_secret_access_key,
        region,
    };
}
