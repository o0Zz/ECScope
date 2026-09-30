import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Pause, Play, ChevronsUp, WrapText, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { ecsApi } from "@/api";
import type { LogLine } from "@/api/types";
import { useConfigStore } from "@/store/config";
import { CopyButton } from "@/components/CopyButton";
import { cloudwatchLogsUrl, openAwsUrl } from "@/lib/aws-urls";
import { cn } from "@/lib/utils";

/** A single task's stream, or every stream under a prefix (all tasks of a service container) */
export type LogSource = { kind: "stream"; streamName: string } | { kind: "prefix"; prefix: string };

/** One selectable log source (typically one per container) */
export interface LogTarget {
    label: string;
    logGroup: string;
    source: LogSource;
}

const MAX_LINES = 20_000;
/** Only the tail of the (filtered) buffer is rendered to keep the DOM light */
const MAX_RENDERED = 5_000;
const POLL_MS = 3_000;
/** Re-query this far back when tailing multiple streams, to catch late-ingested events */
const PREFIX_OVERLAP_MS = 30_000;
const WINDOWS = [
    { label: "5m", ms: 5 * 60_000 },
    { label: "15m", ms: 15 * 60_000 },
    { label: "1h", ms: 60 * 60_000 },
    { label: "6h", ms: 6 * 60 * 60_000 },
    { label: "24h", ms: 24 * 60 * 60_000 },
];

function formatTs(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function levelClass(message: string): string | undefined {
    if (/\b(error|fatal|panic|exception|traceback)\b/i.test(message)) return "text-destructive";
    if (/\bwarn(ing)?\b/i.test(message)) return "text-warning";
    return undefined;
}

function appendCapped(prev: LogLine[], added: LogLine[]): LogLine[] {
    if (added.length === 0) return prev;
    const next = prev.concat(added);
    return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
}

function errorText(err: unknown, notFound: string): string {
    if (err instanceof Error && err.name === "ResourceNotFoundException") return notFound;
    return err instanceof Error ? err.message : String(err);
}

export function LogViewer({ title, targets, onClose }: { title: string; targets: LogTarget[]; onClose: () => void }) {
    const { t } = useTranslation();
    const [targetIdx, setTargetIdx] = useState(0);
    const { logGroup, source } = targets[targetIdx];
    const region = useConfigStore((s) => s.credentials?.region ?? s.activeCluster?.region ?? "us-east-1");
    const [lines, setLines] = useState<LogLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [follow, setFollow] = useState(true);
    const [wrap, setWrap] = useState(true);
    const [filter, setFilter] = useState("");
    const [windowMs, setWindowMs] = useState(WINDOWS[1].ms);
    const [truncated, setTruncated] = useState(false);
    const [olderToken, setOlderToken] = useState<string | undefined>();
    const [loadingOlder, setLoadingOlder] = useState(false);

    const forwardTokenRef = useRef<string | undefined>(undefined);
    const seenIdsRef = useRef(new Set<string>());
    const lastTsRef = useRef(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);
    const prependHeightRef = useRef<number | null>(null);

    const sourceKey = source.kind === "stream" ? `s:${source.streamName}` : `p:${source.prefix}`;
    const notFound = t("logs.streamNotFound");

    // Called by the handlers that change what is loaded (the effect below then fetches it)
    const resetView = () => {
        setLoading(true);
        setError(null);
        setLines([]);
        setTruncated(false);
        setOlderToken(undefined);
        stickToBottomRef.current = true;
    };

    // Initial load (and reload when the container or multi-stream time window changes)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (source.kind === "stream") {
                    const page = await ecsApi.getLogStreamEvents(logGroup, source.streamName);
                    if (cancelled) return;
                    forwardTokenRef.current = page.nextForwardToken;
                    setOlderToken(page.events.length > 0 ? page.nextBackwardToken : undefined);
                    setLines(page.events);
                } else {
                    const startTime = Date.now() - windowMs;
                    const res = await ecsApi.filterLogEvents(logGroup, source.prefix, startTime);
                    if (cancelled) return;
                    seenIdsRef.current = new Set(res.events.map((e) => e.id));
                    lastTsRef.current = res.events[res.events.length - 1]?.timestamp ?? startTime;
                    setTruncated(res.truncated);
                    setLines(res.events.slice(-MAX_LINES));
                }
            } catch (err) {
                if (!cancelled) setError(errorText(err, notFound));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceKey identifies `source`
    }, [logGroup, sourceKey, windowMs, notFound]);

    // Tail new events while following
    useEffect(() => {
        if (!follow || loading || error) return;
        let busy = false;
        const id = setInterval(async () => {
            if (busy) return;
            busy = true;
            try {
                if (source.kind === "stream") {
                    const page = await ecsApi.getLogStreamEvents(logGroup, source.streamName, forwardTokenRef.current);
                    forwardTokenRef.current = page.nextForwardToken;
                    setLines((prev) => appendCapped(prev, page.events));
                } else {
                    const res = await ecsApi.filterLogEvents(
                        logGroup,
                        source.prefix,
                        lastTsRef.current - PREFIX_OVERLAP_MS,
                    );
                    const fresh = res.events.filter((e) => !seenIdsRef.current.has(e.id));
                    for (const e of fresh) {
                        seenIdsRef.current.add(e.id);
                        lastTsRef.current = Math.max(lastTsRef.current, e.timestamp);
                    }
                    setLines((prev) => appendCapped(prev, fresh));
                }
            } catch {
                // Transient failure — next tick retries
            } finally {
                busy = false;
            }
        }, POLL_MS);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceKey identifies `source`
    }, [follow, loading, error, logGroup, sourceKey]);

    const loadOlder = async () => {
        if (source.kind !== "stream" || !olderToken) return;
        setLoadingOlder(true);
        try {
            const page = await ecsApi.getLogStreamEvents(logGroup, source.streamName, olderToken);
            // Same token back means we reached the start of the stream
            setOlderToken(
                page.events.length > 0 && page.nextBackwardToken !== olderToken ? page.nextBackwardToken : undefined,
            );
            if (page.events.length > 0) {
                prependHeightRef.current = scrollRef.current?.scrollHeight ?? null;
                setLines((prev) => page.events.concat(prev).slice(0, MAX_LINES));
            }
        } catch (err) {
            setError(errorText(err, notFound));
        } finally {
            setLoadingOlder(false);
        }
    };

    // Keep the view pinned to the bottom while tailing; keep position stable when prepending
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (prependHeightRef.current != null) {
            el.scrollTop += el.scrollHeight - prependHeightRef.current;
            prependHeightRef.current = null;
        } else if (stickToBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [lines, filter, wrap]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const needle = filter.trim().toLowerCase();
    const visible = needle ? lines.filter((l) => l.message.toLowerCase().includes(needle)) : lines;
    const rendered = visible.length > MAX_RENDERED ? visible.slice(-MAX_RENDERED) : visible;
    const consoleUrl = cloudwatchLogsUrl(region, logGroup, source.kind === "stream" ? source.streamName : undefined);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="flex h-[88vh] w-[88vw] flex-col rounded-lg border border-border bg-card shadow-xl">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            {logGroup}
                            {" › "}
                            {source.kind === "stream" ? source.streamName : `${source.prefix}*`}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            onClick={() => openAwsUrl(consoleUrl)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title={t("common.openConsole")}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs">
                    {targets.length > 1 && (
                        <select
                            value={targetIdx}
                            onChange={(e) => {
                                resetView();
                                setTargetIdx(Number(e.target.value));
                            }}
                            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none"
                        >
                            {targets.map((target, i) => (
                                <option key={i} value={i}>
                                    {target.label}
                                </option>
                            ))}
                        </select>
                    )}
                    <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder={t("logs.filterPlaceholder")}
                        className="w-64 rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {source.kind === "prefix" && (
                        <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">{t("logs.since")}</span>
                            {WINDOWS.map((w) => (
                                <button
                                    key={w.ms}
                                    onClick={() => {
                                        if (w.ms === windowMs) return;
                                        resetView();
                                        setWindowMs(w.ms);
                                    }}
                                    className={cn(
                                        "rounded px-1.5 py-0.5",
                                        windowMs === w.ms
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                >
                                    {w.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => setFollow(!follow)}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-1",
                            follow
                                ? "border-primary/50 text-primary"
                                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                        title={follow ? t("logs.pause") : t("logs.follow")}
                    >
                        {follow ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        {follow ? t("logs.following") : t("logs.paused")}
                    </button>
                    <button
                        onClick={() => setWrap(!wrap)}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1",
                            wrap ? "text-foreground" : "text-muted-foreground hover:bg-accent",
                        )}
                        title={t("logs.wrap")}
                    >
                        <WrapText className="h-3 w-3" />
                        {t("logs.wrap")}
                    </button>
                    <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                        {needle
                            ? t("logs.countFiltered", { shown: visible.length, total: lines.length })
                            : t("logs.count", { count: lines.length })}
                        <CopyButton
                            text={visible.map((l) => `${formatTs(l.timestamp)} ${l.message}`).join("\n")}
                            title={t("logs.copyVisible")}
                        />
                    </span>
                </div>

                {/* Body */}
                <div
                    ref={scrollRef}
                    onScroll={(e) => {
                        const el = e.currentTarget;
                        stickToBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
                    }}
                    className="flex-1 overflow-auto bg-background px-4 py-2 font-mono text-xs leading-5"
                >
                    {loading && (
                        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("logs.loading")}
                        </div>
                    )}
                    {!loading && error && (
                        <div className="flex h-full items-center justify-center gap-2 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}
                    {!loading && !error && (
                        <>
                            {olderToken && (
                                <button
                                    onClick={loadOlder}
                                    disabled={loadingOlder}
                                    className="mb-2 inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 font-sans text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                                >
                                    <ChevronsUp className="h-3 w-3" />
                                    {loadingOlder ? t("common.loading") : t("logs.loadOlder")}
                                </button>
                            )}
                            {truncated && <div className="mb-2 font-sans text-warning">{t("logs.truncated")}</div>}
                            {visible.length > MAX_RENDERED && (
                                <div className="mb-2 font-sans text-muted-foreground">
                                    {t("logs.renderCapped", { count: MAX_RENDERED })}
                                </div>
                            )}
                            {lines.length === 0 && (
                                <div className="py-6 text-center font-sans text-muted-foreground">
                                    {t("logs.noEvents")}
                                </div>
                            )}
                            {rendered.map((l) => (
                                <div key={l.id} className="flex gap-3 hover:bg-accent/40">
                                    <span className="shrink-0 select-none text-muted-foreground">
                                        {formatTs(l.timestamp)}
                                    </span>
                                    {l.stream && (
                                        <span className="w-20 shrink-0 truncate text-primary/70" title={l.stream}>
                                            {l.stream.split("/").pop()?.slice(0, 8)}
                                        </span>
                                    )}
                                    <span
                                        className={cn(
                                            "min-w-0",
                                            wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre",
                                            levelClass(l.message) ?? "text-foreground",
                                        )}
                                    >
                                        {l.message}
                                    </span>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
