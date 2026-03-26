export type LoadBalancerType = "application" | "network";

export interface AlbInfo {
    albArn: string;
    albName: string;
    dnsName: string;
    scheme: string;
    status: string;
    lbType: LoadBalancerType;
    targetGroups: TargetGroup[];
    requestCount: number;
    avgLatencyMs: number;
    /** NLB-specific: active TCP flows (only for network LBs) */
    activeFlowCount?: number;
    /** NLB-specific: new TCP flows per period (only for network LBs) */
    newFlowCount?: number;
    /** NLB-specific: processed bytes (only for network LBs) */
    processedBytes?: number;
}

export interface TargetGroup {
    targetGroupArn: string;
    targetGroupName: string;
    port: number;
    protocol: string;
    healthCheckPath: string;
    healthyCount: number;
    unhealthyCount: number;
    targets: TargetHealth[];
}

export interface TargetHealth {
    targetId: string;
    port: number;
    health: string;
    description: string;
}
