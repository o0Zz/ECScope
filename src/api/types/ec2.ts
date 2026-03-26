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
}
