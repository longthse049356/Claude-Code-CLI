import { afterEach, beforeEach, expect, test } from "bun:test";
import { createAgent, createChannel, createMessage, initDatabase } from "./database.ts";
import { handleRequest } from "./router.ts";
import { clearProgress, setProgress } from "../agent/progress.ts";

// We need a separate in-memory DB for each test, but since Bun.serve
// uses the global state we need to init per test.
let server: ReturnType<typeof Bun.serve>;

beforeEach(() => {
  initDatabase(":memory:");
  clearProgress("ch-1");
  server = Bun.serve({
    port: 0, // random available port
    fetch: handleRequest,
  });
});

afterEach(() => {
  clearProgress("ch-1");
  server.stop(true);
});

const decoder = new TextDecoder();

// --- Test: Does Bun actually flush SSE chunks over real HTTP? ---
test("Bun HTTP server flushes SSE chunks progressively (not buffered)", async () => {
  createChannel("ch-1", "test", 1);
  createAgent({
    id: "a1",
    name: "bot",
    channel_id: "ch-1",
    model: "m",
    system_prompt: "",
    last_processed_at: 0,
    created_at: 1,
  });

  const receivedChunks: { text: string; timeMs: number }[] = [];
  const start = Date.now();

  // Create reply after 600ms to let SSE emit at least one progress event first
  setTimeout(() => {
    setProgress("ch-1", { type: "thinking" });
  }, 100);
  setTimeout(() => {
    createMessage({
      id: crypto.randomUUID(),
      channel_id: "ch-1",
      text: "final reply",
      role: "assistant",
      agent_name: "bot",
      created_at: Date.now(),
    });
    clearProgress("ch-1");
  }, 700);

  const response = await fetch(`http://localhost:${(server as { port: number }).port}/channels/ch-1/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/event-stream");
  expect(response.headers.get("X-Accel-Buffering")).toBe("no");

  const reader = response.body!.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedChunks.push({ text: decoder.decode(value), timeMs: Date.now() - start });
  }

  console.log("HTTP chunks received:");
  for (const chunk of receivedChunks) {
    console.log(`  t=${chunk.timeMs}ms: ${JSON.stringify(chunk.text.slice(0, 80))}`);
  }

  // If Bun flushes progressively, we should get multiple chunks at different times
  expect(receivedChunks.length).toBeGreaterThan(1);

  const times = receivedChunks.map((c) => c.timeMs);
  const maxGap = Math.max(...times.slice(1).map((t, i) => t - times[i]));
  console.log(`  max gap between chunks: ${maxGap}ms`);

  // If everything is buffered, all chunks arrive at once (gap < 50ms)
  // If properly streamed, we expect at least one gap > 200ms
  const isBuffered = maxGap < 100;
  if (isBuffered) {
    console.error("BUFFERED: all chunks arrived at once — Bun is buffering the HTTP response!");
  } else {
    console.log("STREAMING: chunks arrived progressively — HTTP flush is working");
  }

  expect(isBuffered).toBe(false); // This will fail if Bun buffers
});
