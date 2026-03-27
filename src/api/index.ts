export { initAwsClients } from "./clients";
export type * from "./types";

import {
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
    getClusterVpcId,
} from "./ecs";
import { getServiceMetricsHistory, getAlbMetricsHistory, getNlbMetricsHistory, getEc2MetricsHistory } from "./cloudwatch";
import { listAlbs } from "./alb";
import { listEc2 } from "./ec2";

export const ecsApi = {
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
    getClusterVpcId,
    listEc2,
    getEc2MetricsHistory,
    getServiceMetricsHistory,
    getAlbMetricsHistory,
    getNlbMetricsHistory,
};

export * as ec2Commands from "./ec2-commands";
