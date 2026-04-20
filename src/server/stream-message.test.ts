import { beforeEach, expect, test } from "bun:test";
import {
  createAgent,
  createChannel,
  createMessage,
  getMessagesByChannel,
  initDatabase,
} from "./database.ts";
import { handleRequest } from "./router.ts";
import { handleStreamMessage } from "./stream-message.ts";

beforeEach(() => {
  initDatabase(":memory:");
});

function parseSseFrames(body: string): Array<{ event: string; data: unknown }> {
  return body
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) {
        throw new Error(`invalid SSE frame: ${frame}`);
      }
      return {
        event: eventLine.slice("event: ".length),
        data: JSON.parse(dataLine.slice("data: ".length)),
      };
    });
}

test("returns 400 when request body is invalid JSON", async () => {
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });

  const response = await handleStreamMessage(req, "ch-1", {
    agentName: "assistant",
    streamAssistantText: async () => "should not run",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid JSON" });
});

test("returns 400 when text is missing or blank", async () => {
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " }),
  });

  const response = await handleStreamMessage(req, "ch-1", {
    agentName: "assistant",
    streamAssistantText: async () => "should not run",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "text is required" });
});

test("returns 404 when channel does not exist", async () => {
  const req = new Request("http://localhost/channels/ch-missing/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const response = await handleStreamMessage(req, "ch-missing", {
    agentName: "assistant",
    streamAssistantText: async () => "should not run",
  });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "channel not found" });
});

test("success: emits ordered token/token/done SSE frames and stores one assistant message", async () => {
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: " hello " }),
  });

  const capturedStreamArgs: Array<{
    userText: string;
    channelId: string;
    signal: AbortSignal;
  }> = [];

  const response = await handleStreamMessage(req, "ch-1", {
    agentName: "assistant",
    streamAssistantText: async ({ userText, channelId, signal, onToken }) => {
      capturedStreamArgs.push({ userText, channelId, signal });
      onToken("Hi");
      onToken(" there");
      return "Hi there";
    },
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  expect(response.headers.get("Cache-Control")).toBe("no-cache");
  expect(response.headers.get("Connection")).toBe("keep-alive");

  expect(capturedStreamArgs).toHaveLength(1);
  expect(capturedStreamArgs[0].userText).toBe("hello");
  expect(capturedStreamArgs[0].channelId).toBe("ch-1");
  expect(capturedStreamArgs[0].signal).toBeInstanceOf(AbortSignal);

  const frames = parseSseFrames(await response.text());
  expect(frames).toHaveLength(3);
  expect(frames[0]).toEqual({ event: "token", data: { text: "Hi" } });
  expect(frames[1]).toEqual({ event: "token", data: { text: " there" } });
  expect(frames[2].event).toBe("done");
  expect((frames[2].data as { message: { text: string } }).message.text).toBe("Hi there");

  const messages = getMessagesByChannel("ch-1");
  expect(messages).toHaveLength(2);
  expect(messages[0].role).toBe("user");
  expect(messages[0].text).toBe("hello");
  expect(messages[1].role).toBe("assistant");
  expect(messages[1].agent_name).toBe("assistant");
  expect(messages[1].text).toBe("Hi there");
});
test("mid-stream failure: emits ordered token/error frames with safe message and no assistant persistence", async () => {
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const response = await handleStreamMessage(req, "ch-1", {
    agentName: "assistant",
    streamAssistantText: async ({ onToken }) => {
      onToken("partial");
      throw new Error("upstream failed");
    },
  });

  const frames = parseSseFrames(await response.text());
  expect(frames).toHaveLength(2);
  expect(frames[0]).toEqual({ event: "token", data: { text: "partial" } });
  expect(frames[1]).toEqual({ event: "error", data: { error: "stream failed" } });

  const messages = getMessagesByChannel("ch-1");
  expect(messages).toHaveLength(1);
  expect(messages[0].role).toBe("user");
  expect(messages[0].text).toBe("hello");
});

test("returns 500 when initial user persistence fails", async () => {
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const originalNow = Date.now;
  Date.now = () => 1234;
  createMessage({
    id: "11111111-1111-1111-1111-111111111111",
    channel_id: "ch-1",
    text: "existing",
    role: "user",
    agent_name: "",
    created_at: 1234,
  });

  const originalRandomUUID = crypto.randomUUID;
  crypto.randomUUID = () => "11111111-1111-1111-1111-111111111111";

  try {
    const response = await handleStreamMessage(req, "ch-1", {
      agentName: "assistant",
      streamAssistantText: async () => "should not run",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "stream failed" });
  } finally {
    crypto.randomUUID = originalRandomUUID;
    Date.now = originalNow;
  }
});

test("assistant persistence failure emits safe error event and no done event", async () => {
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const originalRandomUUID = crypto.randomUUID;
  let idCount = 0;
  crypto.randomUUID = () => {
    idCount += 1;
    return idCount === 1
      ? "22222222-2222-2222-2222-222222222222"
      : "22222222-2222-2222-2222-222222222222";
  };

  try {
    const response = await handleStreamMessage(req, "ch-1", {
      agentName: "assistant",
      streamAssistantText: async ({ onToken }) => {
        onToken("partial");
        return "final";
      },
    });

    const frames = parseSseFrames(await response.text());
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ event: "token", data: { text: "partial" } });
    expect(frames[1]).toEqual({ event: "error", data: { error: "stream failed" } });

    const messages = getMessagesByChannel("ch-1");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].text).toBe("hello");
  } finally {
    crypto.randomUUID = originalRandomUUID;
  }
});

test("POST /channels/:id/messages/stream routes to SSE handler", async () => {
  createChannel("ch-1", "general", 1);
  createAgent({
    id: "agent-1",
    name: "assistant",
    channel_id: "ch-1",
    model: "test-model",
    system_prompt: "",
    last_processed_at: 0,
    created_at: 1,
  });

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const response = await handleRequest(req);

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/event-stream");
});

test("POST /channels/:id/messages/stream returns 409 when channel has no agents", async () => {
  createChannel("ch-1", "general", 1);

  const req = new Request("http://localhost/channels/ch-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  const response = await handleRequest(req);

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "no agents in channel" });
});

test("server fetch no longer upgrades /ws and returns not found", async () => {
  const originalServe = Bun.serve;
  let capturedServeOptions:
    | {
        fetch: (req: Request, server: { upgrade: (req: Request, opts?: unknown) => boolean }) =>
          | Response
          | Promise<Response>
          | undefined;
        websocket?: unknown;
      }
    | undefined;

  Bun.serve = ((options: {
    fetch: (req: Request, server: { upgrade: (req: Request, opts?: unknown) => boolean }) =>
      | Response
      | Promise<Response>
      | undefined;
    websocket?: unknown;
  }) => {
    capturedServeOptions = options;
    return {} as ReturnType<typeof Bun.serve>;
  }) as typeof Bun.serve;

  try {
    await import(`../server.ts?stream-ws-test=${Date.now()}`);

    if (!capturedServeOptions) {
      throw new Error("expected Bun.serve options to be captured");
    }

    expect(capturedServeOptions.websocket).toBeUndefined();

    let upgradeCalled = false;
    const response = await capturedServeOptions.fetch(new Request("http://localhost/ws", { method: "GET" }), {
      upgrade: () => {
        upgradeCalled = true;
        return true;
      },
    });

    expect(response).toBeDefined();
    expect((response as Response).status).toBe(404);
    expect(upgradeCalled).toBe(false);
  } finally {
    Bun.serve = originalServe;
  }
});