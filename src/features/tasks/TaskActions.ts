import { invoke } from "@tauri-apps/api/core";

interface TaskActionParams {
    profile: string;
    region: string;
}

export function openEcsExec(
    clusterName: string,
    taskId: string,
    containerName: string,
    params: TaskActionParams,
): void {
    invoke("open_ecs_exec", {
        params: {
            cluster: clusterName,
            task_id: taskId,
            container: containerName,
            profile: params.profile,
            region: params.region,
        },
    }).catch((err) => console.error("[ECScope] ECS exec failed:", err));
}

export function openTaskLogs(
    instanceId: string,
    runtimeId: string,
    containerName: string,
    params: TaskActionParams,
): void {
    invoke("open_ssm_session", {
        params: {
            instance_id: instanceId,
            commands: [`sudo docker logs -f --tail 200 ${runtimeId}`],
            title: `logs: ${containerName}`,
            profile: params.profile,
            region: params.region,
        },
    }).catch((err) => console.error("[ECScope] ECS logs failed:", err));
}

export function openHttpCapture(
    instanceId: string,
    runtimeId: string,
    containerName: string,
    params: TaskActionParams,
): void {
    const cmd = [
        "sudo dnf install -y wireshark-cli",
        `&& sudo nsenter -t $(sudo docker inspect -f '{{.State.Pid}}' ${runtimeId}) -n --`,
        `tshark -i any -Y "http.request or http.response"`,
        `-T fields -e frame.time_relative -e ip.src -e http.request.method -e http.request.uri -e http.response.code -e http.time`,
        `-E separator=" | " 2>/dev/null`,
    ].join(" ");

    invoke("open_ssm_session", {
        params: {
            instance_id: instanceId,
            commands: [cmd],
            title: `http-capture: ${containerName}`,
            profile: params.profile,
            region: params.region,
        },
    }).catch((err) => console.error("[ECScope] HTTP capture failed:", err));
}
