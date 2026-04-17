import { create } from "zustand";
import type { DbMessage } from "../types";

interface WsState {
  connected: boolean;
  setConnected: (connected: boolean) => void;

  messages: DbMessage[];
  addMessage: (msg: DbMessage) => void;
  setMessages: (msgs: DbMessage[]) => void;

  typingAgents: Set<string>; // "channel_id:agent_name"
  addTypingAgent: (channel_id: string, agent_name: string) => void;
  removeTypingAgent: (channel_id: string, agent_name: string) => void;
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),

  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),

  typingAgents: new Set(),
  addTypingAgent: (channel_id, agent_name) =>
    set((state) => {
      const newSet = new Set(state.typingAgents);
      newSet.add(`${channel_id}:${agent_name}`);
      return { typingAgents: newSet };
    }),
  removeTypingAgent: (channel_id, agent_name) =>
    set((state) => {
      const newSet = new Set(state.typingAgents);
      newSet.delete(`${channel_id}:${agent_name}`);
      return { typingAgents: newSet };
    }),
}));
