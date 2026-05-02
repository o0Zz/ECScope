import { useState, useEffect, useCallback } from "react";
import { X, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface CaptureConfig {
    /** Show only requests exceeding this threshold (0 = disabled) */
    minResponseTimeMs: number;
    /** Filter by HTTP method (empty = all) */
    httpMethod: string;
    /** Filter by URI substring (empty = all) */
    uriFilter: string;
    /** Only show specific status codes, e.g. "5xx", "4xx", "200" (empty = all) */
    statusFilter: string;
    /** Max capture duration in seconds (0 = unlimited) */
    durationSeconds: number;
}

const DEFAULT_CONFIG: CaptureConfig = {
    minResponseTimeMs: 0,
    httpMethod: "",
    uriFilter: "",
    statusFilter: "",
    durationSeconds: 0,
};

interface CaptureConfigDialogProps {
    open: boolean;
    containerName: string;
    onConfirm: (config: CaptureConfig) => void;
    onCancel: () => void;
}

export function CaptureConfigDialog({ open, containerName, onConfirm, onCancel }: CaptureConfigDialogProps) {
    const { t } = useTranslation();
    const [config, setConfig] = useState<CaptureConfig>(DEFAULT_CONFIG);

    useEffect(() => {
        if (open) setConfig(DEFAULT_CONFIG);
    }, [open]);

    const handleConfirm = useCallback(() => {
        onConfirm(config);
    }, [config, onConfirm]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">
                            {t("capture.title", { name: containerName })}
                        </h3>
                    </div>
                    <button
                        onClick={onCancel}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Response time filter */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                            {t("capture.minResponseTime")}
                            <span className="ml-1 text-[10px] text-muted-foreground/70">{t("capture.noFilter")}</span>
                        </label>
                        <input
                            type="number"
                            min={0}
                            step={100}
                            value={config.minResponseTimeMs}
                            onChange={(e) =>
                                setConfig((c) => ({ ...c, minResponseTimeMs: Math.max(0, Number(e.target.value)) }))
                            }
                            placeholder={t("capture.responseTimePlaceholder")}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">{t("capture.responseTimeHelp")}</p>
                    </div>

                    {/* HTTP Method filter */}
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                                {t("capture.httpMethod")}
                            </label>
                            <select
                                value={config.httpMethod}
                                onChange={(e) => setConfig((c) => ({ ...c, httpMethod: e.target.value }))}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                <option value="">{t("capture.allMethods")}</option>
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                                <option value="PATCH">PATCH</option>
                                <option value="HEAD">HEAD</option>
                                <option value="OPTIONS">OPTIONS</option>
                            </select>
                        </div>

                        {/* Status code filter */}
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                                {t("capture.statusCode")}
                            </label>
                            <select
                                value={config.statusFilter}
                                onChange={(e) => setConfig((c) => ({ ...c, statusFilter: e.target.value }))}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                <option value="">{t("capture.allStatusCodes")}</option>
                                <option value="2xx">{t("capture.status2xx")}</option>
                                <option value="3xx">{t("capture.status3xx")}</option>
                                <option value="4xx">{t("capture.status4xx")}</option>
                                <option value="5xx">{t("capture.status5xx")}</option>
                            </select>
                        </div>
                    </div>

                    {/* URI filter */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                            {t("capture.uriFilter")}
                            <span className="ml-1 text-[10px] text-muted-foreground/70">
                                {t("capture.substringMatch")}
                            </span>
                        </label>
                        <input
                            type="text"
                            value={config.uriFilter}
                            onChange={(e) => setConfig((c) => ({ ...c, uriFilter: e.target.value }))}
                            placeholder={t("capture.uriPlaceholder")}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                        />
                    </div>

                    {/* Duration */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                            {t("capture.captureDuration")}
                            <span className="ml-1 text-[10px] text-muted-foreground/70">{t("capture.unlimited")}</span>
                        </label>
                        <input
                            type="number"
                            min={0}
                            step={10}
                            value={config.durationSeconds}
                            onChange={(e) =>
                                setConfig((c) => ({ ...c, durationSeconds: Math.max(0, Number(e.target.value)) }))
                            }
                            placeholder={t("capture.durationPlaceholder")}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 mt-6">
                    <button
                        onClick={onCancel}
                        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={handleConfirm}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleConfirm();
                        }}
                        className="rounded-md px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {t("capture.startCapture")}
                    </button>
                </div>
            </div>
        </div>
    );
}
