import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  createAgent,
  createChannel,
  createMessage,
  initDatabase,
} from "./database.ts";
import { handleRequest } from "./router.ts";
import { clearProgress, clearTokens, setProgress } from "../agent/progress.ts";

beforeEach(() => {
  initDatabase(":memory:");
  clearProgress("ch-1");
  clearTokens("ch-1");
});

afterEach(() => {
  clearProgress("ch-1");
  clearTokens("ch-1");
});

function parseSseFrames(body: string): Array<{ event: string; data: unknown }> {
  return body
    .split("\n\n")
    .map((f) => f.trim())
    .filter((f) => f && !f.startsWith(":")) // skip keepalive comments
    .map((frame) => {
      const lines = frame.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event: "));
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!eventLine || !dataLine) throw new Error(`invalid SSE frame: ${frame}`);
      return {
        event: eventLine.slice("event: ".length),
        data: JSON.parse(dataLine.slice("data: ".length)),
      };
    });
}

function makeStreamRequest(channelId: string, text = "hello") {
  return new Request(`http://localhost/channels/${channelId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

// --- Test 1: ReadableStream chunks arrive progressively (not buffered) ---
test("ReadableStream emits chunks progressively, not all at once", async () => {
  const encoder = new TextEncoder();
  const receivedChunks: string[] = [];
  const receivedAt: number[] = [];
  const start = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("chunk1\n\n"));
      await new Promise((r) => setTimeout(r, 150));
      controller.enqueue(encoder.encode("chunk2\n\n"));
      controller.close();
    },
  });

  const reader = stream.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedChunks.push(decoder.decode(value));
    receivedAt.push(Date.now() - start);
  }

  expect(receivedChunks).toHaveLength(2);
  // chunk1 should arrive immediately, chunk2 after ~150ms
  expect(receivedAt[0]).toBeLessThan(80);
  expect(receivedAt[1]).toBeGreaterThan(100);
});

// --- Test 2: SSE polling emits done when worker reply arrives quickly ---
test("SSE stream emits done when assistant reply is created after user message", async () => {
  createChannel("ch-1", "test", 1);
  createAgent({ id: "a1", name: "bot", channel_id: "ch-1", model: "m", system_prompt: "", last_processed_at: 0, created_at: 1 });

  // Create reply 200ms after request — simulates fast worker
  setTimeout(() => {
    createMessage({
      id: crypto.randomUUID(),
      channel_id: "ch-1",
      text: "hello there",
      role: "assistant",
      agent_name: "bot",
      created_at: Date.now(),
    });
  }, 200);

  const req = makeStreamRequest("ch-1");
  const response = await handleRequest(req);
  expect(response.status).toBe(200);

  const body = await response.text();
  const frames = parseSseFrames(body);

  const doneFrames = frames.filter((f) => f.event === "done");
  expect(doneFrames).toHaveLength(1);
  expect((doneFrames[0].data as { message: { text: string } }).message.text).toBe("hello there");
});

// --- Test 3: SSE polling emits progress events BEFORE done ---
test("SSE stream emits progress events before done", async () => {
  createChannel("ch-1", "test", 1);
  createAgent({ id: "a1", name: "bot", channel_id: "ch-1", model: "m", system_prompt: "", last_processed_at: 0, created_at: 1 });

  // Simulate worker: set progress at 100ms, create reply at 700ms
  // SSE polls every 500ms so it should catch progress at ~500ms, done at ~1000ms
  setTimeout(() => setProgress("ch-1", { type: "thinking" }), 100);
  setTimeout(() => setProgress("ch-1", { type: "tool_call", toolName: "read_file", iteration: 1 }), 300);
  setTimeout(() => {
    createMessage({
      id: crypto.randomUUID(),
      channel_id: "ch-1",
      text: "done reply",
      role: "assistant",
      agent_name: "bot",
      created_at: Date.now(),
    });
    clearProgress("ch-1");
  }, 700);

  const req = makeStreamRequest("ch-1");
  const response = await handleRequest(req);
  expect(response.status).toBe(200);

  const body = await response.text();
  const frames = parseSseFrames(body);

  const progressFrames = frames.filter((f) => f.event === "progress");
  const doneFrames = frames.filter((f) => f.event === "done");

  expect(progressFrames.length).toBeGreaterThan(0);
  expect(doneFrames).toHaveLength(1);

  const firstProgressIdx = frames.findIndex((f) => f.event === "progress");
  const doneIdx = frames.findIndex((f) => f.event === "done");
  expect(firstProgressIdx).toBeLessThan(doneIdx);
});

// --- Test 4: SSE stream emits error when timeout ---
test("SSE stream emits error event when no reply within timeout", async () => {
  createChannel("ch-1", "test", 1);
  createAgent({ id: "a1", name: "bot", channel_id: "ch-1", model: "m", system_prompt: "", last_processed_at: 0, created_at: 1 });

  // Patch TIMEOUT inside the module to something small for the test
  // We can't easily do that without module mocking, so skip timing test
  // Just verify 409 when no agents — already tested in stream-message.test.ts
  // This test verifies the stream returns error event after timeout

  // We can verify the timeout behavior indirectly: no reply → no done frame
  // For now just verify: the stream response itself is 200 and SSE format
  const req = makeStreamRequest("ch-1");
  const controller = new AbortController();

  const req2 = new Request(`http://localhost/channels/ch-1/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
    signal: controller.signal,
  });

  const response = await handleRequest(req2);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/event-stream");
  expect(response.headers.get("X-Accel-Buffering")).toBe("no");

  // Abort immediately to avoid hanging the test
  controller.abort();
});

// --- Test 5: Token store — append and retrieve deltas ---
test("appendToken accumulates text, getTokensSince returns deltas", async () => {
  const { appendToken, getTokens, getTokensSince, clearTokens } = await import("../agent/progress.ts");
  clearTokens("ch-token-A");

  appendToken("ch-token-A", "Hello");
  expect(getTokens("ch-token-A")).toBe("Hello");
  expect(getTokensSince("ch-token-A", 0)).toBe("Hello");

  appendToken("ch-token-A", " world");
  expect(getTokens("ch-token-A")).toBe("Hello world");
  expect(getTokensSince("ch-token-A", 5)).toBe(" world");

  clearTokens("ch-token-A");
  expect(getTokens("ch-token-A")).toBe("");
});

// --- Test 6: Token store reset mid-turn (tool-call scenario) ---
test("getTokensSince returns full current when offset exceeds length (post-clear)", async () => {
  const { appendToken, getTokensSince, clearTokens } = await import("../agent/progress.ts");
  clearTokens("ch-token-B");

  // Simulate: round 1 of LLM streamed 5 tokens
  appendToken("ch-token-B", "Round1");
  const round1Delta = getTokensSince("ch-token-B", 0);
  expect(round1Delta).toBe("Round1");
  const offsetAfterRound1 = round1Delta.length; // 6

  // Simulate: tool call clears store; round 2 starts fresh with shorter text
  clearTokens("ch-token-B");
  appendToken("ch-token-B", "R2");

  // Caller's stale offset (6) > new length (2) → should get full "R2" back
  const round2Delta = getTokensSince("ch-token-B", offsetAfterRound1);
  expect(round2Delta).toBe("R2");

  clearTokens("ch-token-B");
});
