export interface RdsInstance {
    dbInstanceIdentifier: string;
    dbInstanceClass: string;
    engine: string;
    engineVersion: string;
    status: string;
    endpoint: string;
    port: number;
    masterUsername: string;
    allocatedStorage: number;
    multiAz: boolean;
    storageType: string;
    vpcId: string;
    availabilityZone: string;
    secondaryAvailabilityZone?: string;
    createdAt: string;
    storageEncrypted: boolean;
    publiclyAccessible: boolean;
}

export interface RdsMetricsDataPoint {
    timestamp: number;
    cpuUtilization: number;
    freeableMemoryBytes: number;
    databaseConnections: number;
    readIOPS: number;
    writeIOPS: number;
    readLatencyMs: number;
    writeLatencyMs: number;
    freeStorageSpaceBytes: number;
}
