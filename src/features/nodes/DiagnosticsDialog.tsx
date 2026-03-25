import { useState, useCallback } from "react";
import { diagnosticsApi } from "@/api";
import type { DiagnosticResult } from "@/api/types";
import { useConfigStore } from "@/store/config";
import { Activity, Cpu, X, Loader2, Download, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosticsDialogProps {
    instanceId: string;
    onClose: () => void;
}

type Tab = "tcpdump" | "coredump";

export function DiagnosticsDialog({ instanceId, onClose }: DiagnosticsDialogProps) {
    const { activeCluster } = useConfigStore();
    const storage = useConfigStore((s) => s.storage);
    const s3Bucket = storage?.s3Bucket ?? "";
    const s3Region = storage?.s3Region ?? activeCluster?.region ?? "us-east-1";

    const hasS3Creds = !!(storage?.s3AccessKeyId && storage?.s3SecretAccessKey);

    const [activeTab, setActiveTab] = useState<Tab>("tcpdump");

    // Tcpdump form state
    const [duration, setDuration] = useState(30);
    const [iface, setIface] = useState("any");
    const [filter, setFilter] = useState("");

    // Coredump form state
    const [pid, setPid] = useState("");

    // Shared run state
    const [status, setStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
    const [progress, setProgress] = useState<DiagnosticResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleProgress = useCallback((result: DiagnosticResult) => {
        setProgress(result);
    }, []);

    const runTcpdump = useCallback(async () => {
        if (!hasS3Creds) { setError("S3 credentials not configured in storage config"); return; }
        setStatus("running");
        setError(null);
        setProgress(null);
        try {
            await diagnosticsApi.runTcpdumpAndDownload(
                {
                    instanceId,
                    s3Bucket,
                    credentials: {
                        accessKeyId: storage!.s3AccessKeyId,
                        secretAccessKey: storage!.s3SecretAccessKey,
                        region: s3Region,
                    },
                    duration,
                    iface,
                    filter: filter || undefined,
                },
                handleProgress,
            );
            setStatus("completed");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStatus("failed");
        }
    }, [instanceId, s3Bucket, s3Region, hasS3Creds, storage, duration, iface, filter, handleProgress]);

    const runCoredump = useCallback(async () => {
        const pidNum = parseInt(pid, 10);
        if (!pidNum || pidNum <= 0) {
            setError("Please enter a valid PID");
            return;
        }
        if (!hasS3Creds) { setError("S3 credentials not configured in storage config"); return; }
        setStatus("running");
        setError(null);
        setProgress(null);
        try {
            await diagnosticsApi.runCoredumpAndDownload(
                {
                    instanceId,
                    s3Bucket,
                    credentials: {
                        accessKeyId: storage!.s3AccessKeyId,
                        secretAccessKey: storage!.s3SecretAccessKey,
                        region: s3Region,
                    },
                    pid: pidNum,
                },
                handleProgress,
            );
            setStatus("completed");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStatus("failed");
        }
    }, [instanceId, s3Bucket, s3Region, hasS3Creds, storage, pid, handleProgress]);

    const isRunning = status === "running";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-foreground">
                        Diagnostics — <span className="font-mono text-info">{instanceId}</span>
                    </h3>
                    <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => { setActiveTab("tcpdump"); setError(null); }}
                        className={cn(
                            "flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors",
                            activeTab === "tcpdump"
                                ? "border-b-2 border-info text-info"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                        disabled={isRunning}
                    >
                        <Activity className="h-3.5 w-3.5" />
                        Network Capture
                    </button>
                    <button
                        onClick={() => { setActiveTab("coredump"); setError(null); }}
                        className={cn(
                            "flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors",
                            activeTab === "coredump"
                                ? "border-b-2 border-info text-info"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                        disabled={isRunning}
                    >
                        <Cpu className="h-3.5 w-3.5" />
                        Core Dump
                    </button>
                </div>

                {/* Body */}
                <div className="p-4">
                    {activeTab === "tcpdump" && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-xs text-muted-foreground">Duration (seconds)</span>
                                    <input
                                        type="number"
                                        min={5}
                                        max={300}
                                        value={duration}
                                        onChange={(e) => setDuration(Number(e.target.value))}
                                        disabled={isRunning}
                                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-info focus:outline-none"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground">Interface</span>
                                    <input
                                        type="text"
                                        value={iface}
                                        onChange={(e) => setIface(e.target.value)}
                                        disabled={isRunning}
                                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-info focus:outline-none"
                                    />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs text-muted-foreground">BPF Filter (optional)</span>
                                <input
                                    type="text"
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    placeholder="e.g. port 80 or host 10.0.0.1"
                                    disabled={isRunning}
                                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-info focus:outline-none"
                                />
                            </label>
                            <p className="text-xs text-muted-foreground">
                                Runs <code className="rounded bg-muted px-1">tcpdump</code> on the EC2 instance for {duration}s, uploads the .pcap to S3, then downloads it locally.
                            </p>
                        </div>
                    )}

                    {activeTab === "coredump" && (
                        <div className="space-y-3">
                            <label className="block">
                                <span className="text-xs text-muted-foreground">Process ID (PID)</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={pid}
                                    onChange={(e) => setPid(e.target.value)}
                                    placeholder="e.g. 12345"
                                    disabled={isRunning}
                                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-info focus:outline-none"
                                />
                            </label>
                            <p className="text-xs text-muted-foreground">
                                Runs <code className="rounded bg-muted px-1">gcore</code> on the specified PID, uploads the core file to S3, then downloads it locally.
                            </p>
                        </div>
                    )}

                    {/* Progress / Status */}
                    {isRunning && (
                        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-info" />
                            {progress?.status === "running"
                                ? "Command running on instance… waiting for completion"
                                : "Starting diagnostic command…"}
                        </div>
                    )}

                    {status === "completed" && (
                        <div className="mt-4 flex items-center gap-2 rounded-md border border-green-800 bg-green-900/20 px-3 py-2 text-xs text-green-400">
                            <Download className="h-3.5 w-3.5" />
                            File downloaded successfully.
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="break-all">{error}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                    <button
                        onClick={onClose}
                        disabled={isRunning}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                    >
                        Close
                    </button>
                    {activeTab === "tcpdump" ? (
                        <button
                            onClick={runTcpdump}
                            disabled={isRunning || !s3Bucket}
                            className="rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white hover:bg-info/90 disabled:opacity-50"
                        >
                            {isRunning ? "Capturing…" : "Start Capture"}
                        </button>
                    ) : (
                        <button
                            onClick={runCoredump}
                            disabled={isRunning || !s3Bucket || !pid}
                            className="rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white hover:bg-info/90 disabled:opacity-50"
                        >
                            {isRunning ? "Dumping…" : "Generate Core Dump"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
