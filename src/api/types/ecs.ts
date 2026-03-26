export interface EcsCluster {
    clusterArn: string;
    clusterName: string;
    status: string;
    activeServicesCount: number;
    runningTasksCount: number;
    pendingTasksCount: number;
    registeredContainerInstancesCount: number;
}

export interface ClusterMetrics {
    cpuUtilization: number;
    memoryUtilization: number;
    cpuReserved: number;
    cpuTotal: number;
    memoryReservedMB: number;
    memoryTotalMB: number;
}

export interface ServiceMetrics {
    cpuUtilization: number;
    memoryUtilization: number;
    cpuReserved: number;
    memoryReservedMB: number;
}

export interface EcsService {
    serviceArn: string;
    serviceName: string;
    clusterArn: string;
    status: string;
    desiredCount: number;
    runningCount: number;
    pendingCount: number;
    launchType: string;
    taskDefinition: string;
    deployments: EcsDeployment[];
    createdAt: string;
    metrics: ServiceMetrics;
}

export interface EcsDeployment {
    id: string;
    status: string;
    desiredCount: number;
    runningCount: number;
    pendingCount: number;
    rolloutState: string;
    createdAt: string;
}

export interface EcsTask {
    taskArn: string;
    taskDefinitionArn: string;
    clusterArn: string;
    lastStatus: string;
    desiredStatus: string;
    launchType: string;
    cpu: string;
    memory: string;
    startedAt: string;
    group: string;
    containers: EcsContainer[];
    healthStatus: string;
    containerInstanceArn: string;
    ec2InstanceId: string;
}

export interface EcsServiceEvent {
    id: string;
    createdAt: string;
    message: string;
}

export interface EcsContainer {
    containerArn: string;
    name: string;
    image: string;
    lastStatus: string;
    healthStatus: string;
    cpu: string;
    memory: string;
    runtimeId: string;
    networkBindings: { containerPort: number; hostPort: number; protocol: string }[];
    environment: { name: string; value: string }[];
    secrets: { name: string; valueFrom: string; resolvedValue?: string }[];
    logGroup?: string;
    logStreamPrefix?: string;
}
