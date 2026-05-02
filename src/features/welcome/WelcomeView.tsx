import { Box, Loader2, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConfigStore } from "@/store/config";

export function WelcomeView() {
    const { t } = useTranslation();
    const { status, error, clusters, activeCluster } = useConfigStore();

    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            {status === "loading" && (
                <>
                    <Loader2 className="h-16 w-16 animate-spin text-primary/40" />
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-foreground">{t("welcome.connectingTitle")}</h2>
                        <p className="mt-1 text-sm">{t("welcome.connectingMessage")}</p>
                    </div>
                </>
            )}

            {status === "error" && (
                <>
                    <AlertTriangle className="h-16 w-16 text-destructive/60" />
                    <div className="text-center max-w-md">
                        <h2 className="text-xl font-semibold text-destructive">{t("welcome.failedTitle")}</h2>
                        <p className="mt-2 text-sm text-destructive/80">{error}</p>
                        <div className="mt-4 rounded-lg border border-border bg-card p-4 text-left text-xs">
                            <p className="font-medium text-foreground">{t("welcome.configFileExpected")}</p>
                            <pre className="mt-1 text-muted-foreground">ecscope.config.json</pre>
                            <pre className="mt-2 rounded bg-muted p-2 text-muted-foreground">{`[\n  {\n    "profile": "your-aws-profile",\n    "region": "eu-west-1",\n    "clusterName": "your-cluster"\n  }\n]`}</pre>
                        </div>
                    </div>
                </>
            )}

            {(status === "idle" || status === "connected") && (
                <>
                    <Box className="h-16 w-16 text-primary/40" />
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-foreground">{t("welcome.title")}</h2>
                        {activeCluster ? (
                            <p className="mt-1 text-sm">
                                Connected to{" "}
                                <span className="font-medium text-foreground">{activeCluster.profile}</span> in{" "}
                                <span className="font-medium text-foreground">
                                    {activeCluster.region ?? "us-east-1"}
                                </span>
                                .
                            </p>
                        ) : clusters.length > 0 ? (
                            <p className="mt-1 text-sm">
                                {t("welcome.clustersConfigured", { count: clusters.length })}
                            </p>
                        ) : (
                            <p className="mt-1 text-sm">{t("welcome.selectCluster")}</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
