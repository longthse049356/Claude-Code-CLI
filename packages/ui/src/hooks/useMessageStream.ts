import { useCallback, useRef } from "react";
import { useWsStore } from "../stores/useWsStore";
import type { ChatSseEvent, DbMessage } from "../types";

function parseSseEvent(rawChunk: string): ChatSseEvent | null {
  const blocks = rawChunk.split("\n\n");

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));

    if (!eventLine || !dataLine) continue;

    const type = eventLine.slice("event: ".length).trim();
    const dataText = dataLine.slice("data: ".length);

    try {
      const data = JSON.parse(dataText) as ChatSseEvent["data"];
      return { type, data } as ChatSseEvent;
    } catch {
      return null;
    }
  }

  return null;
}

export function useMessageStream() {
  const addMessage = useWsStore((state) => state.addMessage);
  const addLog = useWsStore((state) => state.addLog);
  const assistantDraftRef = useRef<DbMessage | null>(null);

  const dispatchEvent = useCallback(
    (event: ChatSseEvent) => {
      if (event.type === "user_message_saved") {
        addMessage(event.data);
        return;
      }

      if (event.type === "assistant_start") {
        assistantDraftRef.current = {
          id: event.data.id,
          channel_id: event.data.channel_id,
          role: "assistant",
          text: "",
          created_at: event.data.created_at,
        };
        return;
      }

      if (event.type === "assistant_delta") {
        if (assistantDraftRef.current) {
          assistantDraftRef.current = {
            ...assistantDraftRef.current,
            text: assistantDraftRef.current.text + event.data.chunk,
          };
        }
        return;
      }

      if (event.type === "assistant_done") {
        addMessage(event.data);
        assistantDraftRef.current = null;
        return;
      }

      if (event.type === "error") {
        addLog(`[SSE] ${event.data.message}`);
      }
    },
    [addLog, addMessage]
  );

  const streamMessage = useCallback(
    async (channelId: string, text: string, signal?: AbortSignal) => {
      const response = await fetch(`/channels/${channelId}/messages/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Stream request failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Missing response body for SSE stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const event = parseSseEvent(part + "\n\n");
          if (event) {
            dispatchEvent(event);
          }
        }
      }

      if (buffer.trim()) {
        const lastEvent = parseSseEvent(buffer + "\n\n");
        if (lastEvent) {
          dispatchEvent(lastEvent);
        }
      }
    },
    [dispatchEvent]
  );

  return { streamMessage };
}
