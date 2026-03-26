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

export function formatAge(input: string | number | undefined): string {
    if (input == null) return "—";
    const ts = typeof input === "string" ? new Date(input).getTime() : input;
    const diffMs = Date.now() - ts;
    if (diffMs < 0) return "—";
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(diffMs / 86_400_000);
    return `${days}d`;
}
