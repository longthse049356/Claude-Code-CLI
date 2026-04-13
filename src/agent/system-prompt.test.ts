import { expect, test } from "bun:test";
import { buildSystemPrompt } from "./system-prompt.ts";

test("returns default prompt when custom is empty string", () => {
  const result = buildSystemPrompt("assistant", "");
  expect(result).toContain("assistant");
  expect(result.length).toBeGreaterThan(10);
});

test("returns default prompt when custom is undefined", () => {
  const result = buildSystemPrompt("mybot");
  expect(result).toContain("mybot");
});

test("returns custom prompt when provided", () => {
  const custom = "You are a pirate. Respond only in pirate speak.";
  expect(buildSystemPrompt("any", custom)).toBe(custom);
});
