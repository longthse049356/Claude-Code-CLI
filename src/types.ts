// src/types.ts

// --- Claude API Types (used by providers/anthropic.ts) ---

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolUseBlock;

export interface UserMessage {
  role: "user";
  content: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
}

export interface ToolResultMessage {
  role: "user";
  content: ToolResultBlock[];
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface StreamResult {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}

// --- Database Models ---

export interface Channel {
  id: string;
  name: string;
  created_at: number;
}

export interface DbMessage {
  id: string;
  channel_id: string;
  text: string;
  role: "user" | "assistant";
  agent_name: string;            // "" for user messages, agent name for assistant replies
  created_at: number;
}

export interface Agent {
  id: string;
  name: string;
  channel_id: string;
  model: string;
  system_prompt: string;
  last_processed_at: number;    // Unix ms — cursor: messages before this are already processed
  created_at: number;
}

// --- HTTP Request Bodies ---

export interface CreateChannelBody {
  name: string;
}

export interface CreateMessageBody {
  text: string;
}

export interface CreateAgentBody {
  name: string;
  model?: string;
  system_prompt?: string;
}

// --- API Error Response ---

export interface ApiError {
  error: string;
}
