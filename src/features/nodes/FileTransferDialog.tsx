import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface FileTransferDialogProps {
    open: boolean;
    title: string;
    label: string;
    placeholder?: string;
    error?: string | null;
    isPending?: boolean;
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
    onConfirm,
    onCancel,
}: FileTransferDialogProps) {
    const [value, setValue] = useState("");

    useEffect(() => {
        if (open) setValue("");
    }, [open]);

    if (!open) return null;

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
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && value.trim()) onConfirm(value.trim());
                        if (e.key === "Escape") onCancel();
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {error && (
                    <p className="mt-2 text-xs text-destructive">{error}</p>
                )}
                <div className="flex justify-end gap-2 mt-4">
                    <button
                        onClick={onCancel}
                        disabled={isPending}
                        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => value.trim() && onConfirm(value.trim())}
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
