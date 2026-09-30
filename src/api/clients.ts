import { ECSClient } from "@aws-sdk/client-ecs";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { SSMClient } from "@aws-sdk/client-ssm";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import { EC2Client } from "@aws-sdk/client-ec2";
import { RDSClient } from "@aws-sdk/client-rds";
import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import { ApplicationAutoScalingClient } from "@aws-sdk/client-application-auto-scaling";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import type { CredentialProvider } from "@/config/aws-credentials";
import { log } from "@/lib/logger";

let ecsClient: ECSClient;
let cwClient: CloudWatchClient;
let ssmClient: SSMClient;
let smClient: SecretsManagerClient;
let elbv2Client: ElasticLoadBalancingV2Client;
let ec2Client: EC2Client;
let rdsClient: RDSClient;
let asgClient: AutoScalingClient;
let appAsClient: ApplicationAutoScalingClient;
let logsClient: CloudWatchLogsClient;
let eventsClient: EventBridgeClient;
let schedulerClient: SchedulerClient;

/** `credentials` is called by the SDK before requests, so temporary credentials refresh transparently */
export function initAwsClients(credentials: CredentialProvider, region: string, clusterName: string) {
    log.aws.info(`Initializing AWS clients for cluster ${clusterName} (Region: ${region})`);

    ecsClient = new ECSClient({ region, credentials });
    cwClient = new CloudWatchClient({ region, credentials });
    ssmClient = new SSMClient({ region, credentials });
    smClient = new SecretsManagerClient({ region, credentials });
    elbv2Client = new ElasticLoadBalancingV2Client({ region, credentials });
    ec2Client = new EC2Client({ region, credentials });
    rdsClient = new RDSClient({ region, credentials });
    asgClient = new AutoScalingClient({ region, credentials });
    appAsClient = new ApplicationAutoScalingClient({ region, credentials });
    logsClient = new CloudWatchLogsClient({ region, credentials });
    eventsClient = new EventBridgeClient({ region, credentials });
    schedulerClient = new SchedulerClient({ region, credentials });
    log.aws.info(`AWS clients initialized for cluster ${clusterName}`);
}

export function getEcsClient(): ECSClient {
    return ecsClient;
}
export function getCwClient(): CloudWatchClient {
    return cwClient;
}
export function getSsmClient(): SSMClient {
    return ssmClient;
}
export function getSmClient(): SecretsManagerClient {
    return smClient;
}
export function getElbv2Client(): ElasticLoadBalancingV2Client {
    return elbv2Client;
}
export function getEc2Client(): EC2Client {
    return ec2Client;
}
export function getRdsClient(): RDSClient {
    return rdsClient;
}
export function getAsgClient(): AutoScalingClient {
    return asgClient;
}
export function getAppAsClient(): ApplicationAutoScalingClient {
    return appAsClient;
}
export function getLogsClient(): CloudWatchLogsClient {
    return logsClient;
}
export function getEventsClient(): EventBridgeClient {
    return eventsClient;
}
export function getSchedulerClient(): SchedulerClient {
    return schedulerClient;
}
