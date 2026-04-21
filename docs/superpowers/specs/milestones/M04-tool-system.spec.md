# M4 Feature Spec: Tool System

> Spec chi tiết cho implementation. Đọc `M04-tool-system.md` trước để hiểu scope và concepts.

---

## 1. Project Setup

### Dependencies

Không cần thêm dependency mới. Dùng Bun built-in APIs:
- `Bun.spawn()` cho bash tool
- `Bun.file()` cho read/write file
- `node:fs` cho glob (via `import { readdir } from "node:fs/promises"`)
- `node:path` cho path resolution

### Environment

```bash
# .env — thêm 1 biến mới
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # optional
AGENT_WORKSPACE=/path/to/project          # optional — default: process.cwd()
```

### Run commands

```bash
bun run dev        # Start server on port 3456 (không thay đổi)
```

---

## 2. Data Structures

```typescript
// src/types.ts — thêm mới

// Tool result block — LLM nhận lại kết quả tool execution
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// Mở rộng ContentBlock để include tool_result
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// Thêm ToolResultMessage cho conversation history
export interface ToolResultMessage {
  role: "user";
  content: ToolResultBlock[];
}

// Mở rộng Message union
export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// --- Tool System Types ---

// Handler function signature — nhận input, trả về string result
export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

// Tool registration entry — schema + handler
export interface ToolEntry {
  definition: ToolDefinition;  // đã có từ M1: name, description, input_schema
  handler: ToolHandler;
}
```

> **Lưu ý:** `ToolDefinition` đã tồn tại trong `types.ts` từ M1. Không cần thay đổi.
> `ToolResultBlock` và `ToolResultMessage` cần thêm vì Claude API yêu cầu tool results được gửi dưới dạng user message với `content: [{ type: "tool_result", ... }]`.

---

## 3. File Specifications

### `src/tools/sandbox.ts` — Path validation & command filtering

**Responsibility:** Xác định workspace root, validate path nằm trong workspace, filter dangerous bash commands.

```typescript
// Workspace root — resolved once at import time
const WORKSPACE = resolve(process.env.AGENT_WORKSPACE ?? process.cwd());

export function getWorkspace(): string
// Return WORKSPACE

export function validatePath(inputPath: string): string
// 1. resolve(WORKSPACE, inputPath) → absolute path
// 2. Nếu absolute path không startsWith WORKSPACE → throw Error("path outside workspace")
// 3. Return absolute path
// Handles: relative paths ("./src/foo"), absolute paths ("/etc/passwd"),
//          traversal ("../../etc/passwd"), symlinks (resolve trước khi check)

export function validateBashCommand(command: string): void
// Block list — throw Error nếu command chứa:
//   rm -rf /
//   mkfs
//   dd if=
//   :(){ :|:& };:  (fork bomb pattern)
// Chỉ block các pattern RÕ RÀNG nguy hiểm. Không over-filter.
// VD: "rm file.txt" → OK. "rm -rf /" → BLOCKED.
```

**Tại sao đơn giản:** M4 chỉ cần basic sandbox. Chroot/container-level isolation là M7+ scope.

---

### `src/tools/schemas.ts` — JSON Schema definitions cho 5 tools

**Responsibility:** Export array `ToolDefinition[]` gửi cho Claude API qua `tools` parameter.

```typescript
import type { ToolDefinition } from "../types.ts";

export const TOOL_SCHEMAS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file. Returns the full text content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "Content to write" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "bash",
    description: "Run a shell command and return its output. Timeout: 30 seconds.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" }
      },
      required: ["command"]
    }
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern. Returns newline-separated list of matching paths relative to workspace.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. '**/*.ts', 'src/**/*.js')" }
      },
      required: ["pattern"]
    }
  },
  {
    name: "grep",
    description: "Search file contents for a regex pattern. Returns matching lines with file path and line number.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "File or directory to search in (default: workspace root)" }
      },
      required: ["pattern"]
    }
  }
];
```

---

### `src/tools/handlers/read-file.ts`

```typescript
import { validatePath } from "../sandbox.ts";

export async function readFile(input: Record<string, unknown>): Promise<string>
// 1. path = validatePath(input.path as string)
// 2. file = Bun.file(path)
// 3. if (!await file.exists()) → throw Error("file not found: {path}")
// 4. return await file.text()
```

---

### `src/tools/handlers/write-file.ts`

```typescript
import { validatePath } from "../sandbox.ts";

export async function writeFile(input: Record<string, unknown>): Promise<string>
// 1. path = validatePath(input.path as string)
// 2. content = input.content as string
// 3. await Bun.write(path, content)
// 4. return "wrote {content.length} bytes to {relative path}"
```

---

### `src/tools/handlers/bash.ts`

```typescript
import { validateBashCommand } from "../sandbox.ts";
import { getWorkspace } from "../sandbox.ts";

const TIMEOUT_MS = 30_000;

export async function bash(input: Record<string, unknown>): Promise<string>
// 1. command = input.command as string
// 2. validateBashCommand(command) — throws if dangerous
// 3. proc = Bun.spawn(["sh", "-c", command], {
//      cwd: getWorkspace(),
//      stdout: "pipe",
//      stderr: "pipe",
//    })
// 4. timeout = setTimeout(() => proc.kill(), TIMEOUT_MS)
// 5. stdout = await new Response(proc.stdout).text()
//    stderr = await new Response(proc.stderr).text()
// 6. clearTimeout(timeout)
// 7. exitCode = proc.exitCode
// 8. if exitCode !== 0: return "exit code {exitCode}\nstderr: {stderr}\nstdout: {stdout}"
// 9. return stdout (trim)
// Nếu proc bị kill bởi timeout → return "command timed out after 30s"
```

---

### `src/tools/handlers/glob.ts`

```typescript
import { getWorkspace } from "../sandbox.ts";

export async function glob(input: Record<string, unknown>): Promise<string>
// 1. pattern = input.pattern as string
// 2. globResult = new Bun.Glob(pattern)
// 3. matches: string[] = []
// 4. for await (const path of globResult.scan({ cwd: getWorkspace() })):
//      matches.push(path)
// 5. if matches.length === 0 → return "no files matched"
// 6. return matches.join("\n")
```

> Dùng `Bun.Glob` — built-in, không cần dependency.

---

### `src/tools/handlers/grep.ts`

```typescript
import { validatePath, getWorkspace } from "../sandbox.ts";
import { resolve } from "node:path";

export async function grep(input: Record<string, unknown>): Promise<string>
// 1. pattern = input.pattern as string — raw regex string
// 2. searchPath = input.path ? validatePath(input.path as string) : getWorkspace()
// 3. regex = new RegExp(pattern) — wrap in try/catch, throw "invalid regex" if fails
// 4. Nếu searchPath là file:
//      content = await Bun.file(searchPath).text()
//      return matchLines(content, regex, relative path)
// 5. Nếu searchPath là directory:
//      walk directory recursively (skip node_modules, .git, binary files)
//      cho mỗi file: matchLines(content, regex, relative path)
//      gom kết quả
// 6. if no matches → return "no matches found"
// 7. return results.join("\n")
//
// matchLines helper:
//   split content by \n
//   for each line: if regex.test(line) → "{filePath}:{lineNumber}: {line}"
```

---

### `src/tools/registry.ts` — Tool registry

**Responsibility:** Map tool name → handler. Lookup và execute.

```typescript
import type { ToolEntry, ToolHandler, ToolDefinition } from "../types.ts";
import { TOOL_SCHEMAS } from "./schemas.ts";
import { readFile } from "./handlers/read-file.ts";
import { writeFile } from "./handlers/write-file.ts";
import { bash } from "./handlers/bash.ts";
import { glob } from "./handlers/glob.ts";
import { grep } from "./handlers/grep.ts";

const registry = new Map<string, ToolHandler>();

// Register all built-in tools
registry.set("read_file", readFile);
registry.set("write_file", writeFile);
registry.set("bash", bash);
registry.set("glob", glob);
registry.set("grep", grep);

export function getToolSchemas(): ToolDefinition[]
// Return TOOL_SCHEMAS

export function getToolHandler(name: string): ToolHandler | undefined
// Return registry.get(name)

export async function executeTool(name: string, input: Record<string, unknown>): Promise<{ result: string; isError: boolean }>
// 1. handler = getToolHandler(name)
// 2. if (!handler) → return { result: "unknown tool: {name}", isError: true }
// 3. try: result = await handler(input)
//    return { result, isError: false }
// 4. catch (err): return { result: err.message, isError: true }
```

> **FE analogy:** Registry = Redux reducer registry. `executeTool` = `dispatch(action)` → tìm reducer theo type, execute, trả kết quả.

---

### `src/agent/worker-loop.ts` — Update: tool execution loop

**Thay đổi:** Sau khi nhận response từ LLM, check `stopReason`. Nếu `"tool_use"` → execute tools → append tool_result → gọi LLM lại. Lặp cho đến khi `stopReason !== "tool_use"`.

```typescript
// THÊM imports:
import { getToolSchemas, executeTool } from "../tools/registry.ts";
import type { ToolResultBlock } from "../types.ts";

// THAY ĐỔI trong tick():
// Sau bước 5 (map history → messages), thêm:

// 6. Call LLM WITH tools
const tools = getToolSchemas();
const systemPrompt = buildSystemPrompt(this.agent.name, this.agent.system_prompt);
let result = await sendMessage(messages, { model: this.agent.model, systemPrompt, tools });

// 7. Tool execution loop
const MAX_TOOL_ITERATIONS = 10;
let iterations = 0;

while (result.stopReason === "tool_use" && iterations < MAX_TOOL_ITERATIONS) {
  iterations++;

  // a. Append assistant response (with tool_use blocks) to messages
  messages.push({ role: "assistant", content: result.content });

  // b. Execute each tool_use block
  const toolResults: ToolResultBlock[] = [];
  for (const block of result.content) {
    if (block.type === "tool_use") {
      const { result: toolResult, isError } = await executeTool(block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: toolResult,
        is_error: isError,
      });
    }
  }

  // c. Append tool results as user message
  messages.push({ role: "user", content: toolResults });

  // d. Call LLM again
  result = await sendMessage(messages, { model: this.agent.model, systemPrompt, tools });
}

// 8. Extract text (giữ nguyên logic cũ)
```

**Không lưu tool_use/tool_result vào DB.** DB chỉ lưu text content cuối cùng. Conversation history cho LLM được build từ DB messages + tool loop diễn ra trong memory trong 1 tick.

**MAX_TOOL_ITERATIONS = 10:** Safety net. Nếu LLM liên tục gọi tool mà không bao giờ end_turn, dừng sau 10 vòng. Log warning.

---

### `src/providers/anthropic.ts` — Update: handle tool_result in messages

**Thay đổi:** `sendMessage()` cần map `ToolResultBlock` đúng format cho Claude API.

```typescript
// Trong sendMessage(), sửa apiMessages mapping:
const apiMessages = messages.map((msg) => {
  if (msg.role === "user") {
    // Có thể là string content (user message) hoặc ToolResultBlock[] (tool results)
    if (typeof msg.content === "string") {
      return { role: "user" as const, content: msg.content };
    }
    // Tool result message — content là ToolResultBlock[]
    return {
      role: "user" as const,
      content: msg.content.map((block) => ({
        type: "tool_result" as const,
        tool_use_id: (block as ToolResultBlock).tool_use_id,
        content: (block as ToolResultBlock).content,
        ...(block as ToolResultBlock).is_error ? { is_error: true } : {},
      })),
    };
  }
  // assistant message — giữ nguyên
  return { ... }; // không thay đổi
});
```

---

### `src/server/router.ts` — Update: stream endpoint truyền tools

**Thay đổi nhỏ:** Route `POST /channels/:id/messages/stream` cần truyền `tools` vào `sendMessage` nếu muốn streaming endpoint cũng dùng tools.

**KHÔNG thay đổi ở M4.** Stream endpoint dùng `streamAssistantText()` (text-only streaming). Tool execution chỉ xảy ra trong worker loop (polling). Stream endpoint sẽ hỗ trợ tools ở milestone sau nếu cần.

---

## 4. Edge Cases & Error Handling

| Scenario | Behavior |
|---|---|
| `read_file("../../etc/passwd")` | `validatePath` throws "path outside workspace" → tool_result `is_error: true` |
| `read_file("nonexistent.txt")` | Handler throws "file not found" → tool_result `is_error: true` |
| `write_file` to nested dir that doesn't exist | `Bun.write()` tự tạo parent directories → OK |
| `bash("rm -rf /")` | `validateBashCommand` throws → tool_result `is_error: true` |
| `bash("sleep 60")` | Timeout 30s → kill process → return "command timed out" |
| `bash("exit 1")` | Return exit code + stderr trong result (không phải error) |
| `glob("**/*.ts")` trong empty dir | Return "no files matched" |
| `grep` với invalid regex | `new RegExp()` throws → tool_result `is_error: true` |
| LLM gọi tool không tồn tại | `executeTool` return "unknown tool" `is_error: true` |
| LLM gọi tools 11 lần liên tục | Dừng sau 10, log warning, trả text response có được |
| `bash` command output rất lớn (>100KB) | Truncate stdout tới 100KB, append "[truncated]" |

---

## 5. Acceptance Criteria

### Functional

- [ ] Agent trong channel, user gửi "Read file package.json" → agent gọi `read_file` → trả nội dung file
- [ ] User gửi "Create file hello.txt with content Hello World" → agent gọi `write_file` → file tạo đúng
- [ ] User gửi "Run ls -la" → agent gọi `bash` → trả directory listing
- [ ] User gửi "Find all .ts files" → agent gọi `glob` → trả danh sách files
- [ ] User gửi "Search for TODO in all files" → agent gọi `grep` → trả matching lines
- [ ] User gửi "Read /etc/passwd" → `read_file` bị block bởi sandbox → agent nhận error, trả lời user
- [ ] Agent chains tools: "Read file X and tell me how many lines it has" → read_file → text response
- [ ] `bash("sleep 60")` bị kill sau 30s → agent nhận timeout message

### Tool loop

- [ ] Worker loop detect `stopReason: "tool_use"` → execute → append result → call LLM again
- [ ] Loop dừng khi LLM trả `stopReason: "end_turn"` (text response)
- [ ] Loop dừng sau MAX_TOOL_ITERATIONS (10) nếu LLM không dừng

### Sandbox

- [ ] Path traversal `../../etc/passwd` → blocked
- [ ] Absolute path `/etc/passwd` → blocked
- [ ] Relative path `src/server.ts` → allowed (within workspace)
- [ ] `rm -rf /` → blocked by command filter

### Code quality

- [ ] TypeScript strict mode, không có `any` type
- [ ] Mỗi tool handler là 1 file riêng — dễ test, dễ thêm tool mới
- [ ] `executeTool` wrap tất cả errors — worker loop không bao giờ crash vì tool error
- [ ] Tool schemas gửi đúng format cho Claude API `tools` parameter

---

## 6. File Structure (final)

```
src/
├── server.ts                  ← ~35 lines (không thay đổi)
├── tools/                     ← MỚI
│   ├── registry.ts            ← ~40 lines: register + executeTool
│   ├── schemas.ts             ← ~60 lines: 5 tool definitions
│   ├── sandbox.ts             ← ~40 lines: validatePath, validateBashCommand
│   └── handlers/
│       ├── read-file.ts       ← ~15 lines
│       ├── write-file.ts      ← ~15 lines
│       ├── bash.ts            ← ~35 lines (spawn + timeout)
│       ├── glob.ts            ← ~20 lines
│       └── grep.ts            ← ~45 lines (recursive walk + match)
├── agent/
│   ├── worker-loop.ts         ← ~130 lines (+50 lines: tool execution loop)
│   ├── worker-manager.ts      ← ~35 lines (không thay đổi)
│   └── system-prompt.ts       ← ~15 lines (không thay đổi)
├── server/
│   ├── database.ts            ← ~200 lines (không thay đổi)
│   ├── router.ts              ← ~320 lines (không thay đổi)
│   ├── stream-message.ts      ← (không thay đổi)
│   ├── sse.ts                 ← (không thay đổi)
│   └── logger.ts              ← (không thay đổi)
├── providers/
│   └── anthropic.ts           ← ~135 lines (+5 lines: handle ToolResultBlock mapping)
└── types.ts                   ← ~105 lines (+15 lines: ToolResultBlock, ToolHandler, ToolEntry)

Estimated new code: ~270 lines (tools/ folder).
Modified code: ~55 lines (worker-loop + anthropic + types).
Total codebase: ~900 lines.
```

---

## 7. What is NOT in M4

- Tool streaming (M5+ — tool output streamed to client real-time)
- Dynamic tool registration via API (tools are hardcoded in registry)
- Chroot / container-level sandbox (M7+ scope)
- Tool permissions per agent (all agents get all tools)
- File watching / change notifications
- Tool history / audit log in DB
- Edit file tool (surgical edits — too complex for M4, write_file covers basic case)
- Token counting for tool results (M5)
- Stream endpoint tool support (stream endpoint remains text-only)
