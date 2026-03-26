import { useQuery } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { useConfigStore } from "@/store/config";
import type { NlbMetricsDataPoint } from "@/api/types";
import { Activity, ArrowRightLeft, HardDrive, AlertTriangle } from "lucide-react";

interface NlbMetricsChartProps {
    nlbArn: string;
    nlbName: string;
}

const Y_TICKS_COUNT = 5;

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
}

function formatBytes(n: number): string {
    if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
    if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
    if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
    return `${n} B`;
}

function MiniLineChart({
    data,
    getValue,
    color,
    label,
    icon: Icon,
    formatValue,
    fillArea = true,
}: {
    data: NlbMetricsDataPoint[];
    getValue: (d: NlbMetricsDataPoint) => number;
    color: string;
    label: string;
    icon: typeof Activity;
    formatValue: (v: number) => string;
    fillArea?: boolean;
}) {
    if (data.length === 0) return null;

    const values = data.map(getValue);
    const max = Math.max(...values, 1);
    const current = values[values.length - 1];
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;

    const W = 460;
    const H = 100;
    const mL = 40;
    const mR = 4;
    const mT = 4;
    const mB = 18;
    const cW = W - mL - mR;
    const cH = H - mT - mB;

    const scaleMax = max === 0 ? 1 : Math.ceil(max * 1.15);

    const toX = (i: number) => mL + (i / (data.length - 1)) * cW;
    const toY = (v: number) => mT + cH - (v / scaleMax) * cH;

    const points = data.map((d, i) => `${toX(i)},${toY(getValue(d))}`).join(" ");

    const yTicks = Array.from({ length: Y_TICKS_COUNT }, (_, i) => Math.round((scaleMax / (Y_TICKS_COUNT - 1)) * i));

    const firstTs = data[0].timestamp;
    const lastTs = data[data.length - 1].timestamp;
    const totalMs = lastTs - firstTs;
    const xTicks: { x: number; label: string }[] = [];
    const firstHour = new Date(firstTs);
    firstHour.setMinutes(0, 0, 0);
    if (firstHour.getTime() < firstTs) firstHour.setHours(firstHour.getHours() + 1);
    const stepHours = totalMs > 12 * 3600_000 ? 3 : 1;
    for (let t = firstHour.getTime(); t <= lastTs; t += stepHours * 3600_000) {
        const ratio = (t - firstTs) / totalMs;
        if (ratio < 0 || ratio > 1) continue;
        xTicks.push({
            x: mL + ratio * cW,
            label: new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
    }

    return (
        <div className="flex-1 min-w-[200px] rounded-lg border border-border bg-card p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3" style={{ color }} />
                    <span className="text-[11px] font-medium text-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>Now: <span className="font-mono font-medium" style={{ color }}>{formatValue(current)}</span></span>
                    <span>Avg: <span className="font-mono">{formatValue(avg)}</span></span>
                    <span>Total: <span className="font-mono">{formatValue(total)}</span></span>
                </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="h-60 w-full">
                {yTicks.map((v) => {
                    const y = toY(v);
                    return (
                        <g key={v}>
                            <text x={mL - 3} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={7}>
                                {formatValue(v)}
                            </text>
                            <line x1={mL} y1={y} x2={W - mR} y2={y} stroke="currentColor" className="text-border" strokeDasharray={v === 0 ? "none" : "4 4"} strokeWidth={0.4} />
                        </g>
                    );
                })}
                {xTicks.map((tick, i) => (
                    <g key={i}>
                        <line x1={tick.x} y1={mT} x2={tick.x} y2={mT + cH} stroke="currentColor" className="text-border" strokeDasharray="4 4" strokeWidth={0.3} />
                        <text x={tick.x} y={H - 2} textAnchor="middle" className="fill-muted-foreground" fontSize={6}>{tick.label}</text>
                    </g>
                ))}
                {fillArea && (
                    <polygon
                        points={`${toX(0)},${toY(0)} ${points} ${toX(data.length - 1)},${toY(0)}`}
                        fill={color}
                        opacity={0.08}
                    />
                )}
                <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
                <circle cx={toX(data.length - 1)} cy={toY(current)} r={2} fill={color} />
            </svg>
        </div>
    );
}

export function NlbMetricsChart({ nlbArn, nlbName }: NlbMetricsChartProps) {
    const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
    const { data, isLoading } = useQuery({
        queryKey: ["nlbMetricsHistory", nlbArn],
        queryFn: () => ecsApi.getNlbMetricsHistory(nlbArn),
        refetchInterval: refreshIntervalMs,
    });

    if (isLoading) {
        return (
            <div className="mt-2 flex items-center justify-center rounded border border-border bg-card py-4 text-xs text-muted-foreground">
                Loading NLB metrics…
            </div>
        );
    }

    if (!data?.length) {
        return (
            <div className="mt-2 flex items-center justify-center rounded border border-border bg-card py-4 text-xs text-muted-foreground">
                No metrics data available for {nlbName}.
            </div>
        );
    }

    const hasResets = data.some((d) => d.tcpClientResetCount > 0 || d.tcpTargetResetCount > 0);

    return (
        <div className="mt-2">
            <div className="grid grid-cols-2 gap-2">
                <MiniLineChart
                    data={data}
                    getValue={(d) => d.activeFlowCount}
                    color="oklch(0.6 0.15 250)"
                    label="Active Flows"
                    icon={Activity}
                    formatValue={formatNumber}
                />
                <MiniLineChart
                    data={data}
                    getValue={(d) => d.newFlowCount}
                    color="oklch(0.7 0.15 160)"
                    label="New Flows"
                    icon={ArrowRightLeft}
                    formatValue={formatNumber}
                />
                <MiniLineChart
                    data={data}
                    getValue={(d) => d.processedBytes}
                    color="oklch(0.7 0.15 85)"
                    label="Processed Bytes"
                    icon={HardDrive}
                    formatValue={formatBytes}
                />
                {hasResets && (
                    <MiniLineChart
                        data={data}
                        getValue={(d) => d.tcpClientResetCount + d.tcpTargetResetCount}
                        color="oklch(0.55 0.2 25)"
                        label="TCP Resets"
                        icon={AlertTriangle}
                        formatValue={formatNumber}
                    />
                )}
            </div>
        </div>
    );
}
