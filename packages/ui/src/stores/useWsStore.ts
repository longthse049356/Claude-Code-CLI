import { create } from "zustand";
import type { DbMessage } from "../types";

interface WsState {
  connected: boolean;
  setConnected: (connected: boolean) => void;

  messages: DbMessage[];
  addMessage: (msg: DbMessage) => void;
  setMessages: (msgs: DbMessage[]) => void;
  startAssistantDraft: (draft: {
    id: string;
    channel_id: string;
    agent_name: string;
    created_at: number;
  }) => void;
  appendAssistantDraft: (id: string, chunk: string) => void;
  finalizeAssistantDraft: (msg: DbMessage) => void;
  failAssistantDraft: (id: string) => void;

  typingAgents: Set<string>; // "channel_id:agent_name"
  addTypingAgent: (channel_id: string, agent_name: string) => void;
  removeTypingAgent: (channel_id: string, agent_name: string) => void;

  logs: string[];
  addLog: (log: string) => void;
  clearLogs: () => void;
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),

  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  startAssistantDraft: (draft) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: draft.id,
          channel_id: draft.channel_id,
          agent_name: draft.agent_name,
          text: "",
          created_at: draft.created_at,
        },
      ],
    })),
  appendAssistantDraft: (id, chunk) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, text: msg.text + chunk } : msg
      ),
    })),
  finalizeAssistantDraft: (msg) =>
    set((state) => ({
      messages: state.messages.map((existing) =>
        existing.id === msg.id ? msg : existing
      ),
    })),
  failAssistantDraft: (id) =>
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== id),
    })),

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

  logs: [],
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  clearLogs: () => set({ logs: [] }),
}));
