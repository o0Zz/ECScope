import { useNavigationStore, type ActiveTab } from "@/store/navigation";
import { cn } from "@/lib/utils";

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "services", label: "Services" },
  { id: "tasks", label: "Tasks" },
  { id: "albnlb", label: "ALB / NLB" },
  { id: "nodes", label: "Nodes" },
  { id: "database", label: "Database" },
];

export function TabBar() {
  const { activeTab, setActiveTab, selectedService } =
    useNavigationStore();

  return (
    <div className="flex border-b border-border bg-card">
      {TABS.map((tab) => {
        const disabled =
          (tab.id === "tasks" && !selectedService);

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
