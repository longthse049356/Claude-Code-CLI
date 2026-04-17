import { beforeEach, expect, test } from "bun:test";
import { createAgent, createChannel, initDatabase } from "./database.ts";
import { handleRequest } from "./router.ts";

beforeEach(() => {
  initDatabase(":memory:");
  createChannel("ch-1", "general", 1);
  createAgent({
    id: "agent-1",
    name: "claude",
    channel_id: "ch-1",
    model: "claude-sonnet-4-20250514",
    system_prompt: "",
    last_processed_at: 0,
    created_at: 1,
  });
});

test("POST /channels/:id/messages/stream returns SSE headers", async () => {
  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const res = await handleRequest(req);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")?.includes("text/event-stream")).toBe(true);
});
