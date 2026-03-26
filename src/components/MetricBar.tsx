import { cn } from "@/lib/utils";

export function MetricBar({ value, label, color }: { value: number; label: string; color: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn("h-full rounded-full transition-all", color)}
                    style={{ width: `${Math.min(100, value)}%` }}
                />
            </div>
            <span className="text-xs text-muted-foreground">{value}% {label}</span>
        </div>
    );
}
