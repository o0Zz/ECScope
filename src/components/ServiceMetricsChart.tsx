import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useConfigStore } from "@/store/config";
import type { MetricsDataPoint } from "@/api/types";
import { Cpu, MemoryStick } from "lucide-react";

interface ServiceMetricsChartProps {
    clusterName: string;
    serviceName: string;
}

const Y_TICKS = [0, 25, 50, 75, 100];

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

    // Chart dimensions — leave left margin for Y-axis labels
    const W = 460;
    const H = 120;
    const marginLeft = 32;
    const marginRight = 4;
    const marginTop = 4;
    const marginBottom = 18;
    const chartW = W - marginLeft - marginRight;
    const chartH = H - marginTop - marginBottom;

    const scaleMax = 100;

    const toX = (i: number) => marginLeft + (i / (data.length - 1)) * chartW;
    const toY = (v: number) => marginTop + chartH - (v / scaleMax) * chartH;

    const points = data.map((d, i) => `${toX(i)},${toY(d[dataKey])}`).join(" ");

    // X-axis ticks: generate hourly labels
    const firstTs = data[0].timestamp;
    const lastTs = data[data.length - 1].timestamp;
    const totalMs = lastTs - firstTs;
    const xTicks: { x: number; label: string }[] = [];
    // Start from the first whole hour after firstTs
    const firstHour = new Date(firstTs);
    firstHour.setMinutes(0, 0, 0);
    if (firstHour.getTime() < firstTs) firstHour.setHours(firstHour.getHours() + 1);
    // Step: pick 3h intervals for 24h range, 1h for shorter
    const stepHours = totalMs > 12 * 3600_000 ? 3 : 1;
    for (let t = firstHour.getTime(); t <= lastTs; t += stepHours * 3600_000) {
        const ratio = (t - firstTs) / totalMs;
        if (ratio < 0 || ratio > 1) continue;
        xTicks.push({
            x: marginLeft + ratio * chartW,
            label: new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
    }

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
            <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full">
                {/* Y-axis labels + grid lines */}
                {Y_TICKS.map((pct) => {
                    const y = toY(pct);
                    return (
                        <g key={pct}>
                            <text
                                x={marginLeft - 4}
                                y={y}
                                textAnchor="end"
                                dominantBaseline="middle"
                                className="fill-muted-foreground"
                                fontSize={8}
                            >
                                {pct}%
                            </text>
                            <line
                                x1={marginLeft}
                                y1={y}
                                x2={W - marginRight}
                                y2={y}
                                stroke="currentColor"
                                className="text-border"
                                strokeDasharray={pct === 0 ? "none" : "4 4"}
                                strokeWidth={0.5}
                            />
                        </g>
                    );
                })}
                {/* X-axis tick lines + labels */}
                {xTicks.map((tick, i) => (
                    <g key={i}>
                        <line
                            x1={tick.x}
                            y1={marginTop}
                            x2={tick.x}
                            y2={marginTop + chartH}
                            stroke="currentColor"
                            className="text-border"
                            strokeDasharray="4 4"
                            strokeWidth={0.3}
                        />
                        <text
                            x={tick.x}
                            y={H - 2}
                            textAnchor="middle"
                            className="fill-muted-foreground"
                            fontSize={7}
                        >
                            {tick.label}
                        </text>
                    </g>
                ))}
                {/* Area fill */}
                <polygon
                    points={`${toX(0)},${toY(0)} ${points} ${toX(data.length - 1)},${toY(0)}`}
                    fill={color}
                    opacity={0.1}
                />
                {/* Line */}
                <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
                {/* Current value dot */}
                <circle cx={toX(data.length - 1)} cy={toY(current)} r={2.5} fill={color} />
            </svg>
        </div>
    );
}

export function ServiceMetricsChart({ clusterName, serviceName }: ServiceMetricsChartProps) {
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const { data, isLoading } = useQuery({
        queryKey: ["serviceMetricsHistory", clusterName, serviceName],
        queryFn: () => ecsApi.getServiceMetricsHistory(clusterName, serviceName),
        refetchInterval: refreshIntervalMs,
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
            <h3 className="mb-2 text-sm font-semibold text-foreground">Service Metrics (last 24h)</h3>
            <div className="flex gap-3">
                <MiniChart data={data} dataKey="cpuUtilization" color="oklch(0.6 0.15 250)" label="CPU Usage" icon={Cpu} />
                <MiniChart data={data} dataKey="memoryUtilization" color="oklch(0.6 0.18 145)" label="Memory Usage" icon={MemoryStick} />
            </div>
        </div>
    );
}
