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

export type Message = UserMessage | AssistantMessage;

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
  role: "user" | "assistant";   // was "user" | "agent" in M2 — fixed to match Claude API
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

// --- WebSocket Broadcast ---

export type WsBroadcast =
  | { type: "new_message"; data: DbMessage }
  | { type: "typing"; data: { agent_name: string; channel_id: string } }
  | { type: "log"; data: string };

export type SseChatEvent =
  | { type: "user_message_saved"; data: DbMessage }
  | { type: "assistant_start"; data: { id: string; channel_id: string; agent_name: string; created_at: number } }
  | { type: "assistant_delta"; data: { chunk: string } }
  | { type: "assistant_done"; data: DbMessage }
  | { type: "error"; data: { message: string } };

// --- API Error Response ---

export interface ApiError {
  error: string;
}
