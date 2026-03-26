import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import type { MetricsDataPoint } from "@/api/types";
import { Cpu, MemoryStick } from "lucide-react";

interface ServiceMetricsChartProps {
    clusterName: string;
    serviceName: string;
}

function MiniChart({
    data,
    dataKey,
    color,
    label,
    icon: Icon,
}: {
    data: MetricsDataPoint[];
    dataKey: "cpuUtilization" | "memoryUtilization";
    color: string;
    label: string;
    icon: typeof Cpu;
}) {
    if (data.length === 0) return null;

    const values = data.map((d) => d[dataKey]);
    const max = Math.max(...values, 1);
    const min = Math.min(...values);
    const current = values[values.length - 1];
    const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

    const W = 400;
    const H = 100;
    const padX = 0;
    const padY = 4;

    // Scale to 0-100% range always
    const scaleMax = 100;
    const points = data
        .map((d, i) => {
            const x = padX + (i / (data.length - 1)) * (W - 2 * padX);
            const y = H - padY - ((d[dataKey] / scaleMax) * (H - 2 * padY));
            return `${x},${y}`;
        })
        .join(" ");

    const firstX = padX;
    const lastX = padX + ((data.length - 1) / (data.length - 1)) * (W - 2 * padX);

    return (
        <div className="flex-1 rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                    <span className="text-xs font-medium text-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                        Current: <span className="font-mono font-medium" style={{ color }}>{current.toFixed(1)}%</span>
                    </span>
                    <span>
                        Avg: <span className="font-mono font-medium">{avg}%</span>
                    </span>
                    <span>
                        Min: <span className="font-mono">{min.toFixed(1)}%</span>
                    </span>
                    <span>
                        Max: <span className="font-mono">{max.toFixed(1)}%</span>
                    </span>
                </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
                {/* Grid lines at 25%, 50%, 75% */}
                {[25, 50, 75].map((pct) => {
                    const y = H - padY - (pct / scaleMax) * (H - 2 * padY);
                    return (
                        <line
                            key={pct}
                            x1={0}
                            y1={y}
                            x2={W}
                            y2={y}
                            stroke="currentColor"
                            className="text-border"
                            strokeDasharray="4 4"
                            strokeWidth={0.5}
                        />
                    );
                })}
                {/* Area fill */}
                <polygon points={`${firstX},${H - padY} ${points} ${lastX},${H - padY}`} fill={color} opacity={0.1} />
                {/* Line */}
                <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
                {/* Current value dot */}
                {data.length > 0 && (() => {
                    const lastY = H - padY - ((current / scaleMax) * (H - 2 * padY));
                    return <circle cx={lastX} cy={lastY} r={2.5} fill={color} />;
                })()}
            </svg>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{new Date(data[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span>{new Date(data[data.length - 1].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
        </div>
    );
}

export function ServiceMetricsChart({ clusterName, serviceName }: ServiceMetricsChartProps) {
    const { data, isLoading } = useQuery({
        queryKey: ["serviceMetricsHistory", clusterName, serviceName],
        queryFn: () => ecsApi.getServiceMetricsHistory(clusterName, serviceName),
        refetchInterval: 60_000,
    });

    if (isLoading) {
        return (
            <div className="mt-4 flex items-center justify-center rounded-lg border border-border bg-card py-8 text-sm text-muted-foreground">
                Loading metrics…
            </div>
        );
    }

    if (!data?.length) {
        return (
            <div className="mt-4 flex items-center justify-center rounded-lg border border-border bg-card py-8 text-sm text-muted-foreground">
                No metrics data available.
            </div>
        );
    }

    return (
        <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Service Metrics (last hour)</h3>
            <div className="flex gap-3">
                <MiniChart data={data} dataKey="cpuUtilization" color="oklch(0.6 0.15 250)" label="CPU Usage" icon={Cpu} />
                <MiniChart data={data} dataKey="memoryUtilization" color="oklch(0.6 0.18 145)" label="Memory Usage" icon={MemoryStick} />
            </div>
        </div>
    );
}
