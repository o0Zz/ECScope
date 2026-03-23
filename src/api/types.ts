export interface EcsCluster {
  clusterArn: string;
  clusterName: string;
  status: string;
  activeServicesCount: number;
  runningTasksCount: number;
  pendingTasksCount: number;
  registeredContainerInstancesCount: number;
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
