import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useConfigStore } from "@/store/config";
import { SsoLoginButton } from "@/components/SsoLoginButton";

/** Shown while connected when a credential refresh failed (expired session, SSO token gone…) */
export function SessionBanner() {
    const { t } = useTranslation();
    const sessionError = useConfigStore((s) => s.sessionError);
    const ssoLoginRequired = useConfigStore((s) => s.ssoLoginRequired);
    const activeCluster = useConfigStore((s) => s.activeCluster);
    const connectToCluster = useConfigStore((s) => s.connectToCluster);

    if (!sessionError || !activeCluster) return null;

    return (
        <div className="flex items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
                <span className="font-medium text-destructive">{t("auth.sessionExpired")}</span>
                <span className="ml-2 break-words text-destructive/80">{sessionError}</span>
            </div>
            {ssoLoginRequired ? (
                <SsoLoginButton />
            ) : (
                <button
                    onClick={() => connectToCluster(activeCluster.clusterName)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("auth.reconnect")}
                </button>
            )}
        </div>
    );
}
