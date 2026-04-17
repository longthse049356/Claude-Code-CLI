import { expect, test } from "bun:test";
import { extractTextDelta, streamTextDeltas } from "./anthropic.ts";

test("extractTextDelta returns text for content_block_delta text_delta events", () => {
  const event = {
    type: "content_block_delta",
    delta: {
      type: "text_delta",
      text: "hello",
    },
  };

  expect(extractTextDelta(event)).toBe("hello");
});

test("extractTextDelta returns null for non-content_block_delta events", () => {
  const event = {
    type: "message_start",
  };

  expect(extractTextDelta(event)).toBeNull();
});

test("extractTextDelta returns null for non-text delta content", () => {
  const event = {
    type: "content_block_delta",
    delta: {
      type: "input_json_delta",
      partial_json: "{\"a\":1}",
    },
  };

  expect(extractTextDelta(event)).toBeNull();
});

test("streamTextDeltas invokes callback only for text-delta events in order", async () => {
  const events = [
    { type: "message_start" },
    { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
    { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{}" } },
    { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } },
    { type: "message_stop" },
    { type: "content_block_delta", delta: { type: "text_delta", text: "!" } },
  ];

  const received: string[] = [];

  await streamTextDeltas(events, async (chunk) => {
    received.push(chunk);
  });

  expect(received).toEqual(["Hel", "lo", "!"]);
});

test("streamTextDeltas ignores non-text events", async () => {
  const events = [
    { type: "message_start" },
    { type: "message_delta" },
    { type: "content_block_start", content_block: { type: "text" } },
    { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{}" } },
    { type: "content_block_delta", delta: { type: "text_delta", text: 123 } },
    { type: "message_stop" },
  ];

  const received: string[] = [];

  await streamTextDeltas(events, async (chunk) => {
    received.push(chunk);
  });

  expect(received).toEqual([]);
});

test("streamTextDeltas awaits async callback before processing next chunk", async () => {
  const events = [
    { type: "content_block_delta", delta: { type: "text_delta", text: "A" } },
    { type: "content_block_delta", delta: { type: "text_delta", text: "B" } },
  ];

  const order: string[] = [];

  await streamTextDeltas(events, async (chunk) => {
    order.push(`${chunk}-start`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push(`${chunk}-end`);
  });

  expect(order).toEqual(["A-start", "A-end", "B-start", "B-end"]);
});
