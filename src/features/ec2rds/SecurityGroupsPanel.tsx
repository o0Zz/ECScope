import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Shield, Plus, Trash2, AlertCircle } from "lucide-react";
import { ecsApi } from "@/api";
import type { SecurityGroupRule, VpcEc2Instance } from "@/api/types";
import { useConfigStore } from "@/store/config";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PrefixListEntries } from "./PrefixListEntries";

const inputClass =
    "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

function formatPorts(rule: SecurityGroupRule, all: string): string {
    if (rule.protocol === "-1") return all;
    if (rule.fromPort === rule.toPort) return `${rule.protocol} ${rule.fromPort}`;
    return `${rule.protocol} ${rule.fromPort}-${rule.toPort}`;
}

export function SecurityGroupsPanel({ instance }: { instance: VpcEc2Instance }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const groupIds = instance.securityGroups.map((g) => g.groupId);
    const queryKey = ["ingressRules", ...groupIds];

    const [groupId, setGroupId] = useState(groupIds[0] ?? "");
    const [ip, setIp] = useState("");
    const [port, setPort] = useState("22");
    const [description, setDescription] = useState("");
    const [pendingRemove, setPendingRemove] = useState<SecurityGroupRule | null>(null);

    const { data: rules, error } = useQuery({
        queryKey,
        queryFn: () => ecsApi.listIngressRules(groupIds),
        enabled: groupIds.length > 0,
        refetchInterval: refreshIntervalMs,
    });

    const addMutation = useMutation({
        mutationFn: () => ecsApi.addIngressRule(groupId, ip.trim(), Number(port), description.trim()),
        onSuccess: () => {
            setIp("");
            setDescription("");
            queryClient.invalidateQueries({ queryKey });
        },
    });

    const removeMutation = useMutation({
        mutationFn: (rule: SecurityGroupRule) => ecsApi.removeIngressRule(rule.groupId, rule.ruleId),
        onSuccess: () => {
            setPendingRemove(null);
            queryClient.invalidateQueries({ queryKey });
        },
    });

    if (groupIds.length === 0) return null;

    const mutationError = addMutation.error ?? removeMutation.error ?? error;
    const canAdd = !!groupId && ip.trim() !== "" && Number(port) > 0 && Number(port) <= 65535;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Shield className="h-3.5 w-3.5 text-primary" />
                {t("securityGroups.title")}
            </div>

            {instance.securityGroups.map((g) => (
                <div key={g.groupId} className="overflow-hidden rounded-md border border-border">
                    <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{g.groupName}</span>{" "}
                        <span className="font-mono">{g.groupId}</span>
                    </div>
                    <table className="w-full text-xs">
                        <tbody>
                            {(rules ?? [])
                                .filter((r) => r.groupId === g.groupId)
                                .map((r) => (
                                    <Fragment key={r.ruleId}>
                                        <tr className="border-t border-border">
                                            <td className="px-3 py-1.5 font-mono text-foreground">{r.source}</td>
                                            <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                                {formatPorts(r, t("securityGroups.allTraffic"))}
                                            </td>
                                            <td className="px-3 py-1.5 text-muted-foreground">
                                                {r.description || "—"}
                                            </td>
                                            <td className="w-8 px-3 py-1.5">
                                                <button
                                                    onClick={() => setPendingRemove(r)}
                                                    className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                                                    title={t("securityGroups.remove")}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                        {r.source.startsWith("pl-") && (
                                            <tr>
                                                <td colSpan={4} className="px-3 pb-2">
                                                    <PrefixListEntries prefixListId={r.source} />
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                        </tbody>
                    </table>
                </div>
            ))}

            <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (canAdd) addMutation.mutate();
                }}
            >
                {groupIds.length > 1 && (
                    <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass}>
                        {instance.securityGroups.map((g) => (
                            <option key={g.groupId} value={g.groupId}>
                                {g.groupName}
                            </option>
                        ))}
                    </select>
                )}
                <input
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    placeholder={t("securityGroups.ipPlaceholder")}
                    className={`${inputClass} w-44 font-mono`}
                />
                <input
                    type="number"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    title={t("securityGroups.port")}
                    className={`${inputClass} w-20 font-mono`}
                />
                <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("securityGroups.descriptionPlaceholder")}
                    className={`${inputClass} w-56`}
                />
                <button
                    type="submit"
                    disabled={!canAdd || addMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    <Plus className="h-3.5 w-3.5" />
                    {addMutation.isPending ? t("common.working") : t("securityGroups.add")}
                </button>
            </form>

            {mutationError && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {mutationError.message}
                </div>
            )}

            <ConfirmDialog
                open={!!pendingRemove}
                title={t("securityGroups.removeTitle")}
                message={t("securityGroups.removeMessage")}
                detail={
                    pendingRemove
                        ? `${pendingRemove.source} — ${formatPorts(pendingRemove, t("securityGroups.allTraffic"))}`
                        : undefined
                }
                confirmLabel={t("securityGroups.remove")}
                confirmingLabel={t("common.working")}
                variant="destructive"
                isPending={removeMutation.isPending}
                onConfirm={() => removeMutation.mutate(pendingRemove!)}
                onCancel={() => setPendingRemove(null)}
            />
        </div>
    );
}
