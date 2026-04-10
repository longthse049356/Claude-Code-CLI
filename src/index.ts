// src/index.ts
import * as readline from "readline";
import { sendMessage, DEFAULT_MODEL } from "./providers/anthropic.ts";
import type { Message, StreamResult, ToolUseBlock } from "./types.ts";

function printWelcome(): void {
  console.log("🤖 Clawd Terminal (M1)");
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log("Type your message. Ctrl+C to exit.");
  console.log("─────────────────────────────────\n");
}

function printToolCalls(blocks: ToolUseBlock[]): void {
  blocks.forEach((block, index) => {
    const label =
      blocks.length > 1
        ? `[Tool Call ${index + 1}/${blocks.length}] ${block.name}`
        : `[Tool Call] ${block.name}`;
    console.log(`\n${label}`);
    console.log(JSON.stringify(block.input, null, 2));
  });
  console.log("\n(Tool execution not implemented yet — will be added in M4)");
}

function printUsage(usage: StreamResult["usage"]): void {
  console.log(`\n[tokens: ${usage.inputTokens} in / ${usage.outputTokens} out]`);
}

function printMaxTokensWarning(): void {
  console.log("\n[Response truncated — max tokens reached]");
}

function handleError(err: unknown): void {
  if (err instanceof Error) {
    const message = err.message.toLowerCase();

    if (
      message.includes("401") ||
      message.includes("invalid x-api-key") ||
      message.includes("authentication")
    ) {
      console.error("\nError: Invalid API key. Check your ANTHROPIC_API_KEY.");
      process.exit(1);
    }

    if (message.includes("429") || message.includes("rate limit")) {
      console.error("\nRate limited. Please wait a moment and try again.");
      return;
    }

    if (
      message.includes("500") ||
      message.includes("503") ||
      message.includes("overloaded")
    ) {
      console.error(`\nAPI error. Try again.`);
      return;
    }

    if (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("enotfound") ||
      message.includes("econnrefused")
    ) {
      console.error(
        `\nConnection error: ${err.message}. Check your internet.`
      );
      return;
    }

    console.error(`\nError: ${err.message}`);
  } else {
    console.error("\nUnknown error occurred.");
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY not set. Export it or add to .env"
    );
    process.exit(1);
  }

  printWelcome();

  const history: Message[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });

  const prompt = (): void => {
    rl.question("You > ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      history.push({ role: "user", content: trimmed });

      const controller = new AbortController();
      const sigintHandler = () => {
        controller.abort();
        process.stdout.write("\n[Stream interrupted]\n");
      };
      process.once("SIGINT", sigintHandler);

      try {
        const result = await sendMessage(history, { signal: controller.signal });

        history.push({ role: "assistant", content: result.content });

        const toolCalls = result.content.filter(
          (b): b is ToolUseBlock => b.type === "tool_use"
        );
        if (toolCalls.length > 0) {
          printToolCalls(toolCalls);
        }

        if (result.stopReason === "max_tokens") {
          printMaxTokensWarning();
        }

        printUsage(result.usage);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Already printed "[Stream interrupted]" in sigintHandler
        } else {
          handleError(err);
        }
      } finally {
        process.removeListener("SIGINT", sigintHandler);
      }

      console.log();
      prompt();
    });
  };

  prompt();
}

main();
