import { useState, useEffect } from "react";
import { X, Save, KeyRound, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditSecretInfo {
    name: string;
    valueFrom: string;
    currentValue: string;
    resolved: boolean;
}

export function EditSecretDialog({
    open,
    secret,
    isPending,
    error,
    onSave,
    onCancel,
}: {
    open: boolean;
    secret: EditSecretInfo | null;
    isPending: boolean;
    error: string | null;
    onSave: (newValue: string) => void;
    onCancel: () => void;
}) {
    const [newValue, setNewValue] = useState("");

    useEffect(() => {
        if (open && secret) {
            setNewValue(secret.currentValue);
        }
    }, [open, secret]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onCancel]);

    if (!open || !secret) return null;

    const isSecretsManager = secret.valueFrom.startsWith("arn:aws:secretsmanager:");
    const storeLabel = isSecretsManager ? "Secrets Manager" : "SSM Parameter Store";
    const hasChanged = newValue !== secret.currentValue;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-warning" />
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Edit Secret</h3>
                            <p className="text-[11px] text-muted-foreground">{storeLabel}</p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="space-y-3 px-4 py-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Variable Name</label>
                        <div className="rounded border border-border bg-muted/30 px-3 py-1.5 font-mono text-xs text-foreground">
                            {secret.name}
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Source</label>
                        <div className="rounded border border-border bg-muted/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground break-all">
                            {secret.valueFrom}
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">New Value</label>
                        <textarea
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            rows={4}
                            spellCheck={false}
                            className={cn(
                                "w-full resize-none rounded border border-border bg-background px-3 py-2 font-mono text-xs text-foreground",
                                "focus:outline-none focus:ring-1 focus:ring-ring",
                                "placeholder:text-muted-foreground",
                            )}
                            placeholder="Enter new secret value…"
                        />
                    </div>

                    {!secret.resolved && (
                        <div className="flex items-center gap-1.5 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-warning">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            Could not resolve current value. The field is empty — enter the full new value.
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-1.5 text-xs text-destructive">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">Tasks must be redeployed to pick up changes.</p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onCancel}
                            disabled={isPending}
                            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSave(newValue)}
                            disabled={isPending || !hasChanged}
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            <Save className="h-3 w-3" />
                            {isPending ? "Saving…" : "Update Secret"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
