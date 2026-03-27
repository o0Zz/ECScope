import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import type { VpcEc2Instance, RdsInstance } from "@/api/types";
import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { StatusBadge } from "@/components/StatusBadge";
import { Ec2MetricsChart } from "@/components/Ec2MetricsChart";
import { RdsMetricsChart } from "@/components/RdsMetricsChart";
import { Monitor, Database, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge } from "@/lib/format";
import { useState, memo } from "react";

export function Ec2RdsDashboard() {
  const { selectedCluster } = useNavigationStore();
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);

  const { data: instances, isPending: pendingEc2 } = useQuery({
    queryKey: ["vpcInstances", selectedCluster],
    queryFn: async () => {
      const [vpcId] = await Promise.all([
        ecsApi.getClusterVpcId(selectedCluster!),
      ]);
      if (!vpcId) return [];
      return ecsApi.listEc2(vpcId);
    },
    enabled: !!selectedCluster,
    refetchInterval: refreshIntervalMs,
  });

  const { data: rdsInstances, isPending: pendingRds } = useQuery({
    queryKey: ["vpcRdsInstances", selectedCluster],
    queryFn: async () => {
      const vpcId = await ecsApi.getClusterVpcId(selectedCluster!);
      if (!vpcId) return [];
      return ecsApi.listRdsInstances(vpcId);
    },
    enabled: !!selectedCluster,
    refetchInterval: refreshIntervalMs,
  });

  if (pendingEc2 && pendingRds) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading EC2 / RDS…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* ── VPC EC2 Instances ── */}
      <Ec2InstancesSection instances={instances ?? []} />
      {/* ── RDS Databases ── */}
      <RdsInstancesSection instances={rdsInstances ?? []} />
    </div>
  );
}

/* ─── EC2 Instances Section ─────────────────────────────── */

function stateColor(state: string): string {
  switch (state) {
    case "running": return "ACTIVE";
    case "stopped": return "STOPPED";
    case "stopping": return "DRAINING";
    case "pending": return "PROVISIONING";
    default: return state.toUpperCase();
  }
}

const Ec2InstancesSection = memo(function Ec2InstancesSection({ instances }: { instances: VpcEc2Instance[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        <Monitor className="mr-2 inline h-5 w-5 text-primary" />
        VPC EC2 Instances
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({instances.length})
        </span>
      </h2>

      {instances.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No non-node EC2 instances found in the cluster VPC.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Instance ID</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">State</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Private IP</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Public IP</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Platform</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Age</th>
                <th className="w-8 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {instances.map((inst) => (
                <Ec2InstanceRow
                  key={inst.instanceId}
                  instance={inst}
                  expanded={expandedId === inst.instanceId}
                  onToggle={() => setExpandedId(expandedId === inst.instanceId ? null : inst.instanceId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

const Ec2InstanceRow = memo(function Ec2InstanceRow({
  instance: inst,
  expanded,
  onToggle,
}: {
  instance: VpcEc2Instance;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-border transition-colors hover:bg-accent/30"
      >
        <td className="px-4 py-2.5 font-medium text-foreground">
          {inst.name || <span className="text-muted-foreground italic">—</span>}
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inst.instanceId}</td>
        <td className="px-4 py-2.5 text-muted-foreground">{inst.instanceType}</td>
        <td className="px-4 py-2.5">
          <StatusBadge status={stateColor(inst.state)} />
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inst.privateIp || "—"}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inst.publicIp || "—"}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">{inst.platform}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">
          {inst.launchTime ? formatAge(inst.launchTime) : "—"}
        </td>
        <td className="px-4 py-2.5">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={9} className="px-4 py-4">
            {inst.state !== "running" ? (
              <div className="text-xs text-muted-foreground italic">
                Metrics unavailable — instance is {inst.state}.
              </div>
            ) : (
              <Ec2MetricsChart instanceId={inst.instanceId} />
            )}
          </td>
        </tr>
      )}
    </>
  );
});

/* ─── RDS Instances Section ─────────────────────────────── */

function rdsStatusColor(status: string): string {
  switch (status) {
    case "available": return "ACTIVE";
    case "stopped": return "STOPPED";
    case "stopping": return "DRAINING";
    case "starting": return "PROVISIONING";
    case "creating": return "PROVISIONING";
    case "deleting": return "DRAINING";
    case "modifying": return "DRAINING";
    case "backing-up": return "ACTIVE";
    case "rebooting": return "PROVISIONING";
    case "failed": return "STOPPED";
    default: return status.toUpperCase();
  }
}

const RdsInstancesSection = memo(function RdsInstancesSection({ instances }: { instances: RdsInstance[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        <Database className="mr-2 inline h-5 w-5 text-primary" />
        RDS Databases
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({instances.length})
        </span>
      </h2>

      {instances.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No RDS instances found in the cluster VPC.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Identifier</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Engine</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Class</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Endpoint</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Storage</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Multi-AZ</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Age</th>
                <th className="w-8 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {instances.map((db) => (
                <RdsInstanceRow
                  key={db.dbInstanceIdentifier}
                  instance={db}
                  expanded={expandedId === db.dbInstanceIdentifier}
                  onToggle={() => setExpandedId(expandedId === db.dbInstanceIdentifier ? null : db.dbInstanceIdentifier)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

const RdsInstanceRow = memo(function RdsInstanceRow({
  instance: db,
  expanded,
  onToggle,
}: {
  instance: RdsInstance;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-border transition-colors hover:bg-accent/30"
      >
        <td className="px-4 py-2.5 font-medium text-foreground">{db.dbInstanceIdentifier}</td>
        <td className="px-4 py-2.5 text-muted-foreground">
          {db.engine} {db.engineVersion}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">{db.dbInstanceClass}</td>
        <td className="px-4 py-2.5">
          <StatusBadge status={rdsStatusColor(db.status)} />
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
          {db.endpoint ? `${db.endpoint}:${db.port}` : "—"}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">
          {db.allocatedStorage} GB {db.storageType}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">{db.multiAz ? "Yes" : "No"}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">
          {db.createdAt ? formatAge(db.createdAt) : "—"}
        </td>
        <td className="px-4 py-2.5">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={9} className="px-4 py-4">
            {db.status !== "available" ? (
              <div className="text-xs text-muted-foreground italic">
                Metrics unavailable — instance is {db.status}.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>AZ: <span className="font-mono text-foreground">{db.availabilityZone}{db.secondaryAvailabilityZone ? `, ${db.secondaryAvailabilityZone}` : ""}</span></span>
                  <span>User: <span className="font-mono text-foreground">{db.masterUsername}</span></span>
                  <span>Encrypted: <span className="text-foreground">{db.storageEncrypted ? "Yes" : "No"}</span></span>
                  <span>Public: <span className="text-foreground">{db.publiclyAccessible ? "Yes" : "No"}</span></span>
                </div>
                <RdsMetricsChart dbInstanceIdentifier={db.dbInstanceIdentifier} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
});
