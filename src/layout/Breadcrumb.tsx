import { useNavigationStore } from "@/store/navigation";
import { useConfigStore } from "@/store/config";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

export function Breadcrumb() {
    const { t } = useTranslation();
    const { selectedCluster, selectedService, selectedTaskArn, goBack } = useNavigationStore();
    const activeCluster = useConfigStore((s) => s.activeCluster);
    const credentials = useConfigStore((s) => s.credentials);
    const clusterColor = activeCluster?.color;
    const queryClient = useQueryClient();
    const isFetching = useIsFetching();

    const handleRefresh = () => {
        queryClient.invalidateQueries();
    };

    const parts: string[] = [];
    if (selectedCluster) parts.push(selectedCluster);
    if (selectedService) parts.push(selectedService);
    if (selectedTaskArn) parts.push(selectedTaskArn.split("/").pop() ?? "task");

    const clusterRegion = credentials?.region ?? activeCluster?.region;
    const clusterInfo =
        activeCluster && (clusterRegion ? `${clusterRegion} · ${activeCluster.profile}` : activeCluster.profile);

    return (
        <>
            {clusterColor && <div className="h-1 w-full" style={{ backgroundColor: `#${clusterColor}` }} />}
            <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2 text-sm">
                {parts.length > 1 && (
                    <button
                        onClick={goBack}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                )}
                {parts.map((part, i) => (
                    <span key={i} className="flex items-center gap-2">
                        {i > 0 && <span className="text-muted-foreground">/</span>}
                        <span
                            className={i === parts.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}
                        >
                            {part}
                        </span>
                        {i === 0 && clusterInfo && (
                            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {clusterInfo}
                            </span>
                        )}
                    </span>
                ))}
                <div className="ml-auto flex items-center gap-1.5">
                    {isFetching > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {t("common.refreshing")}
                        </span>
                    )}
                    <button
                        onClick={handleRefresh}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title={t("common.refreshAll")}
                    >
                        <RefreshCw className={cn("h-4 w-4", isFetching > 0 && "animate-spin")} />
                        <span className="sr-only">{t("common.refreshing")}</span>
                    </button>
                    <ThemeToggle />
                </div>
            </div>
        </>
    );
}
