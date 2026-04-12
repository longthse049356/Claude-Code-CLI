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

// --- Database Models (M2) ---

export interface Channel {
  id: string;           // UUID
  name: string;
  created_at: number;   // Unix ms timestamp
}

export interface DbMessage {
  id: string;           // UUID
  channel_id: string;   // FK → channels.id
  text: string;
  role: "user" | "agent"; // M2: always "user"
  created_at: number;   // Unix ms timestamp
}

export interface Agent {
  id: string;           // UUID
  name: string;
  channel_id: string;   // FK → channels.id
  created_at: number;
}

// --- HTTP Request Bodies ---

export interface CreateChannelBody {
  name: string;
}

export interface CreateMessageBody {
  text: string;
}

// --- WebSocket Broadcast ---

export interface WsBroadcast {
  type: "new_message";
  data: DbMessage;
}

// --- API Error Response ---

export interface ApiError {
  error: string;
}
