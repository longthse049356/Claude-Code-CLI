type ProgressStatus =
  | { type: "thinking" }
  | { type: "tool_call"; toolName: string; iteration: number }
  | { type: "tool_done"; toolName: string };

function progressLabel(progress: ProgressStatus): string {
  switch (progress.type) {
    case "thinking": return "Thinking…";
    case "tool_call": return `Calling ${progress.toolName}…`;
    case "tool_done": return `Done: ${progress.toolName}`;
  }
}

export function TypingIndicator({ progress }: { progress?: ProgressStatus | null }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      {progress && (
        <span className="text-xs text-muted-foreground font-mono">
          {progressLabel(progress)}
        </span>
      )}
    </div>
  );
}
