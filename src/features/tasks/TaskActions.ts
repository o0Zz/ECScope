import { invoke, createLogger } from "@/lib/logger";
import type { CaptureConfig } from "./CaptureConfigDialog";

const logger = createLogger("TaskActions");

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
    }).catch((err) => logger.error(`ECS exec into ${containerName} on ${taskId} failed`, err));
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
    }).catch((err) => logger.error(`Docker logs for ${containerName} failed`, err));
}

export function openHttpCapture(
    instanceId: string,
    runtimeId: string,
    containerName: string,
    params: TaskActionParams,
    config: CaptureConfig,
): void {
    // tshark fields — tcp.stream correlates request/response into one output line
    const fields = [
        "-e tcp.stream",
        "-e frame.time_relative",
        "-e ip.src",
        "-e http.request.method",
        "-e http.request.uri",
        "-e http.response.code",
        "-e http.time",
    ];

    // Capture all HTTP; filtering happens in awk after request/response correlation
    const tsharkParts = [
        `tshark -l -i any -Y "http.request or http.response"`,
        `-T fields ${fields.join(" ")}`,
    ];
    if (config.durationSeconds > 0) {
        tsharkParts.push(`-a duration:${config.durationSeconds}`);
    }
    const tsharkCmd = tsharkParts.join(" ");

    // Build awk filter conditions applied on the correlated response line
    // Awk vars at that point: m=method, p=uri, $6=status code, $7=http.time (seconds)
    const conditions: string[] = [];
    if (config.minResponseTimeMs > 0) {
        conditions.push(`$7+0>=${config.minResponseTimeMs / 1000}`);
    }
    if (config.httpMethod) {
        conditions.push(`m=="${config.httpMethod}"`);
    }
    if (config.uriFilter) {
        const safe = config.uriFilter.replace(/[\\'"`;$]/g, "");
        conditions.push(`index(p,"${safe}")>0`);
    }
    if (config.statusFilter) {
        const c = config.statusFilter.charAt(0);
        conditions.push(`$6+0>=${c}00&&$6+0<${Number(c) + 1}00`);
    }
    const filter = conditions.length > 0 ? conditions.join("&&") : "1";

    // Awk correlates request + response by tcp.stream ($1) into a single line:
    //   #stream | time | source_ip | METHOD /uri | status | response_time
    // Input (tab-separated): $1=stream $2=time_rel $3=ip.src $4=method $5=uri $6=code $7=http.time
    const awk = [
        `awk 'BEGIN{FS="\\t"}`,
        `$4!=""{r[$1]=$4;u[$1]=$5;s[$1]=$3}`,
        `$6!=""{m=($1 in r)?r[$1]:"?";p=($1 in u)?u[$1]:"?";a=($1 in s)?s[$1]:$3;`,
        `if(${filter}){printf "#%s | %s | %s | %s %s | %s | %ss\\n",$1,$2,a,m,p,$6,$7;fflush()}`,
        `delete r[$1];delete u[$1];delete s[$1]}'`,
    ].join(" ");

    const cmd = [
        "sudo yum install -y wireshark-cli 2>/dev/null || sudo apt-get install -y tshark 2>/dev/null || true",
        `&& sudo nsenter -t $(sudo docker inspect -f '{{.State.Pid}}' ${runtimeId}) -n --`,
        `${tsharkCmd} 2>/dev/null | ${awk}`,
    ].join(" ");

    invoke("open_ssm_session", {
        params: {
            instance_id: instanceId,
            commands: [cmd],
            title: `http-capture: ${containerName}`,
            profile: params.profile,
            region: params.region,
        },
    }).catch((err) => logger.error(`HTTP capture for ${containerName} failed`, err));
}
