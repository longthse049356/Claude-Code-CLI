# M1 Feature Spec: Terminal Chatbot

> Spec chi tiết cho implementation. Đọc `M01-terminal-chatbot.md` trước để hiểu scope và concepts.

---

## 1. Project Setup

### Dependencies

```json
{
  "name": "clawd-rebuild",
  "type": "module",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

### Environment

```bash
# .env (gitignored)
ANTHROPIC_API_KEY=sk-ant-xxx

# hoặc export trước khi chạy
export ANTHROPIC_API_KEY=sk-ant-xxx
```

### tsconfig.json

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

### Run command

```bash
bun run src/index.ts
```

---

## 2. Data Structures

```typescript
// src/types.ts

// --- Content Blocks (what LLM returns) ---

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;          // "toolu_01A..." — unique ID per tool call
  name: string;        // "read_file", "bash", etc.
  input: Record<string, unknown>;  // tool-specific params
}

type ContentBlock = TextBlock | ToolUseBlock;

// --- Messages (conversation history) ---

interface UserMessage {
  role: "user";
  content: string;     // plain text from user
}

interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];  // can contain mix of text + tool_use
}

type Message = UserMessage | AssistantMessage;

// --- API Response (what we parse from stream) ---

interface StreamResult {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// --- Tool Definition (sent to API) ---

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

---

## 3. File Specifications

### `src/index.ts` — Entry Point

**Responsibility:** Readline loop, orchestrate conversation.

```
Flow:
1. Check ANTHROPIC_API_KEY exists → error if not
2. Print welcome message
3. Loop:
   a. Prompt "You > " and read input
   b. Skip empty input
   c. Push UserMessage to history
   d. Call sendMessage(history) → get StreamResult
   e. Push AssistantMessage to history
   f. If stopReason === "tool_use" → display tool calls as JSON
   g. Loop back to (a)
4. Ctrl+C → print goodbye, exit cleanly
```

**Function signature:**

```typescript
// Main loop — no return, runs until Ctrl+C
async function main(): Promise<void>

// Conversation state
const history: Message[] = []
```

**Console output format:**

```
🤖 Clawd Terminal (M1)
Model: claude-sonnet-4-20250514
Type your message. Ctrl+C to exit.
─────────────────────────────────

You > Hello, what can you do?

Assistant > I can help you with various tasks including reading files,
writing code, and answering questions. However, in this terminal
mode, I can only chat — tool execution will be added in M4.

[tokens: 15 in / 42 out]

You > Read file package.json

Assistant > I'd like to read that file for you.

[Tool Call] read_file
{
  "path": "package.json"
}

(Tool execution not implemented yet — will be added in M4)

[tokens: 52 in / 28 out]

You > ^C
Goodbye!
```

### `src/providers/anthropic.ts` — API Provider

**Responsibility:** Call Claude API with streaming, return parsed result.

**Function signature:**

```typescript
// Send messages to Claude API, stream response to terminal, return parsed result
async function sendMessage(
  messages: Message[],
  options?: {
    model?: string;           // default: "claude-sonnet-4-20250514"
    maxTokens?: number;       // default: 4096
    tools?: ToolDefinition[]; // default: dummy tools for M1
    systemPrompt?: string;    // default: basic system prompt
  }
): Promise<StreamResult>
```

**Streaming behavior:**

```
API SSE events arrive as:
  event: message_start    → extract message ID, model
  event: content_block_start → new TextBlock or ToolUseBlock starting
  event: content_block_delta → 
    For text: { type: "text_delta", text: "partial..." }
    For tool_use: { type: "input_json_delta", partial_json: "..." }
  event: content_block_stop → block complete
  event: message_delta → stop_reason, usage
  event: message_stop → done

Our handling:
  text_delta       → print to terminal immediately (no newline, streaming effect)
  input_json_delta → buffer (don't print yet, JSON incomplete)
  content_block_stop (tool_use) → parse full JSON, print formatted
  message_stop     → print newline + token usage
```

**Anthropic SDK usage:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();  // reads ANTHROPIC_API_KEY from env automatically

const stream = await client.messages.stream({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  system: systemPrompt,
  messages: messages,
  tools: tools,
});

// Stream events
stream.on("text", (text) => {
  process.stdout.write(text);  // print token-by-token
});

// After stream completes
const finalMessage = await stream.finalMessage();
// finalMessage.content → ContentBlock[]
// finalMessage.stop_reason → "end_turn" | "tool_use" | "max_tokens"
// finalMessage.usage → { input_tokens, output_tokens }
```

### `src/types.ts` — Type Definitions

As defined in Section 2 above. Pure types, no logic.

---

## 4. Tool Definitions (Display Only)

M1 sends tool schemas to the API so LLM knows tools exist, but does NOT execute them. This lets us see the `tool_use` response format.

```typescript
// Dummy tools — sent to API but not executed in M1
const M1_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "bash",
    description: "Execute a bash command",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to execute" }
      },
      required: ["command"]
    }
  }
];
```

Khi LLM trả về `tool_use`, hiển thị:

```
[Tool Call] read_file
{
  "path": "package.json"
}

(Tool execution not implemented yet — will be added in M4)
```

Khi LLM trả về nhiều tool calls trong 1 response:

```
[Tool Call 1/2] read_file
{
  "path": "package.json"
}

[Tool Call 2/2] bash
{
  "command": "ls -la"
}

(Tool execution not implemented yet — will be added in M4)
```

---

## 5. System Prompt

```typescript
const SYSTEM_PROMPT = `You are Clawd, an AI assistant running in a terminal.
You can help with coding tasks, answer questions, and use tools when needed.

Available tools: read_file, write_file, bash.
When you need to perform an action, use the appropriate tool.

Keep responses concise and helpful.`;
```

---

## 6. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| `ANTHROPIC_API_KEY` not set | Print error message: `"Error: ANTHROPIC_API_KEY not set. Export it or add to .env"`, exit with code 1 |
| Empty input (user presses Enter) | Skip, show prompt again |
| API returns 401 (invalid key) | Print `"Error: Invalid API key"`, exit with code 1 |
| API returns 429 (rate limit) | Print `"Rate limited. Waiting {retry_after}s..."`, auto-retry once. If fails again, print error and continue accepting input |
| API returns 500/503 (server error) | Print `"API error: {status}. Try again."`, continue accepting input |
| Network error (no internet) | Print `"Connection error: {message}. Check your internet."`, continue accepting input |
| Stream interrupted mid-response | Print whatever was received + `"\n[Stream interrupted]"`, continue accepting input |
| Response has `stop_reason: "max_tokens"` | Print response + `"\n[Response truncated — max tokens reached]"` |
| Very long user input (>10000 chars) | Send as-is, let API handle. No client-side truncation |
| Ctrl+C during streaming | Abort the stream, print newline, show prompt again (don't exit) |
| Ctrl+C at prompt | Exit cleanly with `"Goodbye!"` |
| Mixed content (text + tool_use in same response) | Print text parts as streaming, then tool calls as formatted JSON |

---

## 7. Acceptance Criteria

Mỗi item phải pass trước khi M1 coi là hoàn thành:

### Functional

- [ ] `bun run src/index.ts` khởi động, hiển thị welcome message
- [ ] Gõ text → nhận streaming response (từng token hiện ra, không đợi hết)
- [ ] Chat 5 turns liên tiếp → AI nhớ context (reference câu trước)
- [ ] Gõ "Read file package.json" → LLM trả về `tool_use` block → hiển thị formatted JSON
- [ ] LLM trả về mixed content (text + tool_use) → cả 2 hiển thị đúng
- [ ] Hiển thị token usage sau mỗi response `[tokens: X in / Y out]`
- [ ] Enter trống → skip, hiện prompt lại
- [ ] Ctrl+C tại prompt → thoát sạch với "Goodbye!"

### Error handling

- [ ] Chạy không có `ANTHROPIC_API_KEY` → error message rõ ràng, exit code 1
- [ ] API trả 429 → hiển thị message, auto-retry 1 lần
- [ ] Mất mạng → error message, tiếp tục nhận input

### Code quality

- [ ] TypeScript strict mode, không có `any` type
- [ ] Types tách riêng file `types.ts`
- [ ] API logic tách riêng `providers/anthropic.ts`
- [ ] Không hardcode API key trong source
- [ ] `.env` trong `.gitignore`

---

## 8. File Structure (final)

```
src/
├── index.ts              ← ~80 lines: main loop, input handling, output formatting
├── providers/
│   └── anthropic.ts      ← ~70 lines: SDK init, stream handling, response parsing
└── types.ts              ← ~40 lines: interfaces only
package.json
tsconfig.json
.env                      ← gitignored
.gitignore
```

Estimated total: ~190 lines of code.

---

## 9. What is NOT in M1

Những thứ có thể bạn muốn thêm nhưng **chưa nên** ở M1:

- Tool execution (M4)
- Multiple LLM providers (enhancement sau)
- Config file (M2+)
- Database / persistence (M2)
- HTTP server (M2)
- WebSocket (M2)
- System prompt from file (M3)
- Any UI beyond terminal (M10)
