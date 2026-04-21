// In-memory progress store: channelId → latest worker status
// SSE endpoint polls this to emit real-time progress events to the client.

export type ProgressStatus =
  | { type: "thinking" }
  | { type: "tool_call"; toolName: string; iteration: number }
  | { type: "tool_done"; toolName: string };

const store = new Map<string, ProgressStatus>();

export function setProgress(channelId: string, status: ProgressStatus): void {
  store.set(channelId, status);
}

export function getProgress(channelId: string): ProgressStatus | null {
  return store.get(channelId) ?? null;
}

export function clearProgress(channelId: string): void {
  store.delete(channelId);
}
