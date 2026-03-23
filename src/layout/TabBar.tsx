import { useNavigationStore } from "@/store/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "services" as const, label: "Services" },
  { id: "tasks" as const, label: "Tasks" },
  { id: "logs" as const, label: "Logs" },
];

export function TabBar() {
  const { activeTab, setActiveTab, selectedService, selectedTaskArn } =
    useNavigationStore();

  return (
    <div className="flex border-b border-border bg-card">
      {TABS.map((tab) => {
        const disabled =
          (tab.id === "tasks" && !selectedService) ||
          (tab.id === "logs" && !selectedTaskArn);

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
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
