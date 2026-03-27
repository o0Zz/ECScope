import { useState } from "react";
import type { EcsTask } from "@/api/types";
import { FileCode, Copy, Check, KeyRound } from "lucide-react";

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            className="ml-1 inline-flex items-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Copy value"
        >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

export function EnvVarPanel({ task }: { task: EcsTask }) {
    const [filter, setFilter] = useState("");
    const lowerFilter = filter.toLowerCase();

    const totalEnvCount = task.containers.reduce((s, c) => s + c.environment.length + c.secrets.length, 0);
    if (totalEnvCount === 0) {
        return (
            <div className="px-4 py-3 text-xs text-muted-foreground">
                No environment variables found in the task definition.
            </div>
        );
    }

    return (
        <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Environment Variables</span>
                <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Filter…"
                    className="ml-2 h-6 w-48 rounded border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
            </div>
            {task.containers.map((container) => {
                const envRows: { name: string; value: string; source?: string; isSecret: boolean; resolved: boolean }[] = container.environment
                    .filter((e) => e.name.toLowerCase().includes(lowerFilter) || e.value.toLowerCase().includes(lowerFilter))
                    .map((e) => ({ name: e.name, value: e.value, isSecret: false, resolved: true }));
                const secretRows: typeof envRows = container.secrets
                    .filter((s) => {
                        const resolved = s.resolvedValue ?? s.valueFrom;
                        return s.name.toLowerCase().includes(lowerFilter) || resolved.toLowerCase().includes(lowerFilter);
                    })
                    .map((s) => ({ name: s.name, value: s.resolvedValue ?? "", source: s.valueFrom, isSecret: true, resolved: !!s.resolvedValue }));
                const allRows = [...envRows, ...secretRows].sort((a, b) => a.name.localeCompare(b.name));

                if (allRows.length === 0 && filter) return null;
                return (
                    <div key={container.containerArn} className="rounded border border-border bg-card">
                        <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                            {container.name}
                            <span className="ml-1.5 text-muted-foreground/60">
                                ({envRows.length} env{secretRows.length > 0 && `, ${secretRows.length} secrets`})
                            </span>
                        </div>
                        <div className="max-h-64 overflow-auto">
                            <table className="w-full text-xs">
                                <tbody>
                                    {allRows.map((row) => (
                                        <tr key={row.name} className="border-b border-border last:border-b-0 hover:bg-accent/30">
                                            <td className="w-1/3 px-3 py-1 font-mono font-medium text-foreground align-top">
                                                <span className="flex items-center gap-1">
                                                    {row.isSecret && <span title={`Source: ${row.source}`}><KeyRound className="h-3 w-3 text-warning shrink-0" /></span>}
                                                    {row.name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1 font-mono text-muted-foreground break-all">
                                                {row.isSecret ? (
                                                    row.resolved ? (
                                                        <span>{row.value}</span>
                                                    ) : (
                                                        <span className="text-warning/60 italic">{row.source}</span>
                                                    )
                                                ) : (
                                                    row.value
                                                )}
                                                <CopyButton text={row.isSecret && row.resolved ? row.value : row.isSecret ? (row.source ?? "") : row.value} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
