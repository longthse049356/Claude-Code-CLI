// src/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Message, StreamResult, ToolDefinition } from "../types.ts";

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
});

export function extractTextDelta(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;

  const maybeEvent = event as {
    type?: string;
    delta?: { type?: string; text?: unknown };
  };

  if (maybeEvent.type !== "content_block_delta") return null;
  if (!maybeEvent.delta || maybeEvent.delta.type !== "text_delta") return null;

  return typeof maybeEvent.delta.text === "string" ? maybeEvent.delta.text : null;
}

export async function streamTextDeltas(
  stream: AsyncIterable<unknown> | Iterable<unknown>,
  onDelta: (chunk: string) => void | Promise<void>
): Promise<void> {
  for await (const event of stream) {
    const chunk = extractTextDelta(event);
    if (chunk !== null) {
      await onDelta(chunk);
    }
  }
}

function toApiMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages.map((msg) => {
    if (msg.role === "user") {
      return { role: "user" as const, content: msg.content };
    }
    return {
      role: "assistant" as const,
      content: msg.content.map((block) => {
        if (block.type === "text") {
          return { type: "text" as const, text: block.text };
        }
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }),
    };
  });
}

export async function streamMessage(
  messages: Message[],
  options?: {
    model?: string;
    maxTokens?: number;
    systemPrompt?: string;
    signal?: AbortSignal;
    onDelta?: (chunk: string) => void | Promise<void>;
  }
): Promise<{ text: string }> {
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? 4096;
  const systemPrompt = options?.systemPrompt ?? "";
  const signal = options?.signal;

  const llmStream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: toApiMessages(messages),
    },
    signal ? { signal } : undefined
  );

  let fullText = "";
  await streamTextDeltas(llmStream as AsyncIterable<unknown>, async (chunk) => {
    fullText += chunk;
    if (options?.onDelta) {
      await options.onDelta(chunk);
    }
  });

  return { text: fullText };
}

export async function sendMessage(
  messages: Message[],
  options?: {
    model?: string;
    maxTokens?: number;
    tools?: ToolDefinition[];
    systemPrompt?: string;
    signal?: AbortSignal;
  }
): Promise<StreamResult> {
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? 4096;
  const tools = options?.tools ?? [];
  const systemPrompt = options?.systemPrompt ?? "";
  const signal = options?.signal;

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: toApiMessages(messages),
      // Only include tools field when tools are actually defined
      ...(tools.length > 0 ? { tools: tools as Anthropic.Tool[] } : {}),
    },
    signal ? { signal } : undefined
  );

  const finalMessage = await stream.finalMessage();

  const content: StreamResult["content"] = finalMessage.content
    .filter((block) => block.type === "text" || block.type === "tool_use")
    .map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      const toolBlock = block as Anthropic.ToolUseBlock;
      return {
        type: "tool_use" as const,
        id: toolBlock.id,
        name: toolBlock.name,
        input: toolBlock.input as Record<string, unknown>,
      };
    });

  const stopReason = (finalMessage.stop_reason ?? "end_turn") as StreamResult["stopReason"];

  return {
    content,
    stopReason,
    usage: {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    },
  };
}
