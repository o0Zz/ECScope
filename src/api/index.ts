export { initAwsClients } from "./clients";
export type * from "./types";

import {
    listServices,
    getService,
    getServiceEvents,
    getClusterMetrics,
    updateServiceDesiredCount,
    forceNewDeployment,
    rollbackService,
    getTaskDefinitionJson,
    registerAndDeployTaskDefinition,
} from "./ecs-services";
import { listTasks, stopTask } from "./ecs-tasks";
import { listContainerInstances, getClusterVpcId } from "./ecs-instances";
import { getClusterAsgInfo, updateAsgDesiredCapacity } from "./asg";
import { getServiceScalingTargets, updateServiceScalingTarget } from "./service-autoscaling";
import {
    getServiceMetricsHistory,
    getAlbMetricsHistory,
    getNlbMetricsHistory,
    getEc2MetricsHistory,
    getRdsMetricsHistory,
} from "./cloudwatch";
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
    getClusterAsgInfo,
    updateAsgDesiredCapacity,
    getServiceScalingTargets,
    updateServiceScalingTarget,
    listEc2,
    getEc2MetricsHistory,
    getRdsMetricsHistory,
    getServiceMetricsHistory,
    getAlbMetricsHistory,
    getNlbMetricsHistory,
    listRdsInstances,
};
