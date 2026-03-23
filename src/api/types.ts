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
}

export interface EcsContainer {
  containerArn: string;
  name: string;
  image: string;
  lastStatus: string;
  healthStatus: string;
  cpu: string;
  memory: string;
  networkBindings: { containerPort: number; hostPort: number; protocol: string }[];
}

export interface LogEvent {
  timestamp: number;
  message: string;
  ingestionTime: number;
}

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

export interface DatabaseInstance {
  dbInstanceId: string;
  engine: string;
  engineVersion: string;
  instanceClass: string;
  status: string;
  endpoint: string;
  port: number;
  metrics: DatabaseMetrics;
}

export interface DatabaseMetrics {
  cpuUtilization: number;
  freeableMemoryMB: number;
  totalMemoryMB: number;
  databaseConnections: number;
  maxConnections: number;
  readIOPS: number;
  writeIOPS: number;
  readLatencyMs: number;
  writeLatencyMs: number;
  queryThroughput: number;
  slowQueries: SlowQuery[];
}

export interface SlowQuery {
  query: string;
  durationMs: number;
  timestamp: string;
  user: string;
}
