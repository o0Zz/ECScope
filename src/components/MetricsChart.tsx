import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
}

export function formatBytes(n: number): string {
    if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
    if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
    if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
    return `${n} B`;
}

export function formatPercent(v: number): string {
    return `${v.toFixed(1)}%`;
}

export function formatMs(v: number): string {
    return `${v.toFixed(0)}ms`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricsChartProps<T extends { timestamp: number }> {
    /** Time-series data – must be sorted by `timestamp` ascending. */
    data: T[];
    /** Extracts the numeric value to chart from each data point. */
    getValue: (d: T) => number;
    /** Line / dot / area color (any CSS color). */
    color: string;
    /** Label shown in the header. */
    label: string;
    /** Icon shown next to the label. */
    icon: LucideIcon;
    /** Formats a numeric value for Y-axis ticks and the summary line. */
    formatValue: (v: number) => string;

    // --- optional customization ---

    /** Whether to render a filled area beneath the line (default `true`). */
    fillArea?: boolean;
    /**
     * Y-axis scaling strategy.
     * - `"auto"` (default): auto-scales to 115 % of the data max.
     * - `{ min, max }`: fixed range (good for percentages 0-100 %).
     */
    yScale?: "auto" | { min: number; max: number };
    /** Explicit Y-axis tick values. When omitted, `yTickCount` evenly-spaced
     *  ticks are generated from the scale range. */
    yTicks?: number[];
    /** Number of auto-generated Y ticks (default `5`). Ignored when `yTicks` is provided. */
    yTickCount?: number;
    /** Format specifically for Y-axis tick labels. Falls back to `formatValue`. */
    formatYTick?: (v: number) => string;
    /**
     * Which summary stats to show in the header.
     * - `"now-avg-total"` (default): Now, Avg, Total
     * - `"current-avg-minmax"`: Current, Avg, Min, Max
     */
    summaryMode?: "now-avg-total" | "current-avg-minmax";
    /** Tailwind height class for the `<svg>` element (default `"h-60"`). */
    chartHeight?: string;
    /** SVG viewBox width (default `460`). */
    width?: number;
    /** SVG viewBox height (default `100`). */
    height?: number;
    /** Margins inside the SVG `{ left, right, top, bottom }`. */
    margins?: Partial<{ left: number; right: number; top: number; bottom: number }>;
    /** Additional tailwind classes on the outer wrapper. */
    className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MetricsChart<T extends { timestamp: number }>({
    data,
    getValue,
    color,
    label,
    icon: Icon,
    formatValue,
    fillArea = true,
    yScale = "auto",
    yTicks: explicitYTicks,
    yTickCount = 5,
    formatYTick,
    summaryMode = "now-avg-total",
    chartHeight = "h-60",
    width: W = 460,
    height: H = 100,
    margins,
    className,
}: MetricsChartProps<T>) {
    if (data.length === 0) return null;

    const mL = margins?.left ?? 40;
    const mR = margins?.right ?? 4;
    const mT = margins?.top ?? 4;
    const mB = margins?.bottom ?? 18;
    const cW = W - mL - mR;
    const cH = H - mT - mB;

    const values = data.map(getValue);
    const max = Math.max(...values, 1);
    const min = Math.min(...values);
    const current = values[values.length - 1];
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;

    // Y-scale
    let scaleMin = 0;
    let scaleMax: number;
    if (yScale === "auto") {
        scaleMax = max === 0 ? 1 : Math.ceil(max * 1.15);
    } else {
        scaleMin = yScale.min;
        scaleMax = yScale.max;
    }
    const scaleRange = scaleMax - scaleMin || 1;

    const toX = (i: number) => mL + (i / Math.max(data.length - 1, 1)) * cW;
    const toY = (v: number) => mT + cH - ((v - scaleMin) / scaleRange) * cH;

    const points = data.map((d, i) => `${toX(i)},${toY(getValue(d))}`).join(" ");

    // Y ticks
    const yTickValues =
        explicitYTicks ??
        Array.from({ length: yTickCount }, (_, i) =>
            Math.round(scaleMin + (scaleRange / (yTickCount - 1)) * i),
        );

    const fmtYTick = formatYTick ?? formatValue;

    // X-axis ticks (auto hourly / 3-hourly)
    const firstTs = data[0].timestamp;
    const lastTs = data[data.length - 1].timestamp;
    const totalMs = lastTs - firstTs;
    const xTicks: { x: number; label: string }[] = [];
    if (totalMs > 0) {
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
    }

    return (
        <div className={cn("flex-1 min-w-[200px] rounded-lg border border-border bg-card p-2.5", className)}>
            {/* Header */}
            <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3" style={{ color }} />
                    <span className="text-[11px] font-medium text-foreground">{label}</span>
                </div>

                {summaryMode === "now-avg-total" ? (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>Now: <span className="font-mono font-medium" style={{ color }}>{formatValue(current)}</span></span>
                        <span>Avg: <span className="font-mono">{formatValue(avg)}</span></span>
                        <span>Total: <span className="font-mono">{formatValue(total)}</span></span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>Current: <span className="font-mono font-medium" style={{ color }}>{formatValue(current)}</span></span>
                        <span>Avg: <span className="font-mono font-medium">{formatValue(avg)}</span></span>
                        <span>Min: <span className="font-mono">{formatValue(min)}</span></span>
                        <span>Max: <span className="font-mono">{formatValue(max)}</span></span>
                    </div>
                )}
            </div>

            {/* SVG Chart */}
            <svg viewBox={`0 0 ${W} ${H}`} className={cn("w-full", chartHeight)}>
                {/* Y-axis grid + labels */}
                {yTickValues.map((v) => {
                    const y = toY(v);
                    return (
                        <g key={v}>
                            <text x={mL - 3} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={7}>
                                {fmtYTick(v)}
                            </text>
                            <line
                                x1={mL} y1={y} x2={W - mR} y2={y}
                                stroke="currentColor" className="text-border"
                                strokeDasharray={v === scaleMin ? "none" : "4 4"} strokeWidth={0.4}
                            />
                        </g>
                    );
                })}
                {/* X-axis grid + labels */}
                {xTicks.map((tick, i) => (
                    <g key={i}>
                        <line x1={tick.x} y1={mT} x2={tick.x} y2={mT + cH} stroke="currentColor" className="text-border" strokeDasharray="4 4" strokeWidth={0.3} />
                        <text x={tick.x} y={H - 2} textAnchor="middle" className="fill-muted-foreground" fontSize={6}>{tick.label}</text>
                    </g>
                ))}
                {/* Area fill */}
                {fillArea && (
                    <polygon
                        points={`${toX(0)},${toY(scaleMin)} ${points} ${toX(data.length - 1)},${toY(scaleMin)}`}
                        fill={color}
                        opacity={0.08}
                    />
                )}
                {/* Line */}
                <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
                {/* Current value dot */}
                <circle cx={toX(data.length - 1)} cy={toY(current)} r={2} fill={color} />
            </svg>
        </div>
    );
}
