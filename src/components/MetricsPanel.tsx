import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConfigStore } from "@/store/config";

interface MetricsPanelProps<T> {
    queryKey: unknown[];
    queryFn: () => Promise<T[]>;
    loadingText?: string;
    emptyText?: string;
    children: (data: T[]) => ReactNode;
    className?: string;
}

export function MetricsPanel<T>({
    queryKey,
    queryFn,
    loadingText = "Loading metrics…",
    emptyText = "No metrics data available.",
    children,
    className,
}: MetricsPanelProps<T>) {
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const { data, isLoading } = useQuery({
        queryKey,
        queryFn,
        refetchInterval: refreshIntervalMs,
    });

    if (isLoading) {
        return (
            <div className={`flex items-center justify-center rounded border border-border bg-card py-4 text-xs text-muted-foreground ${className ?? "mt-2"}`}>
                {loadingText}
            </div>
        );
    }

    if (!data?.length) {
        return (
            <div className={`flex items-center justify-center rounded border border-border bg-card py-4 text-xs text-muted-foreground ${className ?? "mt-2"}`}>
                {emptyText}
            </div>
        );
    }

    return <>{children(data)}</>;
}
