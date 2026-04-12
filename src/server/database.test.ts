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
