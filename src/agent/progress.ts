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

// --- Token streaming store ---
// Accumulated assistant text streaming per channel.
// Worker appends deltas; SSE endpoint polls via getTokensSince.

const tokenStore = new Map<string, string>();

export function appendToken(channelId: string, delta: string): void {
  const current = tokenStore.get(channelId) ?? "";
  tokenStore.set(channelId, current + delta);
}

export function getTokens(channelId: string): string {
  return tokenStore.get(channelId) ?? "";
}

/**
 * Returns text appended since `offset` (length-based cursor).
 * If offset > current length (store was cleared mid-turn), returns full current text
 * so caller can reset their cursor to the new length.
 * Returns empty string if no new text.
 */
export function getTokensSince(channelId: string, offset: number): string {
  const current = tokenStore.get(channelId) ?? "";
  if (offset > current.length) return current;
  if (offset >= current.length) return "";
  return current.slice(offset);
}

export function clearTokens(channelId: string): void {
  tokenStore.delete(channelId);
}
