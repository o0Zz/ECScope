import type {
  EcsCluster,
  EcsService,
  EcsTask,
  EcsContainer,
  EcsDeployment,
  LogEvent,
} from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CLUSTERS: EcsCluster[] = [
  {
    clusterArn: "arn:aws:ecs:us-east-1:123456789:cluster/production",
    clusterName: "production",
    status: "ACTIVE",
    activeServicesCount: 5,
    runningTasksCount: 12,
    pendingTasksCount: 0,
    registeredContainerInstancesCount: 3,
  },
  {
    clusterArn: "arn:aws:ecs:us-east-1:123456789:cluster/staging",
    clusterName: "staging",
    status: "ACTIVE",
    activeServicesCount: 4,
    runningTasksCount: 6,
    pendingTasksCount: 1,
    registeredContainerInstancesCount: 2,
  },
  {
    clusterArn: "arn:aws:ecs:us-east-1:123456789:cluster/development",
    clusterName: "development",
    status: "ACTIVE",
    activeServicesCount: 3,
    runningTasksCount: 3,
    pendingTasksCount: 0,
    registeredContainerInstancesCount: 1,
  },
];

function makeDeployment(id: string, status: string): EcsDeployment {
  return {
    id,
    status,
    desiredCount: 2,
    runningCount: status === "PRIMARY" ? 2 : 0,
    pendingCount: 0,
    rolloutState: status === "PRIMARY" ? "COMPLETED" : "IN_PROGRESS",
    createdAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
  };
}

const SERVICES_BY_CLUSTER: Record<string, EcsService[]> = {
  production: [
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/api-gateway", serviceName: "api-gateway", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 3, runningCount: 3, pendingCount: 0, launchType: "FARGATE", taskDefinition: "api-gateway:42", deployments: [makeDeployment("dep-1a", "PRIMARY")], createdAt: "2025-06-15T10:00:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/user-service", serviceName: "user-service", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 2, runningCount: 2, pendingCount: 0, launchType: "FARGATE", taskDefinition: "user-service:18", deployments: [makeDeployment("dep-1b", "PRIMARY")], createdAt: "2025-06-10T08:30:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/order-service", serviceName: "order-service", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 2, runningCount: 2, pendingCount: 0, launchType: "FARGATE", taskDefinition: "order-service:25", deployments: [makeDeployment("dep-1c", "PRIMARY")], createdAt: "2025-07-01T14:00:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/notification-worker", serviceName: "notification-worker", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 2, runningCount: 2, pendingCount: 0, launchType: "FARGATE", taskDefinition: "notification-worker:11", deployments: [makeDeployment("dep-1d", "PRIMARY")], createdAt: "2025-08-20T09:15:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/payment-service", serviceName: "payment-service", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 3, runningCount: 3, pendingCount: 0, launchType: "FARGATE", taskDefinition: "payment-service:33", deployments: [makeDeployment("dep-1e", "PRIMARY")], createdAt: "2025-05-12T16:45:00Z" },
  ],
  staging: [
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/staging/api-gateway", serviceName: "api-gateway", clusterArn: CLUSTERS[1].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "api-gateway:43", deployments: [makeDeployment("dep-2a", "PRIMARY")], createdAt: "2025-09-01T10:00:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/staging/user-service", serviceName: "user-service", clusterArn: CLUSTERS[1].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 1, launchType: "FARGATE", taskDefinition: "user-service:19", deployments: [makeDeployment("dep-2b", "PRIMARY"), makeDeployment("dep-2b2", "ACTIVE")], createdAt: "2025-09-02T11:00:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/staging/order-service", serviceName: "order-service", clusterArn: CLUSTERS[1].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "order-service:26", deployments: [makeDeployment("dep-2c", "PRIMARY")], createdAt: "2025-09-05T14:30:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/staging/notification-worker", serviceName: "notification-worker", clusterArn: CLUSTERS[1].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "notification-worker:12", deployments: [makeDeployment("dep-2d", "PRIMARY")], createdAt: "2025-09-08T09:00:00Z" },
  ],
  development: [
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/development/api-gateway", serviceName: "api-gateway", clusterArn: CLUSTERS[2].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "api-gateway:44", deployments: [makeDeployment("dep-3a", "PRIMARY")], createdAt: "2025-10-01T10:00:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/development/user-service", serviceName: "user-service", clusterArn: CLUSTERS[2].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "user-service:20", deployments: [makeDeployment("dep-3b", "PRIMARY")], createdAt: "2025-10-02T11:00:00Z" },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/development/frontend", serviceName: "frontend", clusterArn: CLUSTERS[2].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "frontend:8", deployments: [makeDeployment("dep-3c", "PRIMARY")], createdAt: "2025-10-10T15:00:00Z" },
  ],
};

function makeContainer(name: string, image: string): EcsContainer {
  return {
    containerArn: `arn:aws:ecs:us-east-1:123456789:container/${crypto.randomUUID().slice(0, 8)}`,
    name,
    image,
    lastStatus: "RUNNING",
    healthStatus: "HEALTHY",
    cpu: "256",
    memory: "512",
    networkBindings: [{ containerPort: 8080, hostPort: 8080, protocol: "tcp" }],
  };
}

function makeTasks(clusterName: string, serviceName: string, count: number): EcsTask[] {
  return Array.from({ length: count }, (_, i) => ({
    taskArn: `arn:aws:ecs:us-east-1:123456789:task/${clusterName}/${crypto.randomUUID().slice(0, 12)}`,
    taskDefinitionArn: `arn:aws:ecs:us-east-1:123456789:task-definition/${serviceName}:1`,
    clusterArn: `arn:aws:ecs:us-east-1:123456789:cluster/${clusterName}`,
    lastStatus: i === 0 && serviceName === "user-service" && clusterName === "staging" ? "PENDING" : "RUNNING",
    desiredStatus: "RUNNING",
    launchType: "FARGATE",
    cpu: "256",
    memory: "512",
    startedAt: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
    group: `service:${serviceName}`,
    containers: [makeContainer(serviceName, `123456789.dkr.ecr.us-east-1.amazonaws.com/${serviceName}:latest`)],
    healthStatus: "HEALTHY",
  }));
}

const LOG_MESSAGES = [
  "INFO  [main] Application started successfully",
  "INFO  [http] Listening on 0.0.0.0:8080",
  "DEBUG [pool] Connection pool initialized with 10 connections",
  "INFO  [http] GET /health 200 2ms",
  "INFO  [http] GET /api/v1/users 200 15ms",
  "WARN  [cache] Cache miss for key: user_preferences_42",
  "INFO  [http] POST /api/v1/orders 201 45ms",
  "DEBUG [db] Query executed in 8ms: SELECT * FROM orders WHERE ...",
  "INFO  [http] GET /api/v1/orders/123 200 12ms",
  "ERROR [http] GET /api/v1/reports 500 Internal Server Error",
  "INFO  [metrics] CPU: 24%, Memory: 312MB/512MB",
  "INFO  [http] DELETE /api/v1/sessions/expired 204 5ms",
  "WARN  [auth] Token refresh for user 42 - token expires in 5m",
  "INFO  [worker] Processing batch job #847 (15 items)",
  "INFO  [worker] Batch job #847 completed in 2340ms",
  "DEBUG [http] Request headers: Accept: application/json",
  "INFO  [http] PUT /api/v1/users/42/preferences 200 18ms",
];

export const mockApi = {
  async listClusters(): Promise<EcsCluster[]> {
    await delay(300);
    return CLUSTERS;
  },

  async getCluster(clusterName: string): Promise<EcsCluster | undefined> {
    await delay(150);
    return CLUSTERS.find((c) => c.clusterName === clusterName);
  },

  async listServices(clusterName: string): Promise<EcsService[]> {
    await delay(400);
    return SERVICES_BY_CLUSTER[clusterName] ?? [];
  },

  async getService(clusterName: string, serviceName: string): Promise<EcsService | undefined> {
    await delay(200);
    const services = SERVICES_BY_CLUSTER[clusterName] ?? [];
    return services.find((s) => s.serviceName === serviceName);
  },

  async listTasks(clusterName: string, serviceName: string): Promise<EcsTask[]> {
    await delay(350);
    const service = (SERVICES_BY_CLUSTER[clusterName] ?? []).find((s) => s.serviceName === serviceName);
    if (!service) return [];
    return makeTasks(clusterName, serviceName, service.runningCount + service.pendingCount);
  },

  async getTaskLogs(taskArn: string): Promise<LogEvent[]> {
    void taskArn;
    await delay(500);
    const now = Date.now();
    return Array.from({ length: 50 }, (_, i) => ({
      timestamp: now - (50 - i) * 2000,
      message: LOG_MESSAGES[i % LOG_MESSAGES.length],
      ingestionTime: now - (50 - i) * 1900,
    }));
  },
};
