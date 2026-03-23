import { Box } from "lucide-react";

export function WelcomeView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <Box className="h-16 w-16 text-primary/40" />
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          Welcome to ECScope
        </h2>
        <p className="mt-1 text-sm">
          Select a cluster from the sidebar to get started.
        </p>
      </div>
    </div>
  );
}
