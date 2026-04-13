import { beforeEach, expect, test } from "bun:test";
import {
  createChannel,
  createMessage,
  getChannel,
  getMessagesByChannel,
  initDatabase,
} from "./database.ts";

beforeEach(() => {
  // Use in-memory DB for tests — no file created, isolated per test
  initDatabase(":memory:");
});

test("createChannel and getChannel round-trip", () => {
  createChannel("ch-1", "general", 1000);
  const ch = getChannel("ch-1");
  expect(ch).toEqual({ id: "ch-1", name: "general", created_at: 1000 });
});

test("getChannel returns null for unknown id", () => {
  const ch = getChannel("does-not-exist");
  expect(ch).toBeNull();
});

test("createMessage and getMessagesByChannel round-trip", () => {
  createChannel("ch-1", "general", 1000);
  createMessage({
    id: "msg-1",
    channel_id: "ch-1",
    text: "Hello",
    role: "user",
    created_at: 2000,
  });
  const msgs = getMessagesByChannel("ch-1");
  expect(msgs).toHaveLength(1);
  expect(msgs[0]).toEqual({
    id: "msg-1",
    channel_id: "ch-1",
    text: "Hello",
    role: "user",
    created_at: 2000,
  });
});

test("getMessagesByChannel returns empty array when channel has no messages", () => {
  createChannel("ch-1", "general", 1000);
  expect(getMessagesByChannel("ch-1")).toEqual([]);
});

test("getMessagesByChannel orders messages by created_at ASC", () => {
  createChannel("ch-1", "general", 1000);
  // Insert newer message first
  createMessage({ id: "msg-2", channel_id: "ch-1", text: "Second", role: "user", created_at: 3000 });
  createMessage({ id: "msg-1", channel_id: "ch-1", text: "First",  role: "user", created_at: 2000 });
  const msgs = getMessagesByChannel("ch-1");
  expect(msgs[0].id).toBe("msg-1");
  expect(msgs[1].id).toBe("msg-2");
});

// --- Agent DB Functions Tests ---

import type { Agent } from "../types.ts";
import {
  createAgent,
  deleteAgent,
  getAllAgents,
  getAgent,
  getAgentByChannelAndName,
  getMessagesAfter,
  updateAgentCursor,
} from "./database.ts";

const AGENT: Agent = {
  id: "agent-1",
  name: "claude",
  channel_id: "ch-1",
  model: "claude-sonnet-4-20250514",
  system_prompt: "",
  last_processed_at: 0,
  created_at: 5000,
};

test("createAgent and getAgent round-trip", () => {
  createChannel("ch-1", "general", 1000);
  createAgent(AGENT);
  const a = getAgent("agent-1");
  expect(a).toEqual(AGENT);
});

test("getAgent returns null for unknown id", () => {
  expect(getAgent("does-not-exist")).toBeNull();
});

test("getAllAgents returns all agents", () => {
  createChannel("ch-1", "general", 1000);
  createChannel("ch-2", "random", 2000);
  createAgent({ ...AGENT, id: "a-1", channel_id: "ch-1" });
  createAgent({ ...AGENT, id: "a-2", channel_id: "ch-2", name: "bot" });
  expect(getAllAgents()).toHaveLength(2);
});

test("deleteAgent removes agent from DB", () => {
  createChannel("ch-1", "general", 1000);
  createAgent(AGENT);
  deleteAgent("agent-1");
  expect(getAgent("agent-1")).toBeNull();
});

test("updateAgentCursor persists new last_processed_at", () => {
  createChannel("ch-1", "general", 1000);
  createAgent(AGENT);
  updateAgentCursor("agent-1", 9999);
  const a = getAgent("agent-1");
  expect(a?.last_processed_at).toBe(9999);
});

test("getAgentByChannelAndName returns correct agent", () => {
  createChannel("ch-1", "general", 1000);
  createAgent(AGENT);
  const a = getAgentByChannelAndName("ch-1", "claude");
  expect(a?.id).toBe("agent-1");
});

test("getAgentByChannelAndName returns null when not found", () => {
  expect(getAgentByChannelAndName("ch-1", "nobody")).toBeNull();
});

test("getMessagesAfter returns only messages after cursor", () => {
  createChannel("ch-1", "general", 1000);
  createMessage({ id: "m-1", channel_id: "ch-1", text: "A", role: "user", created_at: 1000 });
  createMessage({ id: "m-2", channel_id: "ch-1", text: "B", role: "user", created_at: 2000 });
  createMessage({ id: "m-3", channel_id: "ch-1", text: "C", role: "user", created_at: 3000 });
  const result = getMessagesAfter("ch-1", 1500);
  expect(result).toHaveLength(2);
  expect(result[0].id).toBe("m-2");
  expect(result[1].id).toBe("m-3");
});

test("getMessagesAfter returns empty array when no new messages", () => {
  createChannel("ch-1", "general", 1000);
  expect(getMessagesAfter("ch-1", 9999)).toEqual([]);
});
