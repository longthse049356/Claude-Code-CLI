// src/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Message, StreamResult, ToolDefinition } from "../types.ts";

const M1_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "bash",
    description: "Execute a bash command",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to execute" },
      },
      required: ["command"],
    },
  },
];

const SYSTEM_PROMPT = `You are Clawd, an AI assistant running in a terminal.
You can help with coding tasks, answer questions, and use tools when needed.

Available tools: read_file, write_file, bash.
When you need to perform an action, use the appropriate tool.

Keep responses concise and helpful.`;

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
  const tools = options?.tools ?? M1_TOOLS;
  const systemPrompt = options?.systemPrompt ?? SYSTEM_PROMPT;
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

  process.stdout.write("\nAssistant > ");

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: apiMessages,
      tools: tools as Anthropic.Tool[],
    },
    signal ? { signal } : undefined
  );

  stream.on("text", (text) => {
    process.stdout.write(text);
  });

  const finalMessage = await stream.finalMessage();

  const content: StreamResult["content"] = finalMessage.content
    .filter((block) => block.type === "text" || block.type === "tool_use")
    .map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      // block.type === "tool_use" (narrowed by filter above)
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
