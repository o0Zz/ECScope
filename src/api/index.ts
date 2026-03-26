export { initAwsClients } from "./clients";
export type * from "./types";

// Re-export domain modules as a single ecsApi for backward compatibility
import {
    listClusters,
    getCluster,
    listServices,
    getService,
    listTasks,
    getClusterMetrics,
    updateServiceDesiredCount,
    listContainerInstances,
} from "./ecs";
import { getServiceMetricsHistory, getAlbMetricsHistory, getNlbMetricsHistory } from "./cloudwatch";
import { getTaskLogs } from "./logs";
import { listAlbs } from "./alb";
import { listDatabases } from "./database";

export const ecsApi = {
    listClusters,
    getCluster,
    listServices,
    getService,
    listTasks,
    getClusterMetrics,
    updateServiceDesiredCount,
    getTaskLogs,
    listAlbs,
    listContainerInstances,
    listDatabases,
    getServiceMetricsHistory,
    getAlbMetricsHistory,
    getNlbMetricsHistory,
};

import * as ec2Commands from "./ec2-commands";
export const diagnosticsApi = ec2Commands;
