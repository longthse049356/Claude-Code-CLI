// Mirror of server types
export interface Channel {
  id: string;
  name: string;
  created_at: number;
}

export interface Agent {
  id: string;
  name: string;
  channel_id: string;
  model: string;
  system_prompt: string;
  last_processed_at: number;
  created_at: number;
}

export interface DbMessage {
  id: string;
  channel_id: string;
  text: string;
  role: "user" | "assistant";
  agent_name: string;
  created_at: number;
}
