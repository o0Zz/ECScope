import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

export interface ScalingLimitsField {
    key: string;
    label: string;
    value: number;
    min?: number;
    max?: number;
}

interface ScalingLimitsDialogProps {
    open: boolean;
    title: string;
    subtitle?: string;
    fields: ScalingLimitsField[];
    isPending: boolean;
    onConfirm: (values: Record<string, number>) => void;
    onCancel: () => void;
}

export function ScalingLimitsDialog({
    open,
    title,
    subtitle,
    fields,
    isPending,
    onConfirm,
    onCancel,
}: ScalingLimitsDialogProps) {
    const { t } = useTranslation();
    const [values, setValues] = useState<Record<string, number>>({});

    useEffect(() => {
        if (open) {
            const initial: Record<string, number> = {};
            for (const f of fields) {
                initial[f.key] = f.value;
            }
            setValues(initial);
        }
    }, [open, fields]);

    if (!open) return null;

    const updateValue = (key: string, raw: string, min?: number, max?: number) => {
        let val = parseInt(raw) || 0;
        if (min !== undefined) val = Math.max(min, val);
        if (max !== undefined) val = Math.min(max, val);
        setValues((prev) => ({ ...prev, [key]: val }));
    };

    const isValid = fields.every((f) => {
        const v = values[f.key] ?? f.value;
        if (f.min !== undefined && v < f.min) return false;
        if (f.max !== undefined && v > f.max) return false;
        return true;
    });

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
                {subtitle && <p className="text-xs font-mono text-foreground mb-4">{subtitle}</p>}

                <div className="space-y-3">
                    {fields.map((f) => {
                        const resolvedMin = typeof f.min === "number" ? f.min : undefined;
                        const resolvedMax = typeof f.max === "number" ? f.max : undefined;
                        return (
                            <div key={f.key}>
                                <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                                <input
                                    type="number"
                                    min={resolvedMin}
                                    max={resolvedMax}
                                    value={values[f.key] ?? f.value}
                                    onChange={(e) => updateValue(f.key, e.target.value, resolvedMin, resolvedMax)}
                                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button
                        onClick={onCancel}
                        disabled={isPending}
                        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={() => onConfirm(values)}
                        disabled={isPending || !isValid}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {isPending ? t("common.saving") : t("common.save")}
                    </button>
                </div>
            </div>
        </div>
    );
}
