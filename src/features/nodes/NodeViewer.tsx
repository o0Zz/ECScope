import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ecsApi, diagnosticsApi } from "@/api";
import type { S3Credentials } from "@/api/types";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricBar } from "@/components/MetricBar";
import { Monitor, Terminal, Stethoscope, Download, Upload } from "lucide-react";
import { formatAge } from "@/lib/format";
import { invoke } from "@tauri-apps/api/core";
import { DiagnosticsDialog } from "./DiagnosticsDialog";

export function NodeViewer() {
  const { selectedCluster } = useNavigationStore();
  const { activeCluster } = useConfigStore();
  const storage = useConfigStore((s) => s.storage);
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
  const [diagInstanceId, setDiagInstanceId] = useState<string | null>(null);
  const hasDiagnostics = !!(storage?.s3Bucket && storage?.s3AccessKeyId && storage?.s3SecretAccessKey);

  const getS3Creds = (): S3Credentials => ({
    accessKeyId: storage!.s3AccessKeyId!,
    secretAccessKey: storage!.s3SecretAccessKey!,
    region: storage?.s3Region ?? activeCluster?.region ?? "us-east-1",
  });

  const handleDownloadFromEc2 = async (instanceId: string) => {
    const remotePath = window.prompt("Remote file path on EC2 to download:");
    if (!remotePath?.trim()) return;
    try {
      await diagnosticsApi.downloadEc2File({
        instanceId,
        credentials: getS3Creds(),
        s3Bucket: storage!.s3Bucket!,
        remotePath: remotePath.trim(),
      });
    } catch (err) {
      console.error("[ECScope] Download from EC2 failed:", err);
      window.alert(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUploadToEc2 = async (instanceId: string) => {
    const remotePath = window.prompt("Remote destination path on EC2 (file or directory ending with /):");
    if (!remotePath?.trim()) return;
    try {
      await diagnosticsApi.uploadFile(
        getS3Creds(),
        storage!.s3Bucket!,
        instanceId,
        remotePath.trim(),
      );
    } catch (err) {
      console.error("[ECScope] Upload to EC2 failed:", err);
      window.alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const { data: instances, isLoading } = useQuery({
    queryKey: ["nodes", selectedCluster],
    queryFn: () => ecsApi.listContainerInstances(selectedCluster!),
    enabled: !!selectedCluster,
    refetchInterval: refreshIntervalMs,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading container instances…
      </div>
    );
  }

  if (!instances?.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No container instances found (Fargate-only cluster).
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Container Instances
        <span className="ml-2 text-sm font-normal text-muted-foreground">({instances.length})</span>
      </h2>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Instance</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Tasks</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">CPU</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Memory</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Agent</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Age</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => {
              const cpuUsed = inst.cpuRegistered - inst.cpuAvailable;
              const cpuPct = Math.round((cpuUsed / inst.cpuRegistered) * 100);
              const memUsed = inst.memoryRegistered - inst.memoryAvailable;
              const memPct = Math.round((memUsed / inst.memoryRegistered) * 100);

              return (
                <tr
                  key={inst.containerInstanceArn}
                  className="border-b border-border last:border-b-0 hover:bg-accent/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-info" />
                      <span className="font-mono text-xs font-medium text-foreground">{inst.ec2InstanceId}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{inst.instanceType}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inst.status} />
                  </td>
                  <td className="px-4 py-3 text-center text-foreground">
                    {inst.runningTasksCount}
                    {inst.pendingTasksCount > 0 && (
                      <span className="ml-1 text-warning">+{inst.pendingTasksCount}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <MetricBar
                      value={cpuPct}
                      label={`${cpuUsed}/${inst.cpuRegistered}`}
                      color={cpuPct > 80 ? "bg-destructive" : cpuPct > 60 ? "bg-warning" : "bg-info"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <MetricBar
                      value={memPct}
                      label={`${memUsed}/${inst.memoryRegistered}MB`}
                      color={memPct > 80 ? "bg-destructive" : memPct > 60 ? "bg-warning" : "bg-primary"}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{inst.agentVersion}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatAge(inst.registeredAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          invoke("open_ssm_session", {
                            params: {
                              instance_id: inst.ec2InstanceId,
                              profile: activeCluster?.profile ?? "",
                              region: activeCluster?.region ?? "us-east-1",
                            },
                          }).catch((err) => console.error("[ECScope] SSM connect failed:", err));
                        }}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1"
                        title={`SSM connect to ${inst.ec2InstanceId}`}
                      >
                        <Terminal className="h-3 w-3" />
                        Connect
                      </button>
                      {hasDiagnostics && (
                        <button
                          onClick={() => setDiagInstanceId(inst.ec2InstanceId)}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1"
                          title={`Run diagnostics on ${inst.ec2InstanceId}`}
                        >
                          <Stethoscope className="h-3 w-3" />
                          Diagnostics
                        </button>
                      )}
                      {hasDiagnostics && (
                        <button
                          onClick={() => handleDownloadFromEc2(inst.ec2InstanceId)}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1"
                          title={`Download file from ${inst.ec2InstanceId}`}
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                      )}
                      {hasDiagnostics && (
                        <button
                          onClick={() => handleUploadToEc2(inst.ec2InstanceId)}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1"
                          title={`Upload file to ${inst.ec2InstanceId}`}
                        >
                          <Upload className="h-3 w-3" />
                          Upload
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {diagInstanceId && (
        <DiagnosticsDialog
          instanceId={diagInstanceId}
          onClose={() => setDiagInstanceId(null)}
        />
      )}
    </div>
  );
}
