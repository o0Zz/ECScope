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
import { getServiceMetricsHistory, getAlbMetricsHistory, getNlbMetricsHistory, getEc2MetricsHistory, getRdsMetricsHistory } from "./cloudwatch";
import { listAlbs } from "./alb";
import { listEc2 } from "./ec2";
import { listRdsInstances } from "./rds";

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
    getRdsMetricsHistory,
    getServiceMetricsHistory,
    getAlbMetricsHistory,
    getNlbMetricsHistory,
    listRdsInstances,
};
