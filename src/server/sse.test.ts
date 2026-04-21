import { expect, test } from "bun:test";
import { sseEvent, sseHeaders } from "./sse.ts";

test("sseHeaders includes required SSE response headers", () => {
  expect(sseHeaders).toEqual({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
});

test("sseEvent formats name and JSON payload as an SSE frame", () => {
  const payload = { text: "hello", index: 1 };

  expect(sseEvent("token", payload)).toBe(
    `event: token\ndata: ${JSON.stringify(payload)}\n\n`,
  );
});

test("sseEvent supports token, done, and error event names", () => {
  expect(sseEvent("token", { ok: true })).toBe(
    `event: token\ndata: ${JSON.stringify({ ok: true })}\n\n`,
  );
  expect(sseEvent("done", { ok: true })).toBe(
    `event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`,
  );
  expect(sseEvent("error", { message: "boom" })).toBe(
    `event: error\ndata: ${JSON.stringify({ message: "boom" })}\n\n`,
  );
});
