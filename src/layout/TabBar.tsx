import { useTranslation } from "react-i18next";
import { useNavigationStore, type ActiveTab } from "@/store/navigation";
import { cn } from "@/lib/utils";

const TAB_KEYS: { id: ActiveTab; key: string }[] = [
    { id: "services", key: "tabs.services" },
    { id: "tasks", key: "tabs.tasks" },
    { id: "albnlb", key: "tabs.albnlb" },
    { id: "nodes", key: "tabs.nodes" },
    { id: "ec2rds", key: "tabs.ec2rds" },
];

export function TabBar() {
    const { t } = useTranslation();
    const { activeTab, setActiveTab, selectedService } = useNavigationStore();

    return (
        <div className="flex border-b border-border bg-card">
            {TAB_KEYS.map((tab) => {
                const disabled = tab.id === "tasks" && !selectedService;

                return (
                    <button
                        key={tab.id}
                        onClick={() => !disabled && setActiveTab(tab.id)}
                        disabled={disabled}
                        className={cn(
                            "relative px-4 py-2.5 text-sm font-medium transition-colors",
                            activeTab === tab.id
                                ? "text-foreground"
                                : disabled
                                  ? "cursor-not-allowed text-muted-foreground/40"
                                  : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t(tab.key)}
                        {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                    </button>
                );
            })}
        </div>
    );
}
