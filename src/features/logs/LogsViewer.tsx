import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useNavigationStore } from "@/store/navigation";
import { cn } from "@/lib/utils";

export function LogsViewer() {
  const { selectedTaskArn } = useNavigationStore();

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ["logs", selectedTaskArn],
    queryFn: () => ecsApi.getTaskLogs(selectedTaskArn!),
    enabled: !!selectedTaskArn,
    refetchInterval: 5000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading logs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 px-8">
        <span className="text-sm font-medium text-destructive">Failed to fetch logs</span>
        <pre className="max-w-2xl whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </div>
    );
  }

  if (!logs?.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No logs available.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Logs</h2>
        <span className="text-xs text-muted-foreground">
          Auto-refresh every 5s
        </span>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-border bg-[oklch(0.12_0_0)] p-3">
        <pre className="font-mono text-xs leading-relaxed">
          {logs.map((log, i) => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const isError = log.message.includes("ERROR");
            const isWarn = log.message.includes("WARN");
            return (
              <div
                key={i}
                className={cn(
                  "py-0.5",
                  isError && "text-destructive",
                  isWarn && "text-warning",
                  !isError && !isWarn && "text-foreground/80",
                )}
              >
                <span className="mr-3 text-muted-foreground">{time}</span>
                {log.message}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
