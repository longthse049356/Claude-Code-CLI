# M4 Tool System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tool system so agents can read files, write files, run shell commands, find files, and search code. This transforms the chatbot into a coding agent.

**Architecture:** Tool registry maps `name → handler`. Each handler is a separate file. Sandbox validates paths stay within workspace and blocks dangerous commands. Worker loop detects `stopReason: "tool_use"` → executes tools → appends `tool_result` → calls LLM again, up to 10 iterations.

**Tech Stack:** Bun runtime, `bun:sqlite`, `@anthropic-ai/sdk`, TypeScript strict mode.

**Spec:** `docs/superpowers/specs/milestones/M04-tool-system.spec.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types.ts` | Add `ToolResultBlock`, `ToolHandler`, `ToolEntry`, extend `Message` union |
| Create | `src/tools/sandbox.ts` | `getWorkspace()`, `validatePath()`, `validateBashCommand()` |
| Create | `src/tools/handlers/read-file.ts` | Read file contents via `Bun.file()` |
| Create | `src/tools/handlers/write-file.ts` | Write file contents via `Bun.write()` |
| Create | `src/tools/handlers/glob.ts` | Find files via `Bun.Glob` |
| Create | `src/tools/handlers/grep.ts` | Search file contents via regex |
| Create | `src/tools/handlers/bash.ts` | Run shell commands via `Bun.spawn()` with 30s timeout |
| Create | `src/tools/schemas.ts` | JSON Schema definitions for 5 tools |
| Create | `src/tools/registry.ts` | Tool registry: name → handler mapping + `executeTool()` |
| Modify | `src/providers/anthropic.ts` | Handle `ToolResultBlock[]` in message mapping |
| Modify | `src/agent/worker-loop.ts` | Tool execution loop: detect tool_use → execute → loop |

---

## Task 1: Add tool types to src/types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add new types after the existing `ToolDefinition` interface**

Find this block in `src/types.ts`:

```typescript
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

Add AFTER it (before `// --- Database Models ---`):

```typescript
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}
```

- [ ] **Step 2: Extend Message union to accept tool result messages**

Find this block:

```typescript
export type Message = UserMessage | AssistantMessage;
```

Replace with:

```typescript
export interface ToolResultMessage {
  role: "user";
  content: ToolResultBlock[];
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors. Existing code still works because `Message` union is only extended, not changed.

---

## Task 2: Create src/tools/sandbox.ts

**Files:**
- Create: `src/tools/sandbox.ts`

- [ ] **Step 1: Create the file**

Create `src/tools/sandbox.ts`:

```typescript
import { resolve } from "node:path";

const WORKSPACE = resolve(process.env.AGENT_WORKSPACE ?? process.cwd());

export function getWorkspace(): string {
  return WORKSPACE;
}

export function validatePath(inputPath: string): string {
  const absolute = resolve(WORKSPACE, inputPath);
  if (!absolute.startsWith(WORKSPACE)) {
    throw new Error(`path outside workspace: ${inputPath}`);
  }
  return absolute;
}

const BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd if=",
  ":(){ :|:& };:",
];

export function validateBashCommand(command: string): void {
  for (const blocked of BLOCKED_COMMANDS) {
    if (command.includes(blocked)) {
      throw new Error(`blocked command: ${blocked}`);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

---

## Task 3: Create tool handlers (5 files)

**Files:**
- Create: `src/tools/handlers/read-file.ts`
- Create: `src/tools/handlers/write-file.ts`
- Create: `src/tools/handlers/glob.ts`
- Create: `src/tools/handlers/grep.ts`
- Create: `src/tools/handlers/bash.ts`

- [ ] **Step 1: Create `src/tools/handlers/read-file.ts`**

```typescript
import { validatePath } from "../sandbox.ts";

export async function readFile(input: Record<string, unknown>): Promise<string> {
  const path = validatePath(input.path as string);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`file not found: ${input.path}`);
  }
  return await file.text();
}
```

- [ ] **Step 2: Create `src/tools/handlers/write-file.ts`**

```typescript
import { relative } from "node:path";
import { validatePath, getWorkspace } from "../sandbox.ts";

export async function writeFile(input: Record<string, unknown>): Promise<string> {
  const path = validatePath(input.path as string);
  const content = input.content as string;
  await Bun.write(path, content);
  const rel = relative(getWorkspace(), path);
  return `wrote ${content.length} bytes to ${rel}`;
}
```

- [ ] **Step 3: Create `src/tools/handlers/glob.ts`**

```typescript
import { getWorkspace } from "../sandbox.ts";

export async function glob(input: Record<string, unknown>): Promise<string> {
  const pattern = input.pattern as string;
  const g = new Bun.Glob(pattern);
  const matches: string[] = [];
  for await (const path of g.scan({ cwd: getWorkspace() })) {
    matches.push(path);
  }
  if (matches.length === 0) return "no files matched";
  matches.sort();
  return matches.join("\n");
}
```

- [ ] **Step 4: Create `src/tools/handlers/grep.ts`**

```typescript
import { resolve, relative } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { validatePath, getWorkspace } from "../sandbox.ts";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next"]);
const MAX_RESULTS = 200;

export async function grep(input: Record<string, unknown>): Promise<string> {
  const pattern = input.pattern as string;
  const searchPath = input.path
    ? validatePath(input.path as string)
    : getWorkspace();

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    throw new Error(`invalid regex: ${pattern}`);
  }

  const results: string[] = [];

  async function searchFile(filePath: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;
    try {
      const content = await Bun.file(filePath).text();
      const lines = content.split("\n");
      const rel = relative(getWorkspace(), filePath);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push(`${rel}:${i + 1}: ${lines[i]}`);
          if (results.length >= MAX_RESULTS) return;
        }
      }
    } catch {
      // skip binary or unreadable files
    }
  }

  async function walk(dir: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(resolve(dir, entry.name));
      } else if (entry.isFile()) {
        await searchFile(resolve(dir, entry.name));
      }
    }
  }

  const info = await stat(searchPath);
  if (info.isFile()) {
    await searchFile(searchPath);
  } else {
    await walk(searchPath);
  }

  if (results.length === 0) return "no matches found";
  return results.join("\n");
}
```

- [ ] **Step 5: Create `src/tools/handlers/bash.ts`**

```typescript
import { validateBashCommand, getWorkspace } from "../sandbox.ts";

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 100_000;

export async function bash(input: Record<string, unknown>): Promise<string> {
  const command = input.command as string;
  validateBashCommand(command);

  const proc = Bun.spawn(["sh", "-c", command], {
    cwd: getWorkspace(),
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, TIMEOUT_MS);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  clearTimeout(timer);

  if (timedOut) {
    return "command timed out after 30s";
  }

  const exitCode = proc.exitCode;

  if (exitCode !== 0) {
    const output = `exit code ${exitCode}\nstderr: ${stderr}\nstdout: ${stdout}`;
    return output.length > MAX_OUTPUT ? output.slice(0, MAX_OUTPUT) + "\n[truncated]" : output;
  }

  const result = stdout.trim();
  return result.length > MAX_OUTPUT ? result.slice(0, MAX_OUTPUT) + "\n[truncated]" : result;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

---

## Task 4: Create src/tools/schemas.ts

**Files:**
- Create: `src/tools/schemas.ts`

- [ ] **Step 1: Create the file**

Create `src/tools/schemas.ts`:

```typescript
import type { ToolDefinition } from "../types.ts";

export const TOOL_SCHEMAS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file. Returns the full text content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "bash",
    description: "Run a shell command and return its output. Timeout: 30 seconds.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern. Returns newline-separated list of matching paths relative to workspace.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. '**/*.ts', 'src/**/*.js')" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Search file contents for a regex pattern. Returns matching lines with file path and line number.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "File or directory to search in (default: workspace root)" },
      },
      required: ["pattern"],
    },
  },
];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

---

## Task 5: Create src/tools/registry.ts

**Files:**
- Create: `src/tools/registry.ts`

- [ ] **Step 1: Create the file**

Create `src/tools/registry.ts`:

```typescript
import type { ToolDefinition, ToolHandler } from "../types.ts";
import { TOOL_SCHEMAS } from "./schemas.ts";
import { readFile } from "./handlers/read-file.ts";
import { writeFile } from "./handlers/write-file.ts";
import { bash } from "./handlers/bash.ts";
import { glob } from "./handlers/glob.ts";
import { grep } from "./handlers/grep.ts";

const registry = new Map<string, ToolHandler>();

registry.set("read_file", readFile);
registry.set("write_file", writeFile);
registry.set("bash", bash);
registry.set("glob", glob);
registry.set("grep", grep);

export function getToolSchemas(): ToolDefinition[] {
  return TOOL_SCHEMAS;
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return registry.get(name);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ result: string; isError: boolean }> {
  const handler = getToolHandler(name);
  if (!handler) {
    return { result: `unknown tool: ${name}`, isError: true };
  }
  try {
    const result = await handler(input);
    return { result, isError: false };
  } catch (err) {
    return { result: (err as Error).message, isError: true };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

---

## Task 6: Update src/providers/anthropic.ts — handle ToolResultBlock

**Files:**
- Modify: `src/providers/anthropic.ts`

- [ ] **Step 1: Add ToolResultBlock import**

Find this line at the top of `src/providers/anthropic.ts`:

```typescript
import type { Message, StreamResult, ToolDefinition } from "../types.ts";
```

Replace with:

```typescript
import type { Message, StreamResult, ToolDefinition, ToolResultBlock } from "../types.ts";
```

- [ ] **Step 2: Update message mapping in `sendMessage()` to handle tool results**

Find this block inside `sendMessage()`:

```typescript
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
```

Replace with:

```typescript
  const apiMessages = messages.map((msg) => {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        return { role: "user" as const, content: msg.content };
      }
      return {
        role: "user" as const,
        content: (msg.content as ToolResultBlock[]).map((block) => ({
          type: "tool_result" as const,
          tool_use_id: block.tool_use_id,
          content: block.content,
          ...(block.is_error ? { is_error: true } : {}),
        })),
      };
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
```

**Explanation:** User messages can now be either a plain `string` (normal user text) or a `ToolResultBlock[]` (tool execution results sent back to Claude). The `typeof msg.content === "string"` check distinguishes between the two cases.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

---

## Task 7: Update src/agent/worker-loop.ts — tool execution loop

**Files:**
- Modify: `src/agent/worker-loop.ts`

This is the core change. The worker loop currently calls the LLM once and extracts text. After this change, it will loop when the LLM wants to use tools.

- [ ] **Step 1: Add tool imports**

Find the imports at the top of `src/agent/worker-loop.ts`. Add these lines:

```typescript
import { getToolSchemas, executeTool } from "../tools/registry.ts";
import type { ToolResultBlock } from "../types.ts";
```

- [ ] **Step 2: Replace the LLM call + text extraction block**

Inside `tick()`, find the block that starts with:

```typescript
          // 6. Call LLM
          const systemPrompt = buildSystemPrompt(this.agent.name, this.agent.system_prompt);
          const result = await sendMessage(messages, { model: this.agent.model, systemPrompt });

          // 7. Extract text from response
          const replyText = result.content
```

Replace everything from step 6 through step 8 (the `createMessage` and log line) with:

```typescript
          // 6. Call LLM with tools
          const tools = getToolSchemas();
          const systemPrompt = buildSystemPrompt(this.agent.name, this.agent.system_prompt);
          let result = await sendMessage(messages, { model: this.agent.model, systemPrompt, tools });

          // 7. Tool execution loop
          const MAX_TOOL_ITERATIONS = 10;
          let iterations = 0;

          while (result.stopReason === "tool_use" && iterations < MAX_TOOL_ITERATIONS) {
            iterations++;
            log(`[WORKER] ${this.agent.name} — tool iteration ${iterations}`);

            messages.push({ role: "assistant", content: result.content });

            const toolResults: ToolResultBlock[] = [];
            for (const block of result.content) {
              if (block.type === "tool_use") {
                log(`[WORKER] ${this.agent.name} — executing tool "${block.name}"`);
                const { result: toolResult, isError } = await executeTool(block.name, block.input);
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: toolResult,
                  ...(isError ? { is_error: true } : {}),
                });
              }
            }

            messages.push({ role: "user", content: toolResults });
            result = await sendMessage(messages, { model: this.agent.model, systemPrompt, tools });
          }

          if (iterations >= MAX_TOOL_ITERATIONS) {
            log(`[WORKER] ${this.agent.name} — hit max tool iterations (${MAX_TOOL_ITERATIONS})`);
          }

          // 8. Extract text from final response
          const replyText = result.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { type: "text"; text: string }).text)
            .join("");

          if (!replyText.trim()) {
            log(`[WORKER] ${this.agent.name} — LLM returned empty text, skipping reply`);
          } else {
            // 9. Save reply to DB
            const reply = {
              id: crypto.randomUUID(),
              channel_id: this.agent.channel_id,
              text: replyText,
              role: "assistant" as const,
              agent_name: this.agent.name,
              created_at: Date.now(),
            };
            createMessage(reply);
            log(`[WORKER] ${this.agent.name} — replied: "${replyText.slice(0, 60)}..."`);
          }
```

**Key points:**
- `messages` array is built from DB history (text only), then tool_use/tool_result blocks are appended IN MEMORY during the loop
- Tool results are NOT saved to DB — only the final text reply is persisted
- Each tool is executed sequentially (for simplicity — parallel tool execution is M5+ scope)
- `is_error` flag tells Claude the tool failed, so it can adjust its approach

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
bun test
```

Expected: all existing tests pass. Worker loop changes don't affect unit tests since the loop requires a live LLM connection.

---

## Task 8: Integration smoke test

> This verifies all acceptance criteria from the spec using manual curl commands.

- [ ] **Step 1: Start server**

```bash
bun run dev
```

Expected: server starts on port 3456.

- [ ] **Step 2: Create channel + agent**

```bash
# Create channel
curl -s -X POST http://localhost:3456/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}' | jq .

# Copy the channel ID, then create agent
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/agents \
  -H "Content-Type: application/json" \
  -d '{"name":"coder"}' | jq .
```

- [ ] **Step 3: Test read_file tool**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Read the file package.json and tell me the project name"}'
```

Wait a few seconds, then check messages:

```bash
curl -s http://localhost:3456/channels/CHANNEL_ID/messages | jq '.[-1].text'
```

Expected: agent's reply contains the project name from package.json. Server logs should show `executing tool "read_file"`.

- [ ] **Step 4: Test write_file tool**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Create a file called test-m4.txt with the content: Hello from M4 tool system"}'
```

Wait, then verify:

```bash
cat test-m4.txt
```

Expected: file contains "Hello from M4 tool system".

- [ ] **Step 5: Test bash tool**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Run the command: ls -la src/tools/"}'
```

Expected: agent replies with directory listing of src/tools/.

- [ ] **Step 6: Test glob tool**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Find all TypeScript files in the src directory"}'
```

Expected: agent replies with list of .ts files.

- [ ] **Step 7: Test grep tool**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Search for the word TODO in all source files"}'
```

Expected: agent replies with matching lines or says no matches found.

- [ ] **Step 8: Test sandbox — path traversal blocked**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Read the file /etc/passwd"}'
```

Expected: agent says the path is blocked/outside workspace. Server logs show `is_error: true`.

- [ ] **Step 9: Test tool chaining**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Read package.json and tell me how many dependencies are listed"}'
```

Expected: agent calls read_file, then responds with the count. Server logs show tool iteration.

- [ ] **Step 10: Cleanup test files**

```bash
rm -f test-m4.txt
```

---

## Acceptance Criteria Checklist

- [ ] Agent calls `read_file` tool and returns file contents
- [ ] Agent calls `write_file` tool and creates/overwrites file
- [ ] Agent calls `bash` tool and returns command output
- [ ] Agent calls `glob` tool and returns file list
- [ ] Agent calls `grep` tool and returns matching lines
- [ ] Path traversal (`/etc/passwd`, `../../etc/passwd`) is blocked by sandbox
- [ ] `bash("rm -rf /")` is blocked by command filter
- [ ] Agent chains tools: read → analyze → respond
- [ ] Tool loop stops when LLM returns `end_turn`
- [ ] Tool loop stops after MAX_TOOL_ITERATIONS (10)
- [ ] `bun test` — all existing tests still pass
- [ ] TypeScript strict mode, no `any` types
