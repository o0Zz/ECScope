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
    listTaskDefinitionRevisions,
} from "./ecs-services";
import { listTasks, stopTask, updateSecretValue } from "./ecs-tasks";
import { listContainerInstances, getClusterVpcId } from "./ecs-instances";
import { getClusterAsgInfo, updateAsgDesiredCapacity, updateAsgScalingLimits } from "./asg";
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
import { getLogStreamEvents, filterLogEvents } from "./logs";
import { listScheduledTasks, setScheduledTaskEnabled, runScheduledTaskNow } from "./scheduled";

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
    listTaskDefinitionRevisions,
    stopTask,
    updateSecretValue,
    listAlbs,
    listContainerInstances,
    getClusterVpcId,
    getClusterAsgInfo,
    updateAsgDesiredCapacity,
    updateAsgScalingLimits,
    getServiceScalingTargets,
    updateServiceScalingTarget,
    listEc2,
    getEc2MetricsHistory,
    getRdsMetricsHistory,
    getServiceMetricsHistory,
    getAlbMetricsHistory,
    getNlbMetricsHistory,
    listRdsInstances,
    getLogStreamEvents,
    filterLogEvents,
    listScheduledTasks,
    setScheduledTaskEnabled,
    runScheduledTaskNow,
};
