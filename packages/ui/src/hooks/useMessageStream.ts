import { useCallback } from "react";
import { useWsStore } from "../stores/useWsStore";
import type { ChatSseEvent } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDbMessageData(data: unknown): data is Extract<ChatSseEvent, { type: "assistant_done" }>['data'] {
  return (
    isRecord(data) &&
    typeof data.id === "string" &&
    typeof data.channel_id === "string" &&
    typeof data.agent_name === "string" &&
    typeof data.text === "string" &&
    typeof data.created_at === "number"
  );
}

function isAssistantStartData(
  data: unknown
): data is Extract<ChatSseEvent, { type: "assistant_start" }>['data'] {
  return (
    isRecord(data) &&
    typeof data.id === "string" &&
    typeof data.channel_id === "string" &&
    typeof data.agent_name === "string" &&
    typeof data.created_at === "number"
  );
}

function isAssistantDeltaData(
  data: unknown
): data is Extract<ChatSseEvent, { type: "assistant_delta" }>['data'] {
  return isRecord(data) && typeof data.chunk === "string";
}

function isErrorData(data: unknown): data is Extract<ChatSseEvent, { type: "error" }>['data'] {
  return isRecord(data) && typeof data.message === "string";
}

function parseChatSseEvent(type: string, data: unknown): ChatSseEvent | null {
  if (type === "user_message_saved" && isDbMessageData(data)) {
    return { type, data };
  }

  if (type === "assistant_start" && isAssistantStartData(data)) {
    return { type, data };
  }

  if (type === "assistant_delta" && isAssistantDeltaData(data)) {
    return { type, data };
  }

  if (type === "assistant_done" && isDbMessageData(data)) {
    return { type, data };
  }

  if (type === "error" && isErrorData(data)) {
    return { type, data };
  }

  return null;
}

function parseSseEvent(block: string): ChatSseEvent | null {
  const normalized = block.replaceAll("\r\n", "\n").trim();
  if (!normalized) return null;

  const lines = normalized.split("\n");
  let eventType: string | null = null;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (!eventType || dataLines.length === 0) return null;

  try {
    const data = JSON.parse(dataLines.join("\n"));
    return parseChatSseEvent(eventType, data);
  } catch {
    return null;
  }
}

export function useMessageStream(channelId: string | null) {
  const addMessage = useWsStore((state) => state.addMessage);
  const addLog = useWsStore((state) => state.addLog);
  const startAssistantDraft = useWsStore((state) => state.startAssistantDraft);
  const appendAssistantDraft = useWsStore((state) => state.appendAssistantDraft);
  const finalizeAssistantDraft = useWsStore((state) => state.finalizeAssistantDraft);
  const failAssistantDraft = useWsStore((state) => state.failAssistantDraft);

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

      let activeDraftId: string | null = null;
      const dispatchEvent = (event: ChatSseEvent) => {
        if (event.type === "user_message_saved") {
          addMessage(event.data);
          return;
        }

        if (event.type === "assistant_start") {
          startAssistantDraft(event.data);
          activeDraftId = event.data.id;
          return;
        }

        if (event.type === "assistant_delta") {
          if (activeDraftId) {
            appendAssistantDraft(activeDraftId, event.data.chunk);
          }
          return;
        }

        if (event.type === "assistant_done") {
          finalizeAssistantDraft(event.data);
          activeDraftId = null;
          return;
        }

        if (activeDraftId) {
          failAssistantDraft(activeDraftId);
          activeDraftId = null;
        }
        addLog(`[SSE] ${event.data.message}`);
      };

      try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const event = parseSseEvent(part);
            if (event) {
              dispatchEvent(event);
            }
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          const parts = buffer.split(/\r?\n\r?\n/);
          for (const part of parts) {
            const event = parseSseEvent(part);
            if (event) {
              dispatchEvent(event);
            }
          }
        }

        if (activeDraftId) {
          failAssistantDraft(activeDraftId);
          addLog("[SSE] Stream ended before assistant_done");
          activeDraftId = null;
        }
      } catch (error) {
        if (activeDraftId) {
          failAssistantDraft(activeDraftId);
          activeDraftId = null;
        }

        throw error;
      }
    },
    [
      addLog,
      addMessage,
      appendAssistantDraft,
      channelId,
      failAssistantDraft,
      finalizeAssistantDraft,
      startAssistantDraft,
    ]
  );

  return { sendStreamMessage };
}
