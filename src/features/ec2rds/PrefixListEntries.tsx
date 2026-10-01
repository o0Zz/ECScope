import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, AlertCircle, List } from "lucide-react";
import { ecsApi } from "@/api";
import { useConfigStore } from "@/store/config";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const inputClass =
    "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

export function PrefixListEntries({ prefixListId }: { prefixListId: string }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const queryKey = ["prefixList", prefixListId];

    const [ip, setIp] = useState("");
    const [description, setDescription] = useState("");
    const [pendingRemove, setPendingRemove] = useState<string | null>(null);

    const { data: pl, error } = useQuery({
        queryKey,
        queryFn: () => ecsApi.getPrefixList(prefixListId),
        refetchInterval: refreshIntervalMs,
    });

    const modifyMutation = useMutation({
        mutationFn: (change: { add?: { ip: string; description: string }; removeCidr?: string }) =>
            ecsApi.modifyPrefixList(prefixListId, pl!.version, change),
        onSuccess: () => {
            setIp("");
            setDescription("");
            setPendingRemove(null);
            queryClient.invalidateQueries({ queryKey });
        },
    });

    if (!pl) {
        return error ? (
            <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {error.message}
            </div>
        ) : null;
    }

    const busy = modifyMutation.isPending || pl.state.endsWith("in-progress");
    const editable = !pl.awsManaged;
    const mutationError = modifyMutation.error ?? error;

    return (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <List className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">{pl.name || pl.prefixListId}</span>
                <span>
                    {t("prefixList.summary", { count: pl.entries.length, max: pl.maxEntries, version: pl.version })}
                </span>
                {pl.state !== "create-complete" && pl.state !== "modify-complete" && (
                    <span className="text-warning">{pl.state}</span>
                )}
                {editable && <span className="italic">{t("prefixList.sharedWarning")}</span>}
            </div>

            <table className="w-full text-xs">
                <tbody>
                    {pl.entries.map((e) => (
                        <tr key={e.cidr} className="border-t border-border">
                            <td className="px-3 py-1 font-mono text-foreground">{e.cidr}</td>
                            <td className="px-3 py-1 text-muted-foreground">{e.description || "—"}</td>
                            <td className="w-8 px-3 py-1">
                                {editable && (
                                    <button
                                        onClick={() => setPendingRemove(e.cidr)}
                                        disabled={busy}
                                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
                                        title={t("prefixList.remove")}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {editable && (
                <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (ip.trim())
                            modifyMutation.mutate({ add: { ip: ip.trim(), description: description.trim() } });
                    }}
                >
                    <input
                        value={ip}
                        onChange={(e) => setIp(e.target.value)}
                        placeholder={t("securityGroups.ipPlaceholder")}
                        className={`${inputClass} w-44 font-mono`}
                    />
                    <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t("securityGroups.descriptionPlaceholder")}
                        className={`${inputClass} w-56`}
                    />
                    <button
                        type="submit"
                        disabled={!ip.trim() || busy}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        {modifyMutation.isPending ? t("common.working") : t("prefixList.add")}
                    </button>
                </form>
            )}

            {mutationError && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {mutationError.message}
                </div>
            )}

            <ConfirmDialog
                open={!!pendingRemove}
                title={t("prefixList.removeTitle")}
                message={t("prefixList.removeMessage")}
                detail={pendingRemove ? `${pendingRemove} — ${pl.name || pl.prefixListId}` : undefined}
                confirmLabel={t("prefixList.remove")}
                confirmingLabel={t("common.working")}
                variant="destructive"
                isPending={modifyMutation.isPending}
                onConfirm={() => modifyMutation.mutate({ removeCidr: pendingRemove! })}
                onCancel={() => setPendingRemove(null)}
            />
        </div>
    );
}
