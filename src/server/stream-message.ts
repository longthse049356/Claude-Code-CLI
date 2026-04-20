import type { ApiError, CreateMessageBody, DbMessage } from "../types.ts";
import { createMessage, getChannel } from "./database.ts";
import { log } from "./logger.ts";
import { sseEvent, sseHeaders } from "./sse.ts";

type StreamAssistantArgs = {
  userText: string;
  channelId: string;
  onToken: (text: string) => void;
  signal: AbortSignal;
};

type StreamDeps = {
  agentName: string;
  streamAssistantText: (args: StreamAssistantArgs) => Promise<string>;
};

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error } satisfies ApiError), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleStreamMessage(
  req: Request,
  channelId: string,
  deps: StreamDeps,
): Promise<Response> {
  let body: CreateMessageBody;

  try {
    body = (await req.json()) as CreateMessageBody;
  } catch {
    return jsonError("invalid JSON", 400);
  }

  const text = body.text?.trim();
  if (!text) {
    return jsonError("text is required", 400);
  }

  if (!getChannel(channelId)) {
    return jsonError("channel not found", 404);
  }

  const userMessage: DbMessage = {
    id: crypto.randomUUID(),
    channel_id: channelId,
    text,
    role: "user",
    agent_name: "",
    created_at: Date.now(),
  };

  try {
    createMessage(userMessage);
  } catch (error) {
    log("stream-message: failed to persist user message", error);
    return jsonError("stream failed", 500);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const finalText = await deps.streamAssistantText({
          userText: text,
          channelId,
          signal: req.signal,
          onToken: (token) => {
            controller.enqueue(encoder.encode(sseEvent("token", { text: token })));
          },
        });

        const assistantMessage: DbMessage = {
          id: crypto.randomUUID(),
          channel_id: channelId,
          text: finalText,
          role: "assistant",
          agent_name: deps.agentName,
          created_at: Date.now(),
        };

        try {
          createMessage(assistantMessage);
        } catch (error) {
          log("stream-message: failed to persist assistant message", error);
          controller.enqueue(
            encoder.encode(sseEvent("error", { error: "stream failed" })),
          );
          return;
        }

        controller.enqueue(
          encoder.encode(sseEvent("done", { message: assistantMessage })),
        );
      } catch (error) {
        log("stream-message: stream failed", error);
        controller.enqueue(
          encoder.encode(sseEvent("error", { error: "stream failed" })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: sseHeaders,
  });
}
