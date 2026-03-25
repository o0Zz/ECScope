import type {
  EcsCluster,
  EcsService,
  EcsTask,
  EcsContainer,
  EcsDeployment,
  LogEvent,
  ClusterMetrics,
  ServiceMetrics,
  AlbInfo,
  ContainerInstance,
  DatabaseInstance,
  TcpdumpParams,
  CoredumpParams,
  DiagnosticResult,
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

function makeMetrics(cpu: number, mem: number, cpuRes: number, memRes: number): ServiceMetrics {
  return { cpuUtilization: cpu, memoryUtilization: mem, cpuReserved: cpuRes, memoryReservedMB: memRes };
}

const SERVICES_BY_CLUSTER: Record<string, EcsService[]> = {
  production: [
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/api-gateway", serviceName: "api-gateway", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 3, runningCount: 3, pendingCount: 0, launchType: "FARGATE", taskDefinition: "api-gateway:42", deployments: [makeDeployment("dep-1a", "PRIMARY")], createdAt: "2025-06-15T10:00:00Z", metrics: makeMetrics(45, 62, 768, 1536) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/user-service", serviceName: "user-service", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 2, runningCount: 2, pendingCount: 0, launchType: "FARGATE", taskDefinition: "user-service:18", deployments: [makeDeployment("dep-1b", "PRIMARY")], createdAt: "2025-06-10T08:30:00Z", metrics: makeMetrics(32, 48, 512, 1024) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/order-service", serviceName: "order-service", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 2, runningCount: 2, pendingCount: 0, launchType: "FARGATE", taskDefinition: "order-service:25", deployments: [makeDeployment("dep-1c", "PRIMARY")], createdAt: "2025-07-01T14:00:00Z", metrics: makeMetrics(28, 55, 512, 1024) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/notification-worker", serviceName: "notification-worker", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 2, runningCount: 2, pendingCount: 0, launchType: "FARGATE", taskDefinition: "notification-worker:11", deployments: [makeDeployment("dep-1d", "PRIMARY")], createdAt: "2025-08-20T09:15:00Z", metrics: makeMetrics(15, 35, 256, 512) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/production/payment-service", serviceName: "payment-service", clusterArn: CLUSTERS[0].clusterArn, status: "ACTIVE", desiredCount: 3, runningCount: 3, pendingCount: 0, launchType: "FARGATE", taskDefinition: "payment-service:33", deployments: [makeDeployment("dep-1e", "PRIMARY")], createdAt: "2025-05-12T16:45:00Z", metrics: makeMetrics(52, 71, 768, 1536) },
  ],
  staging: [
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/staging/api-gateway", serviceName: "api-gateway", clusterArn: CLUSTERS[1].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "api-gateway:43", deployments: [makeDeployment("dep-2a", "PRIMARY")], createdAt: "2025-09-01T10:00:00Z", metrics: makeMetrics(22, 40, 256, 512) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/staging/user-service", serviceName: "user-service", clusterArn: CLUSTERS[1].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 1, launchType: "FARGATE", taskDefinition: "user-service:19", deployments: [makeDeployment("dep-2b", "PRIMARY"), makeDeployment("dep-2b2", "ACTIVE")], createdAt: "2025-09-02T11:00:00Z", metrics: makeMetrics(18, 35, 256, 512) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/staging/order-service", serviceName: "order-service", clusterArn: CLUSTERS[1].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "order-service:26", deployments: [makeDeployment("dep-2c", "PRIMARY")], createdAt: "2025-09-05T14:30:00Z", metrics: makeMetrics(12, 28, 256, 512) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/staging/notification-worker", serviceName: "notification-worker", clusterArn: CLUSTERS[1].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "notification-worker:12", deployments: [makeDeployment("dep-2d", "PRIMARY")], createdAt: "2025-09-08T09:00:00Z", metrics: makeMetrics(8, 20, 256, 512) },
  ],
  development: [
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/development/api-gateway", serviceName: "api-gateway", clusterArn: CLUSTERS[2].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "api-gateway:44", deployments: [makeDeployment("dep-3a", "PRIMARY")], createdAt: "2025-10-01T10:00:00Z", metrics: makeMetrics(10, 25, 256, 512) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/development/user-service", serviceName: "user-service", clusterArn: CLUSTERS[2].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "user-service:20", deployments: [makeDeployment("dep-3b", "PRIMARY")], createdAt: "2025-10-02T11:00:00Z", metrics: makeMetrics(5, 18, 256, 512) },
    { serviceArn: "arn:aws:ecs:us-east-1:123456789:service/development/frontend", serviceName: "frontend", clusterArn: CLUSTERS[2].clusterArn, status: "ACTIVE", desiredCount: 1, runningCount: 1, pendingCount: 0, launchType: "FARGATE", taskDefinition: "frontend:8", deployments: [makeDeployment("dep-3c", "PRIMARY")], createdAt: "2025-10-10T15:00:00Z", metrics: makeMetrics(3, 15, 256, 512) },
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
    containerInstanceArn: "",
    ec2InstanceId: "",
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

  async getClusterMetrics(clusterName: string): Promise<ClusterMetrics> {
    await delay(250);
    const services = SERVICES_BY_CLUSTER[clusterName] ?? [];
    const cpuReserved = services.reduce((s, svc) => s + svc.metrics.cpuReserved, 0);
    const memReserved = services.reduce((s, svc) => s + svc.metrics.memoryReservedMB, 0);
    const cpuTotal = cpuReserved * 2;
    const memTotal = memReserved * 2;
    return {
      cpuUtilization: cpuTotal > 0 ? Math.round((cpuReserved / cpuTotal) * 100 * (0.6 + Math.random() * 0.3)) : 0,
      memoryUtilization: memTotal > 0 ? Math.round((memReserved / memTotal) * 100 * (0.7 + Math.random() * 0.2)) : 0,
      cpuReserved,
      cpuTotal,
      memoryReservedMB: memReserved,
      memoryTotalMB: memTotal,
    };
  },

  async updateServiceDesiredCount(clusterName: string, serviceName: string, desiredCount: number): Promise<EcsService> {
    await delay(300);
    const services = SERVICES_BY_CLUSTER[clusterName] ?? [];
    const svc = services.find((s) => s.serviceName === serviceName);
    if (!svc) throw new Error(`Service ${serviceName} not found`);
    svc.desiredCount = Math.max(0, desiredCount);
    svc.runningCount = Math.max(0, desiredCount);
    return svc;
  },

  async listAlbs(clusterName: string): Promise<AlbInfo[]> {
    await delay(400);
    const services = SERVICES_BY_CLUSTER[clusterName] ?? [];
    if (services.length === 0) return [];
    return [
      {
        albArn: `arn:aws:elasticloadbalancing:us-east-1:123456789:loadbalancer/app/${clusterName}-alb/abc123`,
        albName: `${clusterName}-alb`,
        dnsName: `${clusterName}-alb-123456.us-east-1.elb.amazonaws.com`,
        scheme: "internet-facing",
        status: "active",
        requestCount: Math.floor(Math.random() * 50000) + 10000,
        avgLatencyMs: Math.floor(Math.random() * 80) + 10,
        targetGroups: services.slice(0, 3).map((svc) => ({
          targetGroupArn: `arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/${svc.serviceName}/abc123`,
          targetGroupName: `${svc.serviceName}-tg`,
          port: 8080,
          protocol: "HTTP",
          healthCheckPath: "/health",
          healthyCount: svc.runningCount,
          unhealthyCount: 0,
          targets: Array.from({ length: svc.runningCount }, (_, i) => ({
            targetId: `10.0.${Math.floor(Math.random() * 255)}.${i + 1}`,
            port: 8080,
            health: "healthy",
            description: "Health checks passing",
          })),
        })),
      },
      {
        albArn: `arn:aws:elasticloadbalancing:us-east-1:123456789:loadbalancer/app/${clusterName}-internal-alb/def456`,
        albName: `${clusterName}-internal-alb`,
        dnsName: `internal-${clusterName}-alb-789.us-east-1.elb.amazonaws.com`,
        scheme: "internal",
        status: "active",
        requestCount: Math.floor(Math.random() * 20000) + 5000,
        avgLatencyMs: Math.floor(Math.random() * 30) + 3,
        targetGroups: services.slice(1, 4).map((svc) => ({
          targetGroupArn: `arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/${svc.serviceName}-int/def456`,
          targetGroupName: `${svc.serviceName}-internal-tg`,
          port: 8080,
          protocol: "HTTP",
          healthCheckPath: "/health",
          healthyCount: svc.runningCount,
          unhealthyCount: svc.serviceName === "user-service" && clusterName === "staging" ? 1 : 0,
          targets: Array.from({ length: svc.runningCount }, (_, i) => ({
            targetId: `10.1.${Math.floor(Math.random() * 255)}.${i + 1}`,
            port: 8080,
            health: i === 0 && svc.serviceName === "user-service" && clusterName === "staging" ? "unhealthy" : "healthy",
            description: i === 0 && svc.serviceName === "user-service" && clusterName === "staging" ? "Health checks failed" : "Health checks passing",
          })),
        })),
      },
    ];
  },

  async listContainerInstances(clusterName: string): Promise<ContainerInstance[]> {
    await delay(350);
    const cluster = CLUSTERS.find((c) => c.clusterName === clusterName);
    if (!cluster) return [];
    const count = cluster.registeredContainerInstancesCount;
    const instanceTypes = ["t3.medium", "t3.large", "m5.xlarge", "c5.large"];
    return Array.from({ length: count }, (_, i) => ({
      containerInstanceArn: `arn:aws:ecs:us-east-1:123456789:container-instance/${clusterName}/${crypto.randomUUID().slice(0, 12)}`,
      ec2InstanceId: `i-0${crypto.randomUUID().slice(0, 11)}`,
      instanceType: instanceTypes[i % instanceTypes.length],
      status: "ACTIVE",
      runningTasksCount: Math.floor(cluster.runningTasksCount / count) + (i === 0 ? cluster.runningTasksCount % count : 0),
      pendingTasksCount: i === 0 ? cluster.pendingTasksCount : 0,
      cpuRegistered: 2048,
      cpuAvailable: 2048 - Math.floor(Math.random() * 1200 + 400),
      memoryRegistered: 4096,
      memoryAvailable: 4096 - Math.floor(Math.random() * 2400 + 800),
      agentVersion: "1.82.0",
      launchType: "EC2" as const,
    }));
  },

  async listDatabases(clusterName: string): Promise<DatabaseInstance[]> {
    await delay(400);
    const dbsByCluster: Record<string, DatabaseInstance[]> = {
      production: [
        {
          dbInstanceId: "prod-main-db",
          engine: "aurora-postgresql",
          engineVersion: "15.4",
          instanceClass: "db.r6g.xlarge",
          status: "available",
          endpoint: "prod-main-db.cluster-abc123.us-east-1.rds.amazonaws.com",
          port: 5432,
          metrics: {
            cpuUtilization: 42,
            freeableMemoryMB: 12288,
            totalMemoryMB: 32768,
            databaseConnections: 85,
            maxConnections: 200,
            readIOPS: 1250,
            writeIOPS: 430,
            readLatencyMs: 0.8,
            writeLatencyMs: 1.2,
            queryThroughput: 3400,
            slowQueries: [
              { query: "SELECT * FROM orders JOIN items ON ... WHERE created_at > ...", durationMs: 4500, timestamp: new Date(Date.now() - 300000).toISOString(), user: "app_user" },
              { query: "UPDATE user_preferences SET ... WHERE user_id IN (SELECT ...)", durationMs: 2800, timestamp: new Date(Date.now() - 600000).toISOString(), user: "app_user" },
            ],
          },
        },
        {
          dbInstanceId: "prod-analytics-db",
          engine: "aurora-postgresql",
          engineVersion: "15.4",
          instanceClass: "db.r6g.large",
          status: "available",
          endpoint: "prod-analytics-db.cluster-def456.us-east-1.rds.amazonaws.com",
          port: 5432,
          metrics: {
            cpuUtilization: 68,
            freeableMemoryMB: 6144,
            totalMemoryMB: 16384,
            databaseConnections: 120,
            maxConnections: 150,
            readIOPS: 3800,
            writeIOPS: 150,
            readLatencyMs: 1.5,
            writeLatencyMs: 2.0,
            queryThroughput: 5200,
            slowQueries: [
              { query: "SELECT COUNT(*) FROM events GROUP BY ... HAVING ...", durationMs: 8200, timestamp: new Date(Date.now() - 120000).toISOString(), user: "analytics_user" },
            ],
          },
        },
      ],
      staging: [
        {
          dbInstanceId: "staging-db",
          engine: "aurora-postgresql",
          engineVersion: "15.4",
          instanceClass: "db.t4g.medium",
          status: "available",
          endpoint: "staging-db.cluster-ghi789.us-east-1.rds.amazonaws.com",
          port: 5432,
          metrics: {
            cpuUtilization: 18,
            freeableMemoryMB: 3072,
            totalMemoryMB: 4096,
            databaseConnections: 25,
            maxConnections: 100,
            readIOPS: 320,
            writeIOPS: 80,
            readLatencyMs: 0.5,
            writeLatencyMs: 0.9,
            queryThroughput: 800,
            slowQueries: [],
          },
        },
      ],
      development: [
        {
          dbInstanceId: "dev-db",
          engine: "postgres",
          engineVersion: "15.4",
          instanceClass: "db.t4g.micro",
          status: "available",
          endpoint: "dev-db.abc123.us-east-1.rds.amazonaws.com",
          port: 5432,
          metrics: {
            cpuUtilization: 5,
            freeableMemoryMB: 800,
            totalMemoryMB: 1024,
            databaseConnections: 8,
            maxConnections: 50,
            readIOPS: 45,
            writeIOPS: 12,
            readLatencyMs: 0.3,
            writeLatencyMs: 0.5,
            queryThroughput: 120,
            slowQueries: [],
          },
        },
      ],
    };
    return dbsByCluster[clusterName] ?? [];
  },
};

// ─── Mock Diagnostics ─────────────────────────────────

export const mockDiagnostics = {
  async startTcpdump(params: TcpdumpParams): Promise<{ commandId: string }> {
    void params;
    await delay(300);
    return { commandId: `mock-cmd-${Date.now()}` };
  },

  async startCoredump(params: CoredumpParams): Promise<{ commandId: string }> {
    void params;
    await delay(300);
    return { commandId: `mock-cmd-${Date.now()}` };
  },

  async pollDiagnostic(commandId: string, instanceId: string): Promise<DiagnosticResult> {
    // Always return completed after a short delay in mock mode
    await delay(500);
    return {
      commandId,
      instanceId,
      status: "completed",
      s3Key: `ecscope/${instanceId}/mock-capture-${Date.now()}.pcap`,
    };
  },

  async downloadDiagnosticFile(_bucket: string, _s3Key: string): Promise<void> {
    await delay(300);
    console.log("[mock] downloadDiagnosticFile: simulated download");
  },

  async runTcpdumpAndDownload(
    params: TcpdumpParams,
    onProgress?: (status: DiagnosticResult) => void,
  ): Promise<void> {
    const commandId = `mock-cmd-${Date.now()}`;
    // Simulate progress over a few ticks
    for (let i = 0; i < 3; i++) {
      await delay(1000);
      onProgress?.({ commandId, instanceId: params.instanceId, status: "running" });
    }
    onProgress?.({
      commandId,
      instanceId: params.instanceId,
      status: "completed",
      s3Key: `ecscope/${params.instanceId}/mock-capture.pcap`,
    });
    console.log("[mock] runTcpdumpAndDownload completed");
  },

  async runCoredumpAndDownload(
    params: CoredumpParams,
    onProgress?: (status: DiagnosticResult) => void,
  ): Promise<void> {
    const commandId = `mock-cmd-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await delay(1000);
      onProgress?.({ commandId, instanceId: params.instanceId, status: "running" });
    }
    onProgress?.({
      commandId,
      instanceId: params.instanceId,
      status: "completed",
      s3Key: `ecscope/${params.instanceId}/mock-core.dump`,
    });
    console.log("[mock] runCoredumpAndDownload completed");
  },
};
