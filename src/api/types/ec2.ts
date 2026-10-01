export interface ContainerInstance {
    containerInstanceArn: string;
    ec2InstanceId: string;
    instanceType: string;
    status: string;
    runningTasksCount: number;
    pendingTasksCount: number;
    cpuRegistered: number;
    cpuAvailable: number;
    memoryRegistered: number;
    memoryAvailable: number;
    agentVersion: string;
    launchType: "EC2" | "FARGATE";
    registeredAt?: number;
}

export interface VpcEc2Instance {
    instanceId: string;
    instanceType: string;
    state: string;
    privateIp: string;
    publicIp: string;
    subnetId: string;
    vpcId: string;
    name: string;
    launchTime: string;
    platform: string;
    securityGroups: { groupId: string; groupName: string }[];
}

export interface SecurityGroupRule {
    ruleId: string;
    groupId: string;
    protocol: string;
    fromPort: number;
    toPort: number;
    source: string;
    description: string;
}

export interface PrefixList {
    prefixListId: string;
    name: string;
    version: number;
    maxEntries: number;
    state: string;
    awsManaged: boolean;
    entries: { cidr: string; description: string }[];
}
