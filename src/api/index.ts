export { initAwsClients } from "./clients";
export type * from "./types";

// Re-export domain modules as a single ecsApi for backward compatibility
import {
    listClusters,
    getCluster,
    listServices,
    getService,
    getServiceEvents,
    listTasks,
    getClusterMetrics,
    updateServiceDesiredCount,
    listContainerInstances,
} from "./ecs";
import { getServiceMetricsHistory, getAlbMetricsHistory, getNlbMetricsHistory } from "./cloudwatch";
import { listAlbs } from "./alb";
import { listDatabases } from "./database";

export const ecsApi = {
    listClusters,
    getCluster,
    listServices,
    getService,
    getServiceEvents,
    listTasks,
    getClusterMetrics,
    updateServiceDesiredCount,
    listAlbs,
    listContainerInstances,
    listDatabases,
    getServiceMetricsHistory,
    getAlbMetricsHistory,
    getNlbMetricsHistory,
};

export * as ec2Commands from "./ec2-commands";
