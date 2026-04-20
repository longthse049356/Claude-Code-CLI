import { cn } from "../lib/utils";

type ConnectionStatus = "connected" | "connecting" | "error";

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
}

export function ConnectionStatusIndicator({ status }: ConnectionStatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          status === "connected" && "bg-emerald-500",
          status === "connecting" && "bg-yellow-500 animate-pulse",
          status === "error" && "bg-red-500"
        )}
      />
      <span className="text-xs text-muted-foreground capitalize">{status}</span>
    </div>
  );
}

export type { ConnectionStatus };