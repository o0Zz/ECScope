import { useTranslation } from "react-i18next";
import { KeyRound, Loader2 } from "lucide-react";
import { useConfigStore } from "@/store/config";

/** Runs `aws sso login` for the active/last profile and reconnects */
export function SsoLoginButton() {
    const { t } = useTranslation();
    const ssoLogin = useConfigStore((s) => s.ssoLogin);
    const pending = useConfigStore((s) => s.ssoLoginPending);

    return (
        <button
            onClick={() => ssoLogin()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            {pending ? t("auth.ssoLoginPending") : t("auth.ssoLogin")}
        </button>
    );
}
