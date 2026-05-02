/**
 * Generates AWS Console URLs for various resource types.
 */

import { openUrl } from "@tauri-apps/plugin-opener";

export function ecsServiceUrl(region: string, clusterName: string, serviceName: string): string {
    return `https://${region}.console.aws.amazon.com/ecs/v2/clusters/${clusterName}/services/${serviceName}/health?region=${region}`;
}

export function ecsTaskUrl(region: string, clusterName: string, taskId: string): string {
    return `https://${region}.console.aws.amazon.com/ecs/v2/clusters/${clusterName}/tasks/${taskId}/configuration?region=${region}`;
}

export function ec2InstanceUrl(region: string, instanceId: string): string {
    return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${instanceId}`;
}

export function rdsInstanceUrl(region: string, dbIdentifier: string): string {
    return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${dbIdentifier};is-cluster=false`;
}

export function albUrl(region: string, albArn: string): string {
    return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#LoadBalancer:loadBalancerArn=${albArn}`;
}

export function openAwsUrl(url: string) {
    openUrl(url);
}
