import { expect, test } from "bun:test";
import { extractTextDelta } from "./anthropic.ts";

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
