import { cn } from "@/lib/utils";

interface StatusBadgeProps {
    status: string;
    className?: string;
}

const statusColors: Record<string, string> = {
    RUNNING: "bg-success/15 text-success",
    ACTIVE: "bg-success/15 text-success",
    HEALTHY: "bg-success/15 text-success",
    COMPLETED: "bg-success/15 text-success",
    PRIMARY: "bg-success/15 text-success",
    PENDING: "bg-warning/15 text-warning",
    IN_PROGRESS: "bg-warning/15 text-warning",
    PROVISIONING: "bg-warning/15 text-warning",
    DRAINING: "bg-warning/15 text-warning",
    STOPPED: "bg-destructive/15 text-destructive",
    INACTIVE: "bg-destructive/15 text-destructive",
    UNHEALTHY: "bg-destructive/15 text-destructive",
    UNKNOWN: "bg-muted text-muted-foreground",
};

const statusEmojis: Record<string, string> = {
    RUNNING: "✅",
    ACTIVE: "✅",
    HEALTHY: "✅",
    COMPLETED: "✅",
    PRIMARY: "✅",
    PENDING: "⏳",
    IN_PROGRESS: "⏳",
    PROVISIONING: "⏳",
    DRAINING: "⏳",
    STOPPED: "🛑",
    INACTIVE: "🛑",
    UNHEALTHY: "❌",
    UNKNOWN: "❓",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const colors = statusColors[status] ?? "bg-muted text-muted-foreground";
    const emoji = statusEmojis[status];
    return (
        <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", colors, className)}>
            {emoji && (
                <span className="mr-1" aria-hidden>
                    {emoji}
                </span>
            )}
            {status}
        </span>
    );
}
