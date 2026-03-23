import { useNavigationStore } from "@/store/navigation";
import { ArrowLeft } from "lucide-react";

export function Breadcrumb() {
  const { selectedCluster, selectedService, selectedTaskArn, goBack } =
    useNavigationStore();

  const parts: string[] = [];
  if (selectedCluster) parts.push(selectedCluster);
  if (selectedService) parts.push(selectedService);
  if (selectedTaskArn) parts.push(selectedTaskArn.split("/").pop() ?? "task");

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2 text-sm">
      {parts.length > 1 && (
        <button
          onClick={goBack}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground">/</span>}
          <span
            className={
              i === parts.length - 1
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {part}
          </span>
        </span>
      ))}
    </div>
  );
}
