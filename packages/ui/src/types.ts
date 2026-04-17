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
  cursor: number;
  created_at: number;
}

export interface DbMessage {
  id: string;
  channel_id: string;
  agent_name: string;
  text: string;
  created_at: number;
}

export type WsBroadcast =
  | { type: "new_message"; data: DbMessage }
  | { type: "typing"; data: { agent_name: string; channel_id: string } }
  | { type: "log"; data: string };

export type ChatSseEvent =
  | { type: "user_message_saved"; data: DbMessage }
  | {
      type: "assistant_start";
      data: {
        id: string;
        channel_id: string;
        agent_name: string;
        created_at: number;
      };
    }
  | { type: "assistant_delta"; data: { chunk: string } }
  | { type: "assistant_done"; data: DbMessage }
  | { type: "error"; data: { message: string } };
