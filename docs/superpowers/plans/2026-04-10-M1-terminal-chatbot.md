# M1 Terminal Chatbot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a terminal chatbot that streams responses from Claude API, preserves conversation history, and displays tool_use blocks as formatted JSON (no execution).

**Architecture:** 3 files — `types.ts` (interfaces only), `providers/anthropic.ts` (API + streaming), `index.ts` (readline loop + output). Each file has one clear responsibility and zero cross-cutting concerns.

**Tech Stack:** Bun runtime, TypeScript strict, `@anthropic-ai/sdk@^0.52.0`

---

## File Map

| File | Tạo/Sửa | Responsibility |
|---|---|---|
| `package.json` | Tạo | Dependencies, project name |
| `tsconfig.json` | Tạo | TypeScript config (strict, bundler resolution) |
| `.gitignore` | Tạo | Ignore .env, node_modules, dist |
| `.env.example` | Tạo | Template cho API key (không chứa key thật) |
| `src/types.ts` | Tạo | Tất cả TypeScript interfaces — không có logic |
| `src/providers/anthropic.ts` | Tạo | Khởi tạo SDK, gọi API, handle stream, trả StreamResult |
| `src/index.ts` | Tạo | Readline loop, render output, orchestrate conversation |

---

## Task 1: Project Setup

**Files:**
- Tạo: `package.json`
- Tạo: `tsconfig.json`
- Tạo: `.gitignore`
- Tạo: `.env.example`

- [ ] **Bước 1.1: Tạo package.json**

```bash
bun init -y
```

Sau đó sửa `package.json` thành:

```json
{
  "name": "clawd-rebuild",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun --hot run src/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Bước 1.2: Install dependencies**

```bash
bun install
```

Expected output:
```
bun install v1.x.x
+ @anthropic-ai/sdk@0.52.x
+ @types/bun@latest
+ typescript@5.x.x
```

- [ ] **Bước 1.3: Tạo tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Bước 1.4: Tạo .gitignore**

```
node_modules/
dist/
.env
*.db
```

- [ ] **Bước 1.5: Tạo .env.example**

```
# Copy file này thành .env và điền API key của bạn
# cp .env.example .env
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

- [ ] **Bước 1.6: Verify setup**

```bash
bun --version    # phải >= 1.0
ls node_modules/@anthropic-ai/sdk   # phải tồn tại
```

---

## Task 2: Types

**Files:**
- Tạo: `src/types.ts`

- [ ] **Bước 2.1: Tạo src/types.ts với toàn bộ interfaces**

```typescript
// src/types.ts

// --- Content Blocks (what LLM returns) ---

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolUseBlock;

// --- Messages (conversation history) ---

export interface UserMessage {
  role: "user";
  content: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
}

export type Message = UserMessage | AssistantMessage;

// --- API Response ---

export interface StreamResult {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// --- Tool Definition (sent to API) ---

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

- [ ] **Bước 2.2: Kiểm tra TypeScript không báo lỗi**

```bash
bunx tsc --noEmit
```

Expected: không có output (= no errors).

---

## Task 3: Anthropic Provider

**Files:**
- Tạo: `src/providers/anthropic.ts`

- [ ] **Bước 3.1: Tạo thư mục và file**

```bash
mkdir -p src/providers
```

- [ ] **Bước 3.2: Viết tool definitions (display-only)**

```typescript
// src/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Message, StreamResult, ToolDefinition } from "../types.ts";

const M1_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "bash",
    description: "Execute a bash command",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to execute" },
      },
      required: ["command"],
    },
  },
];

const SYSTEM_PROMPT = `You are Clawd, an AI assistant running in a terminal.
You can help with coding tasks, answer questions, and use tools when needed.

Available tools: read_file, write_file, bash.
When you need to perform an action, use the appropriate tool.

Keep responses concise and helpful.`;
```

- [ ] **Bước 3.3: Viết hàm sendMessage với streaming**

Thêm vào cuối `src/providers/anthropic.ts`:

```typescript
const client = new Anthropic();

export async function sendMessage(
  messages: Message[],
  options?: {
    model?: string;
    maxTokens?: number;
    tools?: ToolDefinition[];
    systemPrompt?: string;
  }
): Promise<StreamResult> {
  const model = options?.model ?? "claude-sonnet-4-20250514";
  const maxTokens = options?.maxTokens ?? 4096;
  const tools = options?.tools ?? M1_TOOLS;
  const systemPrompt = options?.systemPrompt ?? SYSTEM_PROMPT;

  // Anthropic SDK expects messages in its own format
  const apiMessages = messages.map((msg) => {
    if (msg.role === "user") {
      return { role: "user" as const, content: msg.content };
    }
    return {
      role: "assistant" as const,
      content: msg.content.map((block) => {
        if (block.type === "text") {
          return { type: "text" as const, text: block.text };
        }
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }),
    };
  });

  process.stdout.write("\nAssistant > ");

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: apiMessages,
    tools: tools as Anthropic.Tool[],
  });

  // Stream text tokens to terminal immediately
  stream.on("text", (text) => {
    process.stdout.write(text);
  });

  const finalMessage = await stream.finalMessage();

  // Map SDK response → our StreamResult type
  const content: StreamResult["content"] = finalMessage.content.map((block) => {
    if (block.type === "text") {
      return { type: "text" as const, text: block.text };
    }
    return {
      type: "tool_use" as const,
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    };
  });

  const stopReason = (finalMessage.stop_reason ?? "end_turn") as StreamResult["stopReason"];

  return {
    content,
    stopReason,
    usage: {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    },
  };
}
```

- [ ] **Bước 3.4: Kiểm tra TypeScript không báo lỗi**

```bash
bunx tsc --noEmit
```

Expected: không có output.

---

## Task 4: Entry Point

**Files:**
- Tạo: `src/index.ts`

- [ ] **Bước 4.1: Viết helper functions (output formatting)**

```typescript
// src/index.ts
import * as readline from "readline";
import { sendMessage } from "./providers/anthropic.ts";
import type { Message, StreamResult, ToolUseBlock } from "./types.ts";

function printWelcome(): void {
  console.log("🤖 Clawd Terminal (M1)");
  console.log("Model: claude-sonnet-4-20250514");
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
```

- [ ] **Bước 4.2: Viết hàm main với readline loop**

Thêm vào cuối `src/index.ts`:

```typescript
async function main(): Promise<void> {
  // Check API key trước khi làm bất cứ thứ gì
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

  // Ctrl+C tại prompt → exit cleanly
  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });

  const prompt = (): void => {
    rl.question("You > ", async (input) => {
      const trimmed = input.trim();

      // Skip empty input
      if (!trimmed) {
        prompt();
        return;
      }

      // Add user message to history
      history.push({ role: "user", content: trimmed });

      try {
        const result = await sendMessage(history);

        // Add assistant response to history
        history.push({ role: "assistant", content: result.content });

        // Print tool calls if any
        const toolCalls = result.content.filter(
          (b): b is ToolUseBlock => b.type === "tool_use"
        );
        if (toolCalls.length > 0) {
          printToolCalls(toolCalls);
        }

        // Print warnings
        if (result.stopReason === "max_tokens") {
          printMaxTokensWarning();
        }

        // Print token usage
        printUsage(result.usage);
      } catch (err) {
        handleError(err);
      }

      console.log(); // blank line before next prompt
      prompt();
    });
  };

  prompt();
}

main();
```

- [ ] **Bước 4.3: Viết hàm handleError**

Thêm vào `src/index.ts` trước hàm `main`:

```typescript
function handleError(err: unknown): void {
  if (err instanceof Error) {
    const message = err.message.toLowerCase();

    if (message.includes("401") || message.includes("invalid x-api-key") || message.includes("authentication")) {
      console.error("\nError: Invalid API key. Check your ANTHROPIC_API_KEY.");
      process.exit(1);
    }

    if (message.includes("429") || message.includes("rate limit")) {
      console.error("\nRate limited. Waiting 10s...");
      // Retry handled by Anthropic SDK automatically — nếu vẫn fail, thông báo
      console.error("Still rate limited. Try again in a moment.");
      return;
    }

    if (message.includes("500") || message.includes("503") || message.includes("overloaded")) {
      console.error(`\nAPI error. Try again.`);
      return;
    }

    if (message.includes("fetch") || message.includes("network") || message.includes("enotfound") || message.includes("econnrefused")) {
      console.error(`\nConnection error: ${err.message}. Check your internet.`);
      return;
    }

    // Catch-all
    console.error(`\nError: ${err.message}`);
  } else {
    console.error("\nUnknown error occurred.");
  }
}
```

- [ ] **Bước 4.4: Kiểm tra TypeScript không báo lỗi**

```bash
bunx tsc --noEmit
```

Expected: không có output.

---

## Task 5: Ctrl+C During Stream

**Files:**
- Sửa: `src/providers/anthropic.ts`
- Sửa: `src/index.ts`

Khi user nhấn Ctrl+C lúc đang stream (không phải lúc idle), cần abort stream và quay lại prompt — không exit app.

- [ ] **Bước 5.1: Update sendMessage để hỗ trợ AbortSignal**

Sửa signature và body của `sendMessage` trong `src/providers/anthropic.ts`:

```typescript
export async function sendMessage(
  messages: Message[],
  options?: {
    model?: string;
    maxTokens?: number;
    tools?: ToolDefinition[];
    systemPrompt?: string;
    signal?: AbortSignal;   // thêm dòng này
  }
): Promise<StreamResult> {
  const model = options?.model ?? "claude-sonnet-4-20250514";
  const maxTokens = options?.maxTokens ?? 4096;
  const tools = options?.tools ?? M1_TOOLS;
  const systemPrompt = options?.systemPrompt ?? SYSTEM_PROMPT;
  const signal = options?.signal;    // thêm dòng này

  // ... (giữ nguyên phần apiMessages mapping) ...

  process.stdout.write("\nAssistant > ");

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: apiMessages,
      tools: tools as Anthropic.Tool[],
    },
    signal ? { signal } : undefined   // thêm dòng này
  );

  // ... (giữ nguyên phần còn lại) ...
}
```

- [ ] **Bước 5.2: Update main để handle SIGINT during stream**

Sửa phần `prompt()` trong `src/index.ts` để truyền AbortController vào sendMessage:

```typescript
const prompt = (): void => {
  rl.question("You > ", async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      prompt();
      return;
    }

    history.push({ role: "user", content: trimmed });

    // AbortController để cancel stream khi user nhấn Ctrl+C trong lúc stream
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
      // Nếu AbortError → user Ctrl+C giữa stream → không phải lỗi thật
      if (err instanceof Error && err.name === "AbortError") {
        // Đã in "[Stream interrupted]" ở sigintHandler, không in thêm
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
```

- [ ] **Bước 5.3: Kiểm tra TypeScript**

```bash
bunx tsc --noEmit
```

Expected: không có output.

---

## Task 6: Smoke Test & Verify

- [ ] **Bước 6.1: Tạo .env từ .env.example**

```bash
cp .env.example .env
# Mở .env và điền ANTHROPIC_API_KEY thật của bạn
```

- [ ] **Bước 6.2: Chạy app**

```bash
bun run src/index.ts
```

Expected output:
```
🤖 Clawd Terminal (M1)
Model: claude-sonnet-4-20250514
Type your message. Ctrl+C to exit.
─────────────────────────────────

You > 
```

- [ ] **Bước 6.3: Test streaming — gõ "Hello"**

```
You > Hello

Assistant > Hello! How can I help you today?

[tokens: 12 in / 11 out]

You > 
```

Verify: text xuất hiện từng chữ (streaming), không đợi hết rồi hiện.

- [ ] **Bước 6.4: Test context — gõ 2 câu liên tiếp**

```
You > My name is Long

Assistant > Nice to meet you, Long! ...

You > What's my name?

Assistant > Your name is Long! ...
```

Verify: AI nhớ tên từ câu trước.

- [ ] **Bước 6.5: Test tool_use — gõ "Read file package.json"**

```
You > Read file package.json

Assistant > I'll read that file for you.

[Tool Call] read_file
{
  "path": "package.json"
}

(Tool execution not implemented yet — will be added in M4)

[tokens: 45 in / 30 out]
```

- [ ] **Bước 6.6: Test empty input — nhấn Enter trống**

```
You > 
You > 
```

Verify: không gửi API call, chỉ hiện lại prompt.

- [ ] **Bước 6.7: Test Ctrl+C tại prompt**

Nhấn Ctrl+C khi thấy `You > `.

Expected:
```
You > ^C
Goodbye!
```

- [ ] **Bước 6.8: Test missing API key**

```bash
ANTHROPIC_API_KEY="" bun run src/index.ts
```

Expected:
```
Error: ANTHROPIC_API_KEY not set. Export it or add to .env
```

Exit code phải là 1:
```bash
echo $?   # phải in ra 1
```

- [ ] **Bước 6.9: Check không có `any` type**

```bash
bunx tsc --noEmit --strict
```

Expected: không có lỗi.

---

## Task 7: Commit

- [ ] **Bước 7.1: Hỏi user trước khi commit (theo workflow rule)**

Trước khi chạy git commit, hỏi: *"Tất cả tests pass. Tôi chuẩn bị commit M1 với message 'feat: complete M1 terminal chatbot'. Bạn đồng ý không?"*

- [ ] **Bước 7.2: Sau khi user approve — commit**

```bash
git add src/ package.json tsconfig.json .gitignore .env.example
git commit -m "feat: complete M1 terminal chatbot

- Terminal readline loop with streaming responses
- Anthropic SDK integration with SSE streaming
- tool_use blocks displayed as formatted JSON (no execution)
- Conversation history preserved in-memory
- Error handling: invalid key, rate limit, network error
- Ctrl+C during stream aborts gracefully

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

- [ ] **Bước 7.3: Tag milestone**

```bash
git tag M1-done
```

- [ ] **Bước 7.4: Update CLAUDE.md — Current State sang M2**

Sửa dòng `Current milestone` trong `CLAUDE.md`:
```
- **Current milestone:** M2 (Chat Server) — chưa bắt đầu
```

---

## Acceptance Criteria Checklist (Final Verify)

Trước khi tag `M1-done`, verify toàn bộ:

### Functional
- [ ] `bun run src/index.ts` khởi động, hiển thị welcome message
- [ ] Gõ text → streaming response (từng token, không đợi hết)
- [ ] Chat 5 turns → AI nhớ context
- [ ] Gõ "Read file package.json" → tool_use JSON hiện ra
- [ ] Mixed content (text + tool_use) → cả 2 đúng
- [ ] Token usage hiển thị sau mỗi response
- [ ] Enter trống → skip
- [ ] Ctrl+C tại prompt → "Goodbye!"

### Error handling
- [ ] Không có API key → error + exit 1
- [ ] Ctrl+C during stream → "[Stream interrupted]", quay lại prompt (không exit)

### Code quality
- [ ] `bunx tsc --noEmit` → không có lỗi
- [ ] Không có `any` type
- [ ] `.env` không bị commit (check với `git status`)
