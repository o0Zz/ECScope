export interface AlbInfo {
    albArn: string;
    albName: string;
    dnsName: string;
    scheme: string;
    status: string;
    targetGroups: TargetGroup[];
    requestCount: number;
    avgLatencyMs: number;
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
