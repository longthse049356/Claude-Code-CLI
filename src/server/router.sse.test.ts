import { beforeEach, expect, test } from "bun:test";
import { createAgent, createChannel, initDatabase } from "./database.ts";
import { handleRequest, routerDeps } from "./router.ts";

type ParsedSseEvent = {
  type: string;
  data: unknown;
};

function parseSseEvents(payload: string): ParsedSseEvent[] {
  return payload
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));

      return {
        type: eventLine?.slice("event: ".length) ?? "",
        data: JSON.parse(dataLine?.slice("data: ".length) ?? "null"),
      };
    });
}

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

test("POST /channels/:id/messages/stream returns SSE headers and expected success events", async () => {
  const originalStreamMessage = routerDeps.streamMessage;
  routerDeps.streamMessage = async (_messages, options) => {
    await options?.onDelta?.("Hel");
    await options?.onDelta?.("lo");
    return { text: "Hello" };
  };

  try {
    const req = new Request("http://localhost/channels/ch-1/messages/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")?.includes("text/event-stream")).toBe(true);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");

    const payload = await res.text();
    const events = parseSseEvents(payload);
    const eventTypes = events.map((event) => event.type);

    const userSavedIndex = eventTypes.indexOf("user_message_saved");
    const assistantStartIndex = eventTypes.indexOf("assistant_start");
    const assistantDoneIndex = eventTypes.indexOf("assistant_done");

    expect(userSavedIndex).toBeGreaterThanOrEqual(0);
    expect(assistantStartIndex).toBeGreaterThan(userSavedIndex);
    expect(assistantDoneIndex).toBeGreaterThan(assistantStartIndex);
  } finally {
    routerDeps.streamMessage = originalStreamMessage;
  }
});

test("POST /channels/:id/messages/stream emits error event when provider stream fails", async () => {
  const originalStreamMessage = routerDeps.streamMessage;
  routerDeps.streamMessage = async () => {
    throw new Error("provider unavailable");
  };

  try {
    const req = new Request("http://localhost/channels/ch-1/messages/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(200);

    const payload = await res.text();
    const events = parseSseEvents(payload);
    const eventTypes = events.map((event) => event.type);

    expect(eventTypes).toContain("user_message_saved");
    expect(eventTypes).toContain("assistant_start");
    expect(eventTypes).toContain("error");
    expect(eventTypes).not.toContain("assistant_done");
  } finally {
    routerDeps.streamMessage = originalStreamMessage;
  }
});
