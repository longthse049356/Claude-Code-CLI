import { create } from "zustand";
import type { DbMessage } from "../types";

interface WsState {
  connected: boolean;
  setConnected: (connected: boolean) => void;

  messages: DbMessage[];
  assistantDraftIds: Set<string>;
  addMessage: (msg: DbMessage) => void;
  setMessages: (channelId: string, msgs: DbMessage[]) => void;
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

function upsertMessage(messages: DbMessage[], message: DbMessage): DbMessage[] {
  const existingIndex = messages.findIndex((existing) => existing.id === message.id);
  if (existingIndex === -1) {
    return [...messages, message];
  }

  return messages.map((existing, index) => (index === existingIndex ? message : existing));
}

function replaceChannelMessages(
  messages: DbMessage[],
  channelId: string,
  nextChannelMessages: DbMessage[]
): DbMessage[] {
  const dedupedChannelMessages = new Map<string, DbMessage>();
  for (const message of nextChannelMessages) {
    dedupedChannelMessages.set(message.id, message);
  }

  const otherChannels = messages.filter((message) => message.channel_id !== channelId);
  return [...otherChannels, ...dedupedChannelMessages.values()];
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),

  messages: [],
  assistantDraftIds: new Set(),
  addMessage: (msg) =>
    set((state) => ({
      messages: upsertMessage(state.messages, msg),
    })),
  setMessages: (channelId, msgs) =>
    set((state) => {
      const nextDraftIds = new Set(state.assistantDraftIds);
      for (const message of msgs) {
        nextDraftIds.delete(message.id);
      }

      return {
        messages: replaceChannelMessages(state.messages, channelId, msgs),
        assistantDraftIds: nextDraftIds,
      };
    }),
  startAssistantDraft: (draft) =>
    set((state) => {
      const existingMessage = state.messages.find((msg) => msg.id === draft.id);
      const draftMessage: DbMessage = {
        id: draft.id,
        channel_id: draft.channel_id,
        agent_name: draft.agent_name,
        text: existingMessage?.text ?? "",
        created_at: draft.created_at,
      };

      const nextDraftIds = new Set(state.assistantDraftIds);
      nextDraftIds.add(draft.id);

      return {
        messages: upsertMessage(state.messages, draftMessage),
        assistantDraftIds: nextDraftIds,
      };
    }),
  appendAssistantDraft: (id, chunk) =>
    set((state) => {
      if (!state.assistantDraftIds.has(id) || !chunk) {
        return state;
      }

      return {
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, text: msg.text + chunk } : msg
        ),
      };
    }),
  finalizeAssistantDraft: (msg) =>
    set((state) => {
      const nextDraftIds = new Set(state.assistantDraftIds);
      nextDraftIds.delete(msg.id);

      return {
        messages: upsertMessage(state.messages, msg),
        assistantDraftIds: nextDraftIds,
      };
    }),
  failAssistantDraft: (id) =>
    set((state) => {
      if (!state.assistantDraftIds.has(id)) {
        return state;
      }

      const nextDraftIds = new Set(state.assistantDraftIds);
      nextDraftIds.delete(id);

      return {
        messages: state.messages.filter((msg) => msg.id !== id),
        assistantDraftIds: nextDraftIds,
      };
    }),

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
