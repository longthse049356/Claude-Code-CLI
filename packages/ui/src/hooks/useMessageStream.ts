import { useCallback, useRef } from "react";
import { useWsStore } from "../stores/useWsStore";
import type { ChatSseEvent } from "../types";

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

export function useMessageStream(channelId: string | null) {
  const addMessage = useWsStore((state) => state.addMessage);
  const addLog = useWsStore((state) => state.addLog);
  const startAssistantDraft = useWsStore((state) => state.startAssistantDraft);
  const appendAssistantDraft = useWsStore((state) => state.appendAssistantDraft);
  const finalizeAssistantDraft = useWsStore((state) => state.finalizeAssistantDraft);
  const failAssistantDraft = useWsStore((state) => state.failAssistantDraft);
  const activeDraftIdRef = useRef<string | null>(null);

  const dispatchEvent = useCallback(
    (event: ChatSseEvent) => {
      if (event.type === "user_message_saved") {
        addMessage(event.data);
        return;
      }

      if (event.type === "assistant_start") {
        startAssistantDraft(event.data);
        activeDraftIdRef.current = event.data.id;
        return;
      }

      if (event.type === "assistant_delta") {
        if (activeDraftIdRef.current) {
          appendAssistantDraft(activeDraftIdRef.current, event.data.chunk);
        }
        return;
      }

      if (event.type === "assistant_done") {
        finalizeAssistantDraft(event.data);
        activeDraftIdRef.current = null;
        return;
      }

      if (event.type === "error") {
        if (activeDraftIdRef.current) {
          failAssistantDraft(activeDraftIdRef.current);
          activeDraftIdRef.current = null;
        }
        addLog(`[SSE] ${event.data.message}`);
      }
    },
    [
      addLog,
      addMessage,
      appendAssistantDraft,
      failAssistantDraft,
      finalizeAssistantDraft,
      startAssistantDraft,
    ]
  );

  const sendStreamMessage = useCallback(
    async (text: string, signal?: AbortSignal) => {
      if (!channelId) {
        throw new Error("Cannot stream message without an active channel");
      }

      const response = await fetch(`/channels/${channelId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
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
    [channelId, dispatchEvent]
  );

  return { sendStreamMessage };
}
