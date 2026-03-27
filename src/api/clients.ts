import { ECSClient } from "@aws-sdk/client-ecs";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { SSMClient } from "@aws-sdk/client-ssm";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import { EC2Client } from "@aws-sdk/client-ec2";
import type { ResolvedCredentials } from "@/config/aws-credentials";

let ecsClient: ECSClient;
let cwClient: CloudWatchClient;
let ssmClient: SSMClient;
let smClient: SecretsManagerClient;
let elbv2Client: ElasticLoadBalancingV2Client;
let ec2Client: EC2Client;

export function initAwsClients(creds: ResolvedCredentials, clusterName: string) {
    console.log("[aws] initAwsClients called", { region: creds.region, clusterName, hasAccessKey: !!creds.accessKeyId, hasSessionToken: !!creds.sessionToken });
    const credentials = {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
    };

    ecsClient = new ECSClient({ region: creds.region, credentials });
    cwClient = new CloudWatchClient({ region: creds.region, credentials });
    ssmClient = new SSMClient({ region: creds.region, credentials });
    smClient = new SecretsManagerClient({ region: creds.region, credentials });
    elbv2Client = new ElasticLoadBalancingV2Client({ region: creds.region, credentials });
    ec2Client = new EC2Client({ region: creds.region, credentials });
    console.log("[aws] AWS clients initialized for cluster", clusterName);
}

export function getEcsClient(): ECSClient { return ecsClient; }
export function getCwClient(): CloudWatchClient { return cwClient; }
export function getSsmClient(): SSMClient { return ssmClient; }
export function getSmClient(): SecretsManagerClient { return smClient; }
export function getElbv2Client(): ElasticLoadBalancingV2Client { return elbv2Client; }
export function getEc2Client(): EC2Client { return ec2Client; }
