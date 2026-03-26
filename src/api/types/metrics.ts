export interface MetricsDataPoint {
    timestamp: number;
    cpuUtilization: number;
    memoryUtilization: number;
}

export interface AlbMetricsDataPoint {
    timestamp: number;
    requestCount: number;
    http5xxCount: number;
    http4xxCount: number;
    targetResponseTimeMs: number;
}

export interface NlbMetricsDataPoint {
    timestamp: number;
    activeFlowCount: number;
    newFlowCount: number;
    processedBytes: number;
    tcpClientResetCount: number;
    tcpTargetResetCount: number;
}
