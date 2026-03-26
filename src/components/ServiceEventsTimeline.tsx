import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useConfigStore } from "@/store/config";
import { ChevronDown, ChevronRight, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const ERROR_PATTERNS = [
  "unable",
  "failed",
  "error",
  "unhealthy",
  "stopped",
  "missing",
  "timeout",
  "oom",
  "killed",
  "not found",
  "exceeded",
  "rejected",
  "insufficient",
];

function isErrorEvent(message: string): boolean {
  const lower = message.toLowerCase();
  return ERROR_PATTERNS.some((p) => lower.includes(p));
}

function formatEventTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ServiceEventsTimeline({
  clusterName,
  serviceName,
}: {
  clusterName: string;
  serviceName: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);

  const { data: events, isLoading } = useQuery({
    queryKey: ["serviceEvents", clusterName, serviceName],
    queryFn: () => ecsApi.getServiceEvents(clusterName, serviceName),
    enabled: !!clusterName && !!serviceName,
    refetchInterval: refreshIntervalMs,
  });

  const errorCount = events?.filter((e) => isErrorEvent(e.message)).length ?? 0;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-muted/50 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        Service Events
        {events && (
          <span className="text-xs font-normal text-muted-foreground">
            ({events.length})
          </span>
        )}
        {errorCount > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
            <AlertCircle className="h-3 w-3" />
            {errorCount} error{errorCount > 1 ? "s" : ""}
          </span>
        )}
      </button>

      {expanded && (
        <div className="max-h-80 overflow-auto">
          {isLoading && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Loading events…
            </div>
          )}
          {!isLoading && (!events || events.length === 0) && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              No recent events.
            </div>
          )}
          {events && events.length > 0 && (
            <div className="divide-y divide-border">
              {events.map((evt) => {
                const isError = isErrorEvent(evt.message);
                return (
                  <div
                    key={evt.id}
                    className={cn(
                      "flex items-start gap-2 px-4 py-1.5 text-xs",
                      isError && "bg-destructive/5",
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isError ? (
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <Info className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {formatEventTime(evt.createdAt)}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 break-words",
                        isError ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {evt.message}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
