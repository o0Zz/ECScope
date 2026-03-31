import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface FileTransferDialogProps {
    open: boolean;
    title: string;
    label: string;
    placeholder?: string;
    error?: string | null;
    isPending?: boolean;
    /** 0–100, null while connecting before first byte */
    progress?: number | null;
    /** e.g. "1.4 MB/s", null while connecting */
    rate?: string | null;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

export function FileTransferDialog({
    open,
    title,
    label,
    placeholder,
    error,
    isPending = false,
    progress,
    rate,
    onConfirm,
    onCancel,
}: FileTransferDialogProps) {
    const [value, setValue] = useState("");

    useEffect(() => {
        if (open) setValue("");
    }, [open]);

    if (!open) return null;

    const hasProgress = isPending && progress != null;
    const isConnecting = isPending && progress == null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    <button
                        onClick={onCancel}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <label className="block text-sm text-muted-foreground mb-2">{label}</label>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    autoFocus
                    disabled={isPending}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && value.trim() && !isPending) onConfirm(value.trim());
                        if (e.key === "Escape") onCancel();
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                />

                {/* Progress section — shown while transfer is running */}
                {isPending && (
                    <div className="mt-3">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-muted-foreground">
                                {isConnecting
                                    ? "Connecting…"
                                    : `Transferring… ${progress}%`}
                            </span>
                            {rate && (
                                <span className="text-xs font-mono text-foreground">{rate}</span>
                            )}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            {hasProgress ? (
                                <div
                                    className="h-full rounded-full bg-primary transition-all duration-200"
                                    style={{ width: `${progress}%` }}
                                />
                            ) : (
                                /* Indeterminate pulse while connecting / before first byte */
                                <div className="h-full w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-primary/60" />
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <p className="mt-2 text-xs text-destructive">{error}</p>
                )}
                <div className="flex justify-end gap-2 mt-4">
                    <button
                        onClick={onCancel}
                        disabled={isPending}
                        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => value.trim() && !isPending && onConfirm(value.trim())}
                        disabled={isPending || !value.trim()}
                        className="rounded-md px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {isPending ? "Transferring…" : "OK"}
                    </button>
                </div>
            </div>
        </div>
    );
}
