# M3 Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polling agent loop that reads new messages every 200ms, calls the Claude API, and auto-replies — turning the M2 chat server into an AI-powered chat system.

**Architecture:** Each agent runs a `WorkerLoop` (recursive `setTimeout`, 200ms interval). A `WorkerManager` singleton holds a `Map<agentId, WorkerLoop>`. On server start, `resumeAll()` reloads agents from SQLite and restarts their loops. The loop uses a `last_processed_at` timestamp cursor so it never reprocesses messages.

**Tech Stack:** Bun runtime, `bun:sqlite`, `@anthropic-ai/sdk`, TypeScript strict mode.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types.ts` | Fix `DbMessage.role`, update `Agent`, add `CreateAgentBody`, update `WsBroadcast` |
| Modify | `src/providers/anthropic.ts` | Remove stdout side effects, remove M1 tools, handle no-tools case |
| Modify | `src/server/database.ts` | New agents schema, 7 new DB functions |
| Modify | `src/server/database.test.ts` | Tests for new agent DB functions |
| Create | `src/agent/system-prompt.ts` | `buildSystemPrompt()` utility |
| Create | `src/agent/system-prompt.test.ts` | Tests for system prompt |
| Create | `src/agent/worker-loop.ts` | `WorkerLoop` class — recursive setTimeout, LLM call, broadcast |
| Create | `src/agent/worker-manager.ts` | `startAgent`, `stopAgent`, `resumeAll` |
| Modify | `src/server/router.ts` | Add `POST /channels/:id/agents`, `DELETE /channels/:id/agents/:name` |
| Modify | `src/server.ts` | Call `resumeAll()` after `initDatabase()` |
| Modify | `chat.http` | Add agent endpoint examples |

---

## Pre-flight: Delete chat.db

> The agents table schema changes (adds `model`, `system_prompt`, `last_processed_at`). Since `chat.db` is a dev-only file, delete it before running M3 so SQLite recreates from the new schema.

```bash
rm -f chat.db
```

---

## Task 1: Fix src/types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Update `DbMessage`, `Agent`, `WsBroadcast`; add `CreateAgentBody`**

Replace everything from `// --- Database Models (M2) ---` to the end of the file with:

```typescript
// --- Database Models ---

export interface Channel {
  id: string;
  name: string;
  created_at: number;
}

export interface DbMessage {
  id: string;
  channel_id: string;
  text: string;
  role: "user" | "assistant";   // was "user" | "agent" in M2 — fixed to match Claude API
  created_at: number;
}

export interface Agent {
  id: string;
  name: string;
  channel_id: string;
  model: string;
  system_prompt: string;
  last_processed_at: number;    // Unix ms — cursor: messages before this are already processed
  created_at: number;
}

// --- HTTP Request Bodies ---

export interface CreateChannelBody {
  name: string;
}

export interface CreateMessageBody {
  text: string;
}

export interface CreateAgentBody {
  name: string;
  model?: string;
  system_prompt?: string;
}

// --- WebSocket Broadcast ---

export type WsBroadcast =
  | { type: "new_message"; data: DbMessage }
  | { type: "typing"; data: { agent_name: string; channel_id: string } };

// --- API Error Response ---

export interface ApiError {
  error: string;
}
```

> Note: `UserMessage`, `AssistantMessage`, `Message`, and all Claude API types (lines 1–49) are unchanged — keep them exactly as they are.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "fix(types): fix DbMessage.role, update Agent, add CreateAgentBody, expand WsBroadcast"
```

---

## Task 2: Clean up src/providers/anthropic.ts

**Files:**
- Modify: `src/providers/anthropic.ts`

- [ ] **Step 1: Remove stdout writes and M1_TOOLS; fix tools handling**

Replace the entire file with:

```typescript
// src/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Message, StreamResult, ToolDefinition } from "../types.ts";

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
});

export async function sendMessage(
  messages: Message[],
  options?: {
    model?: string;
    maxTokens?: number;
    tools?: ToolDefinition[];
    systemPrompt?: string;
    signal?: AbortSignal;
  }
): Promise<StreamResult> {
  const model = options?.model ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? 4096;
  const tools = options?.tools ?? [];
  const systemPrompt = options?.systemPrompt ?? "";
  const signal = options?.signal;

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

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: apiMessages,
      // Only include tools field when tools are actually defined
      ...(tools.length > 0 ? { tools: tools as Anthropic.Tool[] } : {}),
    },
    signal ? { signal } : undefined
  );

  const finalMessage = await stream.finalMessage();

  const content: StreamResult["content"] = finalMessage.content
    .filter((block) => block.type === "text" || block.type === "tool_use")
    .map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      const toolBlock = block as Anthropic.ToolUseBlock;
      return {
        type: "tool_use" as const,
        id: toolBlock.id,
        name: toolBlock.name,
        input: toolBlock.input as Record<string, unknown>,
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/providers/anthropic.ts
git commit -m "refactor(anthropic): remove stdout side effects, remove M1 tools, omit tools field when empty"
```

---

## Task 3: Add agent DB functions + tests

**Files:**
- Modify: `src/server/database.ts`
- Modify: `src/server/database.test.ts`

- [ ] **Step 1: Write failing tests for new agent DB functions**

Append to `src/server/database.test.ts`:

```typescript
import {
  createAgent,
  deleteAgent,
  getAllAgents,
  getAgent,
  getAgentByChannelAndName,
  getMessagesAfter,
  updateAgentCursor,
} from "./database.ts";
import type { Agent } from "../types.ts";

const AGENT: Agent = {
  id: "agent-1",
  name: "claude",
  channel_id: "ch-1",
  model: "claude-sonnet-4-20250514",
  system_prompt: "",
  last_processed_at: 0,
  created_at: 5000,
};

test("createAgent and getAgent round-trip", () => {
  createChannel("ch-1", "general", 1000);
  createAgent(AGENT);
  const a = getAgent("agent-1");
  expect(a).toEqual(AGENT);
});

test("getAgent returns null for unknown id", () => {
  expect(getAgent("does-not-exist")).toBeNull();
});

test("getAllAgents returns all agents", () => {
  createChannel("ch-1", "general", 1000);
  createChannel("ch-2", "random", 2000);
  createAgent({ ...AGENT, id: "a-1", channel_id: "ch-1" });
  createAgent({ ...AGENT, id: "a-2", channel_id: "ch-2", name: "bot" });
  expect(getAllAgents()).toHaveLength(2);
});

test("deleteAgent removes agent from DB", () => {
  createChannel("ch-1", "general", 1000);
  createAgent(AGENT);
  deleteAgent("agent-1");
  expect(getAgent("agent-1")).toBeNull();
});

test("updateAgentCursor persists new last_processed_at", () => {
  createChannel("ch-1", "general", 1000);
  createAgent(AGENT);
  updateAgentCursor("agent-1", 9999);
  const a = getAgent("agent-1");
  expect(a?.last_processed_at).toBe(9999);
});

test("getAgentByChannelAndName returns correct agent", () => {
  createChannel("ch-1", "general", 1000);
  createAgent(AGENT);
  const a = getAgentByChannelAndName("ch-1", "claude");
  expect(a?.id).toBe("agent-1");
});

test("getAgentByChannelAndName returns null when not found", () => {
  expect(getAgentByChannelAndName("ch-1", "nobody")).toBeNull();
});

test("getMessagesAfter returns only messages after cursor", () => {
  createChannel("ch-1", "general", 1000);
  createMessage({ id: "m-1", channel_id: "ch-1", text: "A", role: "user", created_at: 1000 });
  createMessage({ id: "m-2", channel_id: "ch-1", text: "B", role: "user", created_at: 2000 });
  createMessage({ id: "m-3", channel_id: "ch-1", text: "C", role: "user", created_at: 3000 });
  const result = getMessagesAfter("ch-1", 1500);
  expect(result).toHaveLength(2);
  expect(result[0].id).toBe("m-2");
  expect(result[1].id).toBe("m-3");
});

test("getMessagesAfter returns empty array when no new messages", () => {
  createChannel("ch-1", "general", 1000);
  expect(getMessagesAfter("ch-1", 9999)).toEqual([]);
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
bun test src/server/database.test.ts
```

Expected: failing with "createAgent is not a function" or similar.

- [ ] **Step 3: Update schema and add agent DB functions in database.ts**

Replace the `SCHEMA` constant and add all new prepared statements and functions:

```typescript
import { Database, type Statement } from "bun:sqlite";
import type { Agent, Channel, DbMessage } from "../types.ts";

let db: Database;

// Prepared statements — channels + messages (M2)
let stmtInsertChannel!: Statement;
let stmtGetChannel!: Statement;
let stmtInsertMessage!: Statement;
let stmtGetMessages!: Statement;
let stmtGetMessagesAfter!: Statement;

// Prepared statements — agents (M3)
let stmtInsertAgent!: Statement;
let stmtGetAgent!: Statement;
let stmtGetAllAgents!: Statement;
let stmtDeleteAgent!: Statement;
let stmtUpdateAgentCursor!: Statement;
let stmtGetAgentByChannelAndName!: Statement;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS channels (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT    PRIMARY KEY,
    channel_id TEXT    NOT NULL,
    text       TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );

  CREATE TABLE IF NOT EXISTS agents (
    id                 TEXT    PRIMARY KEY,
    name               TEXT    NOT NULL,
    channel_id         TEXT    NOT NULL,
    model              TEXT    NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    system_prompt      TEXT    NOT NULL DEFAULT '',
    last_processed_at  INTEGER NOT NULL DEFAULT 0,
    created_at         INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );
`;

export function initDatabase(path = "chat.db"): void {
  db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  // M2: channels + messages
  stmtInsertChannel = db.prepare(
    "INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)"
  );
  stmtGetChannel = db.prepare(
    "SELECT * FROM channels WHERE id = ?"
  );
  stmtInsertMessage = db.prepare(
    "INSERT INTO messages (id, channel_id, text, role, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  stmtGetMessages = db.prepare(
    "SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC"
  );
  stmtGetMessagesAfter = db.prepare(
    "SELECT * FROM messages WHERE channel_id = ? AND created_at > ? ORDER BY created_at ASC"
  );

  // M3: agents
  stmtInsertAgent = db.prepare(
    "INSERT INTO agents (id, name, channel_id, model, system_prompt, last_processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  stmtGetAgent = db.prepare(
    "SELECT * FROM agents WHERE id = ?"
  );
  stmtGetAllAgents = db.prepare(
    "SELECT * FROM agents"
  );
  stmtDeleteAgent = db.prepare(
    "DELETE FROM agents WHERE id = ?"
  );
  stmtUpdateAgentCursor = db.prepare(
    "UPDATE agents SET last_processed_at = ? WHERE id = ?"
  );
  stmtGetAgentByChannelAndName = db.prepare(
    "SELECT * FROM agents WHERE channel_id = ? AND name = ?"
  );

  console.log(`[DB] opened "${path}" with WAL mode`);
  console.log(`[DB] prepared statements compiled`);
}

// --- M2 functions (unchanged) ---

export function createChannel(id: string, name: string, createdAt: number): void {
  console.log(`[DB] INSERT channel — id="${id}" name="${name}"`);
  stmtInsertChannel.run(id, name, createdAt);
  console.log(`[DB] INSERT channel OK`);
}

export function getChannel(id: string): Channel | null {
  console.log(`[DB] SELECT channel — id="${id}"`);
  const result = stmtGetChannel.get(id) as Channel | null;
  console.log(`[DB] SELECT channel → ${result ? `found: "${result.name}"` : "NOT FOUND"}`);
  return result;
}

export function createMessage(msg: DbMessage): void {
  console.log(`[DB] INSERT message — id="${msg.id}" text="${msg.text}"`);
  stmtInsertMessage.run(msg.id, msg.channel_id, msg.text, msg.role, msg.created_at);
  console.log(`[DB] INSERT message OK`);
}

export function getMessagesByChannel(channelId: string): DbMessage[] {
  console.log(`[DB] SELECT messages — channel_id="${channelId}"`);
  const results = stmtGetMessages.all(channelId) as DbMessage[];
  console.log(`[DB] SELECT messages → ${results.length} row(s)`);
  return results;
}

export function getMessagesAfter(channelId: string, after: number): DbMessage[] {
  const results = stmtGetMessagesAfter.all(channelId, after) as DbMessage[];
  return results;
}

// --- M3 functions ---

export function createAgent(agent: Agent): void {
  console.log(`[DB] INSERT agent — id="${agent.id}" name="${agent.name}"`);
  stmtInsertAgent.run(
    agent.id, agent.name, agent.channel_id,
    agent.model, agent.system_prompt, agent.last_processed_at, agent.created_at
  );
  console.log(`[DB] INSERT agent OK`);
}

export function getAgent(id: string): Agent | null {
  return stmtGetAgent.get(id) as Agent | null;
}

export function getAllAgents(): Agent[] {
  return stmtGetAllAgents.all() as Agent[];
}

export function deleteAgent(id: string): void {
  console.log(`[DB] DELETE agent — id="${id}"`);
  stmtDeleteAgent.run(id);
  console.log(`[DB] DELETE agent OK`);
}

export function updateAgentCursor(id: string, lastProcessedAt: number): void {
  stmtUpdateAgentCursor.run(lastProcessedAt, id);
}

export function getAgentByChannelAndName(channelId: string, name: string): Agent | null {
  return stmtGetAgentByChannelAndName.get(channelId, name) as Agent | null;
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
bun test src/server/database.test.ts
```

Expected: all tests pass (including existing M2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/database.ts src/server/database.test.ts
git commit -m "feat(db): add agent CRUD functions and getMessagesAfter with tests"
```

---

## Task 4: Create src/agent/system-prompt.ts + test

**Files:**
- Create: `src/agent/system-prompt.ts`
- Create: `src/agent/system-prompt.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/agent/system-prompt.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test — expect failure**

```bash
bun test src/agent/system-prompt.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement system-prompt.ts**

Create `src/agent/system-prompt.ts`:

```typescript
export function buildSystemPrompt(agentName: string, custom?: string): string {
  if (custom && custom.trim() !== "") {
    return custom;
  }
  return `You are ${agentName}, an AI assistant in a chat channel.
Read the conversation history and reply to the latest user message.
Keep your replies concise and helpful.`;
}
```

- [ ] **Step 4: Run test — expect all pass**

```bash
bun test src/agent/system-prompt.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/agent/system-prompt.ts src/agent/system-prompt.test.ts
git commit -m "feat(agent): add buildSystemPrompt utility with tests"
```

---

## Task 5: Create src/agent/worker-loop.ts

**Files:**
- Create: `src/agent/worker-loop.ts`

- [ ] **Step 1: Implement WorkerLoop**

Create `src/agent/worker-loop.ts`:

```typescript
import {
  createMessage,
  getMessagesByChannel,
  getMessagesAfter,
  updateAgentCursor,
} from "../server/database.ts";
import { broadcast } from "../server/websocket.ts";
import { sendMessage } from "../providers/anthropic.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import type { Agent, Message } from "../types.ts";

export class WorkerLoop {
  private running = false;
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = { ...agent }; // copy so we can mutate last_processed_at in memory
  }

  start(): void {
    this.running = true;
    console.log(`[WORKER] ${this.agent.name} starting in channel "${this.agent.channel_id}"`);
    this.tick();
  }

  stop(): void {
    this.running = false;
    console.log(`[WORKER] ${this.agent.name} stopped`);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      // 1. Find new user messages since last cursor
      const newMessages = getMessagesAfter(this.agent.channel_id, this.agent.last_processed_at);
      const userMessages = newMessages.filter((m) => m.role === "user");

      if (userMessages.length > 0) {
        console.log(`[WORKER] ${this.agent.name} — ${userMessages.length} new user message(s), processing`);

        // 2. Broadcast typing indicator
        broadcast({ type: "typing", data: { agent_name: this.agent.name, channel_id: this.agent.channel_id } });

        // 3. Advance cursor BEFORE LLM call (at-most-once: if LLM crashes, messages are not reprocessed)
        const cursor = Date.now();
        updateAgentCursor(this.agent.id, cursor);
        this.agent.last_processed_at = cursor; // keep in-memory in sync

        // 4. Load full conversation history for context
        const history = getMessagesByChannel(this.agent.channel_id);

        // 5. Map DbMessage[] → Message[] for the LLM
        const messages: Message[] = history.map((m): Message => {
          if (m.role === "user") {
            return { role: "user", content: m.text };
          }
          return { role: "assistant", content: [{ type: "text", text: m.text }] };
        });

        // 6. Call LLM (no tools in M3)
        const systemPrompt = buildSystemPrompt(this.agent.name, this.agent.system_prompt);
        const result = await sendMessage(messages, { model: this.agent.model, systemPrompt });

        // 7. Extract text from response
        const replyText = result.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("");

        if (!replyText.trim()) {
          console.log(`[WORKER] ${this.agent.name} — LLM returned empty text, skipping reply`);
        } else {
          // 8. Save reply to DB and broadcast
          const reply = {
            id: crypto.randomUUID(),
            channel_id: this.agent.channel_id,
            text: replyText,
            role: "assistant" as const,
            created_at: Date.now(),
          };
          createMessage(reply);
          broadcast({ type: "new_message", data: reply });
          console.log(`[WORKER] ${this.agent.name} — replied: "${replyText.slice(0, 60)}..."`);
        }
      }
    } catch (err) {
      console.error(`[WORKER] ${this.agent.name} error:`, err);
      // Loop continues — error does not stop the worker
    }

    // 9. Schedule next tick AFTER current finishes (recursive setTimeout, never overlaps)
    if (this.running) {
      setTimeout(() => this.tick(), 200);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/agent/worker-loop.ts
git commit -m "feat(agent): implement WorkerLoop with recursive setTimeout and cursor tracking"
```

---

## Task 6: Create src/agent/worker-manager.ts

**Files:**
- Create: `src/agent/worker-manager.ts`

- [ ] **Step 1: Implement WorkerManager**

Create `src/agent/worker-manager.ts`:

```typescript
import { getAllAgents } from "../server/database.ts";
import { WorkerLoop } from "./worker-loop.ts";
import type { Agent } from "../types.ts";

// Module-level singleton — one Map per server process
const loops = new Map<string, WorkerLoop>();

export function startAgent(agent: Agent): void {
  if (loops.has(agent.id)) {
    console.log(`[MANAGER] agent "${agent.name}" already running, skipping`);
    return;
  }
  const loop = new WorkerLoop(agent);
  loop.start();
  loops.set(agent.id, loop);
  console.log(`[MANAGER] started agent "${agent.name}" (id=${agent.id}) in channel "${agent.channel_id}"`);
}

export function stopAgent(agentId: string): void {
  const loop = loops.get(agentId);
  if (!loop) {
    console.log(`[MANAGER] stopAgent: no running loop for id="${agentId}"`);
    return;
  }
  loop.stop();
  loops.delete(agentId);
  console.log(`[MANAGER] stopped agent id="${agentId}"`);
}

export function resumeAll(): void {
  const agents = getAllAgents();
  console.log(`[MANAGER] resuming ${agents.length} agent(s) from DB`);
  for (const agent of agents) {
    startAgent(agent);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/agent/worker-manager.ts
git commit -m "feat(agent): implement WorkerManager with startAgent, stopAgent, resumeAll"
```

---

## Task 7: Add agent routes to src/server/router.ts

**Files:**
- Modify: `src/server/router.ts`

- [ ] **Step 1: Add imports at the top of router.ts**

Add after the existing imports:

```typescript
import type { CreateAgentBody } from "../types.ts";
import {
  createAgent,
  getAgentByChannelAndName,
  deleteAgent,
} from "./database.ts";
import { startAgent, stopAgent } from "../agent/worker-manager.ts";
import { DEFAULT_MODEL } from "../providers/anthropic.ts";
```

- [ ] **Step 2: Add POST /channels/:id/agents route**

Add before the final "No route matched" line in `handleRequest`:

```typescript
  // POST /channels/:id/agents — add an agent to a channel
  if (
    req.method === "POST" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "agents"
  ) {
    const channelId = parts[1];
    console.log(`[ROUTER] matched: POST /channels/:id/agents — channelId="${channelId}"`);

    let body: CreateAgentBody;
    try {
      body = (await req.json()) as CreateAgentBody;
    } catch {
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.name || body.name.trim() === "") {
      return json({ error: "name is required" } satisfies ApiError, 400);
    }

    const channel = getChannel(channelId);
    if (!channel) {
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const existing = getAgentByChannelAndName(channelId, body.name.trim());
    if (existing) {
      return json({ error: "agent already exists" } satisfies ApiError, 409);
    }

    const agent = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      channel_id: channelId,
      model: body.model ?? DEFAULT_MODEL,
      system_prompt: body.system_prompt ?? "",
      last_processed_at: 0,
      created_at: Date.now(),
    };

    createAgent(agent);
    startAgent(agent);

    console.log(`[ROUTER] agent "${agent.name}" created and started`);
    return json(agent, 201);
  }
```

- [ ] **Step 3: Add DELETE /channels/:id/agents/:name route**

Add after the POST /agents route, still before the "No route matched" line:

```typescript
  // DELETE /channels/:id/agents/:name — remove an agent from a channel
  if (
    req.method === "DELETE" &&
    parts.length === 4 &&
    parts[0] === "channels" &&
    parts[2] === "agents"
  ) {
    const channelId = parts[1];
    const agentName = parts[3];
    console.log(`[ROUTER] matched: DELETE /channels/:id/agents/:name — channelId="${channelId}" name="${agentName}"`);

    const channel = getChannel(channelId);
    if (!channel) {
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const agent = getAgentByChannelAndName(channelId, agentName);
    if (!agent) {
      return json({ error: "agent not found" } satisfies ApiError, 404);
    }

    stopAgent(agent.id);
    deleteAgent(agent.id);

    console.log(`[ROUTER] agent "${agentName}" stopped and deleted`);
    return json({ message: "agent stopped" }, 200);
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/router.ts
git commit -m "feat(router): add POST and DELETE /channels/:id/agents routes"
```

---

## Task 8: Wire up resumeAll in src/server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add resumeAll import and call**

In `src/server.ts`, add the import:

```typescript
import { resumeAll } from "./agent/worker-manager.ts";
```

And add the call right after `initDatabase()`:

```typescript
initDatabase();
resumeAll();  // Restart any agents persisted in DB from previous runs
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run --bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat(server): call resumeAll() on startup to restore agents from DB"
```

---

## Task 9: Integration smoke test + update chat.http

**Files:**
- Modify: `chat.http`

> This task verifies all 6 acceptance criteria from the spec using manual curl commands and wscat.

- [ ] **Step 1: Delete old DB and start server**

```bash
rm -f chat.db
bun run dev
```

Expected output:
```
[DB] opened "chat.db" with WAL mode
[DB] prepared statements compiled
[MANAGER] resuming 0 agent(s) from DB
Clawd server running on http://localhost:3456
Waiting for requests...
```

- [ ] **Step 2: Create a channel**

```bash
curl -s -X POST http://localhost:3456/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"general"}' | jq .
```

Expected: `{"id":"<uuid>","name":"general","created_at":<ms>}`. Copy the `id` as `CHANNEL_ID`.

- [ ] **Step 3: Open WebSocket listener in a separate terminal**

```bash
wscat -c ws://localhost:3456/ws
```

Expected: stays connected, shows `Connected (press CTRL+C to quit)`.

- [ ] **Step 4: Add an agent (acceptance criteria 1)**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/agents \
  -H "Content-Type: application/json" \
  -d '{"name":"claude"}' | jq .
```

Expected: `{"id":"<uuid>","name":"claude","channel_id":"CHANNEL_ID","model":"claude-sonnet-...","system_prompt":"","last_processed_at":0,"created_at":<ms>}`.

Server log should show: `[MANAGER] started agent "claude"`.

- [ ] **Step 5: Send a message and wait for reply (acceptance criteria 2 + 3)**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello! What is 2+2?"}' | jq .
```

Expected in wscat terminal (within a few seconds):
1. First: `{"type":"typing","data":{"agent_name":"claude","channel_id":"CHANNEL_ID"}}`
2. Then: `{"type":"new_message","data":{"id":"<uuid>","channel_id":"CHANNEL_ID","text":"4","role":"assistant","created_at":<ms>}}`

- [ ] **Step 6: Verify messages in DB (acceptance criteria 8)**

```bash
curl -s http://localhost:3456/channels/CHANNEL_ID/messages | jq .
```

Expected: array with `role: "user"` message followed by `role: "assistant"` reply.

- [ ] **Step 7: Stop agent (acceptance criteria 5)**

```bash
curl -s -X DELETE http://localhost:3456/channels/CHANNEL_ID/agents/claude | jq .
```

Expected: `{"message":"agent stopped"}`.

Send another message — agent should NOT reply.

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Are you still there?"}' | jq .
```

Wait 2 seconds — no typing event, no reply in wscat.

- [ ] **Step 8: Test auto-resume on restart (acceptance criteria 6)**

```bash
# Add agent back
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/agents \
  -H "Content-Type: application/json" \
  -d '{"name":"claude"}' | jq .

# Restart server (Ctrl+C, then bun run dev)
```

After restart, server log should show: `[MANAGER] resuming 1 agent(s) from DB`.

Send a message — agent should reply again.

- [ ] **Step 9: Update chat.http with agent endpoints**

Add to `chat.http`:

```http
### Add agent to channel
POST http://localhost:3456/channels/{{channelId}}/agents
Content-Type: application/json

{"name": "claude"}

### Add agent with custom config
POST http://localhost:3456/channels/{{channelId}}/agents
Content-Type: application/json

{
  "name": "helper",
  "model": "claude-haiku-4-5-20251001",
  "system_prompt": "You are a helpful assistant. Be brief."
}

### Remove agent from channel
DELETE http://localhost:3456/channels/{{channelId}}/agents/claude
```

- [ ] **Step 10: Run full test suite to confirm no regressions**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 11: Final commit**

```bash
git add chat.http
git commit -m "test(M3): update chat.http with agent endpoints"
```

- [ ] **Step 12: Tag milestone**

```bash
git tag M3-done
```

---

## Acceptance Criteria Checklist

- [ ] `POST /channels/:id/agents` body `{"name":"claude"}` → 201, agent object returned
- [ ] After adding agent, POST "Hello" → agent auto-replies within seconds
- [ ] wscat receives `{"type":"typing",...}` before reply message
- [ ] wscat receives `{"type":"new_message","data":{"role":"assistant",...}}`
- [ ] `DELETE /channels/:id/agents/claude` → agent stops replying
- [ ] Restart server → agent resumes from DB, replies to new messages
- [ ] `GET /channels/:id/messages` shows both user and agent messages
- [ ] `bun test` — all tests pass
