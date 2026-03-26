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
