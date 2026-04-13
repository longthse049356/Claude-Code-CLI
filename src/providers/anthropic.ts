// src/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Message, StreamResult, ToolDefinition } from "../types.ts";

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
});

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

  const apiMessages = messages.map((msg) => {
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

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: apiMessages,
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
