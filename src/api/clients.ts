import { ECSClient } from "@aws-sdk/client-ecs";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { SSMClient } from "@aws-sdk/client-ssm";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import type { ResolvedCredentials } from "@/config/aws-credentials";

let ecsClient: ECSClient;
let logsClient: CloudWatchLogsClient;
let cwClient: CloudWatchClient;
let ssmClient: SSMClient;
let smClient: SecretsManagerClient;
let elbv2Client: ElasticLoadBalancingV2Client;
let configuredCluster: string;

export function initAwsClients(creds: ResolvedCredentials, clusterName: string) {
    console.log("[aws] initAwsClients called", { region: creds.region, clusterName, hasAccessKey: !!creds.accessKeyId, hasSessionToken: !!creds.sessionToken });
    const credentials = {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
    };

    ecsClient = new ECSClient({ region: creds.region, credentials });
    logsClient = new CloudWatchLogsClient({ region: creds.region, credentials });
    cwClient = new CloudWatchClient({ region: creds.region, credentials });
    ssmClient = new SSMClient({ region: creds.region, credentials });
    smClient = new SecretsManagerClient({ region: creds.region, credentials });
    elbv2Client = new ElasticLoadBalancingV2Client({ region: creds.region, credentials });
    configuredCluster = clusterName;
    console.log("[aws] AWS clients initialized, configuredCluster =", configuredCluster);
}

export function getEcsClient(): ECSClient { return ecsClient; }
export function getLogsClient(): CloudWatchLogsClient { return logsClient; }
export function getCwClient(): CloudWatchClient { return cwClient; }
export function getSsmClient(): SSMClient { return ssmClient; }
export function getSmClient(): SecretsManagerClient { return smClient; }
export function getElbv2Client(): ElasticLoadBalancingV2Client { return elbv2Client; }
export function getConfiguredCluster(): string { return configuredCluster; }
