import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { EcsTask } from "@/api/types";
import { ecsApi } from "@/api";
import { FileCode, KeyRound, Pencil } from "lucide-react";
import { EditSecretDialog, type EditSecretInfo } from "./EditSecretDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CopyButton } from "@/components/CopyButton";

export function EnvVarPanel({
    task,
    clusterName,
    serviceName,
}: {
    task: EcsTask;
    clusterName: string;
    serviceName: string;
}) {
    const { t } = useTranslation();
    const [filter, setFilter] = useState("");
    const lowerFilter = filter.toLowerCase();
    const [editingSecret, setEditingSecret] = useState<EditSecretInfo | null>(null);
    const [showRedeployPrompt, setShowRedeployPrompt] = useState(false);
    const queryClient = useQueryClient();

    const updateMutation = useMutation({
        mutationFn: ({ valueFrom, newValue }: { valueFrom: string; newValue: string }) =>
            ecsApi.updateSecretValue(valueFrom, newValue),
        onSuccess: () => {
            setEditingSecret(null);
            setShowRedeployPrompt(true);
            queryClient.invalidateQueries({ queryKey: ["tasks", clusterName, serviceName] });
        },
    });

    const redeployMutation = useMutation({
        mutationFn: () => ecsApi.forceNewDeployment(clusterName, serviceName),
        onSuccess: () => {
            setShowRedeployPrompt(false);
            queryClient.invalidateQueries({ queryKey: ["services", clusterName] });
            queryClient.invalidateQueries({ queryKey: ["tasks", clusterName, serviceName] });
            queryClient.invalidateQueries({ queryKey: ["serviceDetail", clusterName, serviceName] });
        },
    });

    const totalEnvCount = task.containers.reduce((s, c) => s + c.environment.length + c.secrets.length, 0);
    if (totalEnvCount === 0) {
        return <div className="px-4 py-3 text-xs text-muted-foreground">{t("envVars.noVars")}</div>;
    }

    return (
        <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{t("envVars.title")}</span>
                <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={t("envVars.filterPlaceholder")}
                    className="ml-2 h-6 w-48 rounded border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
            </div>
            {task.containers.map((container) => {
                const envRows: {
                    name: string;
                    value: string;
                    source?: string;
                    isSecret: boolean;
                    resolved: boolean;
                }[] = container.environment
                    .filter(
                        (e) =>
                            e.name.toLowerCase().includes(lowerFilter) || e.value.toLowerCase().includes(lowerFilter),
                    )
                    .map((e) => ({ name: e.name, value: e.value, isSecret: false, resolved: true }));
                const secretRows: typeof envRows = container.secrets
                    .filter((s) => {
                        const resolved = s.resolvedValue ?? s.valueFrom;
                        return (
                            s.name.toLowerCase().includes(lowerFilter) || resolved.toLowerCase().includes(lowerFilter)
                        );
                    })
                    .map((s) => ({
                        name: s.name,
                        value: s.resolvedValue ?? "",
                        source: s.valueFrom,
                        isSecret: true,
                        resolved: !!s.resolvedValue,
                    }));
                const allRows = [...envRows, ...secretRows].sort((a, b) => a.name.localeCompare(b.name));

                if (allRows.length === 0 && filter) return null;
                return (
                    <div key={container.containerArn} className="rounded border border-border bg-card">
                        <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                            {container.name}
                            <span className="ml-1.5 text-muted-foreground/60">
                                ({envRows.length} {t("envVars.env")}
                                {secretRows.length > 0 && `, ${secretRows.length} ${t("envVars.secrets")}`})
                            </span>
                        </div>
                        <div className="max-h-64 overflow-auto">
                            <table className="w-full text-xs">
                                <tbody>
                                    {allRows.map((row) => (
                                        <tr
                                            key={row.name}
                                            className="border-b border-border last:border-b-0 hover:bg-accent/30"
                                        >
                                            <td className="w-1/3 px-3 py-1 font-mono font-medium text-foreground align-top">
                                                <span className="flex items-center gap-1">
                                                    {row.isSecret && (
                                                        <span title={`Source: ${row.source}`}>
                                                            <KeyRound className="h-3 w-3 text-warning shrink-0" />
                                                        </span>
                                                    )}
                                                    {row.name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1 font-mono text-muted-foreground break-all">
                                                {row.isSecret ? (
                                                    row.resolved ? (
                                                        <span>{row.value}</span>
                                                    ) : (
                                                        <span className="text-warning/60 italic">{row.source}</span>
                                                    )
                                                ) : (
                                                    row.value
                                                )}
                                                <CopyButton
                                                    text={
                                                        row.isSecret && row.resolved
                                                            ? row.value
                                                            : row.isSecret
                                                              ? (row.source ?? "")
                                                              : row.value
                                                    }
                                                />
                                                {row.isSecret && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingSecret({
                                                                name: row.name,
                                                                valueFrom: row.source!,
                                                                currentValue: row.value,
                                                                resolved: row.resolved,
                                                            });
                                                        }}
                                                        className="ml-1 inline-flex items-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                                                        title={t("envVars.editSecret")}
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}

            <EditSecretDialog
                open={!!editingSecret}
                secret={editingSecret}
                isPending={updateMutation.isPending}
                error={updateMutation.error ? (updateMutation.error as Error).message : null}
                onSave={(newValue) => {
                    if (editingSecret) {
                        updateMutation.mutate({ valueFrom: editingSecret.valueFrom, newValue });
                    }
                }}
                onCancel={() => {
                    setEditingSecret(null);
                    updateMutation.reset();
                }}
            />

            <ConfirmDialog
                open={showRedeployPrompt}
                title={t("envVars.redeployTitle")}
                message={t("envVars.redeployMessage")}
                detail={serviceName}
                confirmLabel={t("envVars.redeploy")}
                confirmingLabel={t("envVars.redeploying")}
                isPending={redeployMutation.isPending}
                onConfirm={() => redeployMutation.mutate()}
                onCancel={() => setShowRedeployPrompt(false)}
            />
        </div>
    );
}
