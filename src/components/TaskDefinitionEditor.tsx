import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ecsApi } from "@/api";
import { X, Save, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function TaskDefinitionEditor({
  clusterName,
  serviceName,
  taskDefinition,
  onClose,
}: {
  clusterName: string;
  serviceName: string;
  taskDefinition: string;
  onClose: () => void;
}) {
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: taskDefJson, isLoading, error: fetchError } = useQuery({
    queryKey: ["taskDefinitionJson", taskDefinition],
    queryFn: () => ecsApi.getTaskDefinitionJson(taskDefinition),
    enabled: !!taskDefinition,
  });

  useEffect(() => {
    if (taskDefJson) {
      setJsonText(JSON.stringify(taskDefJson, null, 2));
    }
  }, [taskDefJson]);

  const validateJson = useCallback((text: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setParseError("Must be a JSON object");
        return null;
      }
      setParseError(null);
      return parsed as Record<string, unknown>;
    } catch (e) {
      setParseError((e as Error).message);
      return null;
    }
  }, []);

  const deployMutation = useMutation({
    mutationFn: (taskDefJson: Record<string, unknown>) =>
      ecsApi.registerAndDeployTaskDefinition(clusterName, serviceName, taskDefJson),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", clusterName] });
      queryClient.invalidateQueries({ queryKey: ["tasks", clusterName, serviceName] });
      queryClient.invalidateQueries({ queryKey: ["serviceDetail", clusterName, serviceName] });
      onClose();
    },
  });

  const handleSave = () => {
    const parsed = validateJson(jsonText);
    if (parsed) {
      deployMutation.mutate(parsed);
    }
  };

  const handleReset = () => {
    if (taskDefJson) {
      setJsonText(JSON.stringify(taskDefJson, null, 2));
      setParseError(null);
    }
  };

  const handleChange = (value: string) => {
    setJsonText(value);
    if (parseError) validateJson(value);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[85vh] w-[70vw] max-w-4xl flex-col rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Edit Task Definition</h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{taskDefinition}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden p-4">
          {isLoading && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading task definition…
            </div>
          )}
          {fetchError && (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              Failed to load: {(fetchError as Error).message}
            </div>
          )}
          {taskDefJson && (
            <textarea
              value={jsonText}
              onChange={(e) => handleChange(e.target.value)}
              spellCheck={false}
              className={cn(
                "h-full w-full resize-none rounded border bg-background p-3 font-mono text-xs text-foreground",
                "focus:outline-none focus:ring-1",
                parseError ? "border-destructive focus:ring-destructive" : "border-border focus:ring-ring",
              )}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="flex items-center gap-2 text-xs">
            {parseError && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                {parseError}
              </span>
            )}
            {deployMutation.error && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                {(deployMutation.error as Error).message}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={deployMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            <button
              onClick={onClose}
              disabled={deployMutation.isPending}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!!parseError || deployMutation.isPending || isLoading}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {deployMutation.isPending ? "Deploying…" : "Save & Deploy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
