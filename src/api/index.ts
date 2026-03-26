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
    forceNewDeployment,
    rollbackService,
    getTaskDefinitionJson,
    registerAndDeployTaskDefinition,
    stopTask,
    listContainerInstances,
} from "./ecs";
import { getServiceMetricsHistory, getAlbMetricsHistory, getNlbMetricsHistory } from "./cloudwatch";
import { listAlbs } from "./alb";
import { listDatabases } from "./database";
import { listVpcInstances } from "./ec2";
import { getEc2MetricsHistory } from "./cloudwatch";

export const ecsApi = {
    listClusters,
    getCluster,
    listServices,
    getService,
    getServiceEvents,
    listTasks,
    getClusterMetrics,
    updateServiceDesiredCount,
    forceNewDeployment,
    rollbackService,
    getTaskDefinitionJson,
    registerAndDeployTaskDefinition,
    stopTask,
    listAlbs,
    listContainerInstances,
    listDatabases,
    listVpcInstances,
    getEc2MetricsHistory,
    getServiceMetricsHistory,
    getAlbMetricsHistory,
    getNlbMetricsHistory,
};

export * as ec2Commands from "./ec2-commands";
