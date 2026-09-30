import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { ecsApi } from "@/api";
import { canonicalize, diffLines, type DiffLine } from "@/lib/diff";
import { cn } from "@/lib/utils";

/** Unchanged lines kept around each change when collapsed */
const CONTEXT = 3;

/** "arn:…:task-definition/app:12" or "app:12" → { family: "app", revision: 12 } */
function parseTaskDef(taskDef: string): { family: string; revision: number } {
    const name = taskDef.split("/").pop() ?? taskDef;
    const idx = name.lastIndexOf(":");
    return { family: name.slice(0, idx), revision: Number(name.slice(idx + 1)) };
}

type Row = { kind: "line"; line: DiffLine } | { kind: "gap"; count: number };

function collapse(lines: DiffLine[]): Row[] {
    const keep = lines.map(() => false);
    lines.forEach((l, i) => {
        if (l.type === "same") return;
        for (let k = Math.max(0, i - CONTEXT); k <= Math.min(lines.length - 1, i + CONTEXT); k++) keep[k] = true;
    });
    const rows: Row[] = [];
    let gap = 0;
    lines.forEach((line, i) => {
        if (keep[i]) {
            if (gap) rows.push({ kind: "gap", count: gap });
            gap = 0;
            rows.push({ kind: "line", line });
        } else gap++;
    });
    if (gap) rows.push({ kind: "gap", count: gap });
    return rows;
}

function useTaskDefLines(taskDef: string) {
    return useQuery({
        queryKey: ["taskDefinitionJson", taskDef],
        queryFn: () => ecsApi.getTaskDefinitionJson(taskDef),
        enabled: !!taskDef,
        select: (json) => JSON.stringify(canonicalize(json), null, 2).split("\n"),
        staleTime: Infinity, // revisions are immutable
    });
}

/**
 * Side-by-side selection of two revisions of the same family, rendered as a unified diff.
 * Defaults: `target` on the right, `base` (or the revision just before `target`) on the left.
 */
export function TaskDefinitionDiff({ target, base, onClose }: { target: string; base?: string; onClose: () => void }) {
    const { t } = useTranslation();
    const { family, revision } = parseTaskDef(target);
    const [right, setRight] = useState(`${family}:${revision}`);
    const [left, setLeft] = useState(base ? (base.split("/").pop() ?? base) : "");
    const [showAll, setShowAll] = useState(false);

    const { data: revisions } = useQuery({
        queryKey: ["taskDefRevisions", family],
        queryFn: () => ecsApi.listTaskDefinitionRevisions(family),
    });

    // Default base: the newest revision older than the target
    useEffect(() => {
        if (left || !revisions) return;
        const previous = revisions.find((r) => parseTaskDef(r).revision < revision);
        if (previous) setLeft(previous);
    }, [revisions, left, revision]);

    // Selected revisions may be deregistered (not in the ACTIVE list) — keep them selectable
    const options = useMemo(() => {
        const all = new Set([...(revisions ?? []), right, left].filter(Boolean));
        return [...all].sort((a, b) => parseTaskDef(b).revision - parseTaskDef(a).revision);
    }, [revisions, right, left]);

    const leftQuery = useTaskDefLines(left);
    const rightQuery = useTaskDefLines(right);

    const diff = useMemo(
        () => (leftQuery.data && rightQuery.data ? diffLines(leftQuery.data, rightQuery.data) : null),
        [leftQuery.data, rightQuery.data],
    );
    const rows = useMemo(
        () => (diff ? (showAll ? diff.map((line): Row => ({ kind: "line", line })) : collapse(diff)) : []),
        [diff, showAll],
    );
    const added = diff?.filter((l) => l.type === "add").length ?? 0;
    const removed = diff?.filter((l) => l.type === "del").length ?? 0;
    const loading = leftQuery.isLoading || rightQuery.isLoading || (!left && !revisions);
    const error = leftQuery.error ?? rightQuery.error;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const select = (value: string, onChange: (v: string) => void) => (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground focus:outline-none"
        >
            {!value && <option value="">—</option>}
            {options.map((o) => (
                <option key={o} value={o}>
                    {o}
                </option>
            ))}
        </select>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="flex h-[88vh] w-[80vw] max-w-6xl flex-col rounded-lg border border-border bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-foreground">{t("taskDefDiff.title")}</h3>
                    <button
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs">
                    {select(left, setLeft)}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    {select(right, setRight)}
                    {diff && (
                        <span className="ml-2 font-mono">
                            <span className="text-success">+{added}</span>{" "}
                            <span className="text-destructive">−{removed}</span>
                        </span>
                    )}
                    <label className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                        {t("taskDefDiff.showAll")}
                    </label>
                </div>

                <div className="flex-1 overflow-auto bg-background py-2 font-mono text-xs leading-5">
                    {loading && (
                        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("taskDefDiff.loading")}
                        </div>
                    )}
                    {!loading && error && (
                        <div className="flex h-full items-center justify-center gap-2 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {(error as Error).message}
                        </div>
                    )}
                    {!loading && !error && !left && (
                        <div className="py-6 text-center font-sans text-muted-foreground">
                            {t("taskDefDiff.noPrevious")}
                        </div>
                    )}
                    {diff && added + removed === 0 && (
                        <div className="py-6 text-center font-sans text-muted-foreground">
                            {t("taskDefDiff.identical")}
                        </div>
                    )}
                    {diff &&
                        added + removed > 0 &&
                        rows.map((row, i) =>
                            row.kind === "gap" ? (
                                <button
                                    key={i}
                                    onClick={() => setShowAll(true)}
                                    className="block w-full bg-muted/40 px-4 py-0.5 text-left font-sans text-muted-foreground hover:bg-muted"
                                >
                                    {t("taskDefDiff.unchanged", { count: row.count })}
                                </button>
                            ) : (
                                <div
                                    key={i}
                                    className={cn(
                                        "whitespace-pre px-4",
                                        row.line.type === "add" && "bg-success/15 text-success",
                                        row.line.type === "del" && "bg-destructive/15 text-destructive",
                                        row.line.type === "same" && "text-muted-foreground",
                                    )}
                                >
                                    <span className="mr-2 select-none opacity-60">
                                        {row.line.type === "add" ? "+" : row.line.type === "del" ? "−" : " "}
                                    </span>
                                    {row.line.text}
                                </div>
                            ),
                        )}
                </div>
            </div>
        </div>
    );
}
