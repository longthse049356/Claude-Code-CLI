# M2 Chat Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an HTTP + WebSocket server with SQLite persistence — the backend of any chat app.

**Architecture:** `Bun.serve()` handles both HTTP and WebSocket on port 3456. HTTP routes save messages to SQLite via prepared statements (WAL mode). When a message is saved, it broadcasts to all connected WebSocket clients. No AI agent yet — human messages only.

**Tech Stack:** Bun runtime, `bun:sqlite` (built-in), TypeScript strict mode. No npm additions needed.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types.ts` | Keep M1 API types + add M2 DB/WS types |
| Create | `src/server/database.ts` | SQLite init, migrations, prepared statement functions |
| Create | `src/server/database.test.ts` | bun:test unit tests for database layer |
| Create | `src/server/websocket.ts` | WebSocket client Set + broadcast |
| Create | `src/server/router.ts` | Manual URL routing + request handlers |
| Create | `src/server.ts` | Bun.serve() wiring — no logic |
| Delete | `src/index.ts` | M1 terminal chatbot — removed |
| Modify | `package.json` | Replace scripts: just `"dev"` |
| Modify | `.gitignore` | Add `chat.db` |
| Create | `chat.http` | VS Code REST Client / Postman import |

---

## Task 1: Update src/types.ts

**Files:**
- Modify: `src/types.ts`

> **Note:** Spec says remove `Message`/`UserMessage`/`AssistantMessage` but `providers/anthropic.ts` imports them. We keep those types — they'll be reused in M3's agent loop anyway.

- [ ] **Step 1: Rewrite src/types.ts with all M1 + M2 types**

Replace the entire file with:

```typescript
// src/types.ts

// --- Claude API Types (used by providers/anthropic.ts) ---

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

export interface UserMessage {
  role: "user";
  content: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
}

export type Message = UserMessage | AssistantMessage;

export interface StreamResult {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// --- Database Models (M2) ---

export interface Channel {
  id: string;           // UUID
  name: string;
  created_at: number;   // Unix ms timestamp
}

export interface DbMessage {
  id: string;           // UUID
  channel_id: string;   // FK → channels.id
  text: string;
  role: "user" | "agent"; // M2: always "user"
  created_at: number;   // Unix ms timestamp
}

export interface Agent {
  id: string;           // UUID
  name: string;
  channel_id: string;   // FK → channels.id
  created_at: number;
}

// --- HTTP Request Bodies ---

export interface CreateChannelBody {
  name: string;
}

export interface CreateMessageBody {
  text: string;
}

// --- WebSocket Broadcast ---

export interface WsBroadcast {
  type: "new_message";
  data: DbMessage;
}

// --- API Error Response ---

export interface ApiError {
  error: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected output: no errors (clean exit).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(M2): add database and websocket types to types.ts"
```

---

## Task 2: Database Layer (TDD)

**Files:**
- Create: `src/server/database.test.ts`
- Create: `src/server/database.ts`

- [ ] **Step 1: Create the test file first**

Create `src/server/database.test.ts`:

```typescript
import { beforeEach, expect, test } from "bun:test";
import {
  createChannel,
  createMessage,
  getChannel,
  getMessagesByChannel,
  initDatabase,
} from "./database.ts";

beforeEach(() => {
  // Use in-memory DB for tests — no file created, isolated per test
  initDatabase(":memory:");
});

test("createChannel and getChannel round-trip", () => {
  createChannel("ch-1", "general", 1000);
  const ch = getChannel("ch-1");
  expect(ch).toEqual({ id: "ch-1", name: "general", created_at: 1000 });
});

test("getChannel returns null for unknown id", () => {
  const ch = getChannel("does-not-exist");
  expect(ch).toBeNull();
});

test("createMessage and getMessagesByChannel round-trip", () => {
  createChannel("ch-1", "general", 1000);
  createMessage({
    id: "msg-1",
    channel_id: "ch-1",
    text: "Hello",
    role: "user",
    created_at: 2000,
  });
  const msgs = getMessagesByChannel("ch-1");
  expect(msgs).toHaveLength(1);
  expect(msgs[0]).toEqual({
    id: "msg-1",
    channel_id: "ch-1",
    text: "Hello",
    role: "user",
    created_at: 2000,
  });
});

test("getMessagesByChannel returns empty array when channel has no messages", () => {
  createChannel("ch-1", "general", 1000);
  expect(getMessagesByChannel("ch-1")).toEqual([]);
});

test("getMessagesByChannel orders messages by created_at ASC", () => {
  createChannel("ch-1", "general", 1000);
  // Insert newer message first
  createMessage({ id: "msg-2", channel_id: "ch-1", text: "Second", role: "user", created_at: 3000 });
  createMessage({ id: "msg-1", channel_id: "ch-1", text: "First",  role: "user", created_at: 2000 });
  const msgs = getMessagesByChannel("ch-1");
  expect(msgs[0].id).toBe("msg-1");
  expect(msgs[1].id).toBe("msg-2");
});
```

- [ ] **Step 2: Run tests — verify they FAIL (database.ts doesn't exist yet)**

```bash
bun test src/server/database.test.ts
```

Expected output: error similar to `Cannot find module "./database.ts"`. This confirms TDD setup is correct.

- [ ] **Step 3: Create src/server/database.ts**

Create `src/server/database.ts`:

```typescript
import { Database, type Statement } from "bun:sqlite";
import type { Channel, DbMessage } from "../types.ts";

let db: Database;

// Prepared statements — compiled once, reused for every query
let stmtInsertChannel!: Statement;
let stmtGetChannel!: Statement;
let stmtInsertMessage!: Statement;
let stmtGetMessages!: Statement;

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
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    channel_id TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );
`;

export function initDatabase(path = "chat.db"): void {
  db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  // Compile statements once here
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
}

export function createChannel(id: string, name: string, createdAt: number): void {
  stmtInsertChannel.run(id, name, createdAt);
}

export function getChannel(id: string): Channel | null {
  return stmtGetChannel.get(id) as Channel | null;
}

export function createMessage(msg: DbMessage): void {
  stmtInsertMessage.run(msg.id, msg.channel_id, msg.text, msg.role, msg.created_at);
}

export function getMessagesByChannel(channelId: string): DbMessage[] {
  return stmtGetMessages.all(channelId) as DbMessage[];
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
bun test src/server/database.test.ts
```

Expected output:
```
bun test v1.x.x
src/server/database.test.ts:
✓ createChannel and getChannel round-trip
✓ getChannel returns null for unknown id
✓ createMessage and getMessagesByChannel round-trip
✓ getMessagesByChannel returns empty array when channel has no messages
✓ getMessagesByChannel orders messages by created_at ASC

5 pass, 0 fail
```

- [ ] **Step 5: Commit**

```bash
git add src/server/database.ts src/server/database.test.ts
git commit -m "feat(M2): add SQLite database layer with prepared statements"
```

---

## Task 3: WebSocket Manager

**Files:**
- Create: `src/server/websocket.ts`

This module cannot be unit tested in isolation (needs a live Bun server). Verification happens in Task 5's integration test.

- [ ] **Step 1: Create src/server/websocket.ts**

```typescript
import type { ServerWebSocket } from "bun";
import type { WsBroadcast } from "../types.ts";

const clients = new Set<ServerWebSocket<unknown>>();

export const wsHandlers = {
  open(ws: ServerWebSocket<unknown>): void {
    clients.add(ws);
    console.log(`[WS] client connected. Total: ${clients.size}`);
  },

  close(ws: ServerWebSocket<unknown>): void {
    clients.delete(ws);
    console.log(`[WS] client disconnected. Total: ${clients.size}`);
  },

  message(_ws: ServerWebSocket<unknown>, _msg: string | Buffer): void {
    // M2: server → client only. Client messages are ignored.
  },
};

export function broadcast(data: WsBroadcast): void {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    client.send(payload);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/websocket.ts
git commit -m "feat(M2): add WebSocket manager with broadcast"
```

---

## Task 4: HTTP Router

**Files:**
- Create: `src/server/router.ts`

- [ ] **Step 1: Create src/server/router.ts**

```typescript
import type { ApiError, Channel, CreateChannelBody, CreateMessageBody, DbMessage } from "../types.ts";
import {
  createChannel,
  createMessage,
  getChannel,
  getMessagesByChannel,
} from "./database.ts";
import { broadcast } from "./websocket.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // parts examples:
  //   POST /channels          → ["channels"]
  //   GET  /channels/abc/messages → ["channels", "abc", "messages"]

  // POST /channels — create a new channel
  if (req.method === "POST" && parts.length === 1 && parts[0] === "channels") {
    let body: CreateChannelBody;
    try {
      body = (await req.json()) as CreateChannelBody;
    } catch {
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.name || body.name.trim() === "") {
      return json({ error: "name is required" } satisfies ApiError, 400);
    }

    const id = crypto.randomUUID();
    const created_at = Date.now();
    createChannel(id, body.name.trim(), created_at);

    return json({ id, name: body.name.trim(), created_at } satisfies Channel, 201);
  }

  // GET /channels/:id/messages — list messages in a channel
  if (
    req.method === "GET" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "messages"
  ) {
    const channelId = parts[1];
    if (!getChannel(channelId)) {
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }
    return json(getMessagesByChannel(channelId));
  }

  // POST /channels/:id/messages — send a message to a channel
  if (
    req.method === "POST" &&
    parts.length === 3 &&
    parts[0] === "channels" &&
    parts[2] === "messages"
  ) {
    const channelId = parts[1];

    let body: CreateMessageBody;
    try {
      body = (await req.json()) as CreateMessageBody;
    } catch {
      return json({ error: "invalid JSON" } satisfies ApiError, 400);
    }

    if (!body.text || body.text.trim() === "") {
      return json({ error: "text is required" } satisfies ApiError, 400);
    }

    if (!getChannel(channelId)) {
      return json({ error: "channel not found" } satisfies ApiError, 404);
    }

    const msg: DbMessage = {
      id: crypto.randomUUID(),
      channel_id: channelId,
      text: body.text.trim(),
      role: "user",
      created_at: Date.now(),
    };

    createMessage(msg);
    broadcast({ type: "new_message", data: msg });

    return json(msg, 201);
  }

  // No route matched
  return json({ error: "not found" } satisfies ApiError, 404);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/router.ts
git commit -m "feat(M2): add HTTP router with channel and message handlers"
```

---

## Task 5: Wire Server, Cleanup, and Integration Test

**Files:**
- Create: `src/server.ts`
- Delete: `src/index.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `chat.http`

- [ ] **Step 1: Create src/server.ts**

```typescript
import { initDatabase } from "./server/database.ts";
import { handleRequest } from "./server/router.ts";
import { wsHandlers } from "./server/websocket.ts";

initDatabase();

Bun.serve({
  port: 3456,
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) return new Response("WS upgrade failed", { status: 400 });
      return;
    }
    return handleRequest(req);
  },
  websocket: wsHandlers,
});

console.log("Clawd server running on http://localhost:3456");
```

- [ ] **Step 2: Update package.json scripts**

Open `package.json` and change the `scripts` field to:

```json
"scripts": {
  "dev": "bun run src/server.ts"
}
```

Remove the old `"chat": "bun run src/index.ts"` script.

- [ ] **Step 3: Add chat.db to .gitignore**

Open `.gitignore` and add this line at the bottom:

```
chat.db
```

- [ ] **Step 4: Create chat.http for Postman/VS Code REST Client**

Create `chat.http` at project root:

```http
### Create channel
POST http://localhost:3456/channels
Content-Type: application/json

{"name": "general"}

###

### Send message — replace CHANNEL_ID with id from above response
POST http://localhost:3456/channels/CHANNEL_ID/messages
Content-Type: application/json

{"text": "Hello from M2"}

###

### Get messages — replace CHANNEL_ID
GET http://localhost:3456/channels/CHANNEL_ID/messages

###

### Error: missing name
POST http://localhost:3456/channels
Content-Type: application/json

{}

###

### Error: channel not found
GET http://localhost:3456/channels/does-not-exist/messages

###

### Unknown route
GET http://localhost:3456/foo
```

- [ ] **Step 5: Start the server**

```bash
bun run dev
```

Expected output:
```
Clawd server running on http://localhost:3456
```

Leave this terminal running. Open a second terminal for the next steps.

- [ ] **Step 6: Test POST /channels → 201**

```bash
curl -s -X POST http://localhost:3456/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"general"}' | cat
```

Expected response (ids and timestamps will differ):
```json
{"id":"a1b2c3d4-...","name":"general","created_at":1744000000000}
```

Copy the `id` value — use it as `CHANNEL_ID` in the next steps.

- [ ] **Step 7: Test POST /channels/:id/messages → 201**

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello"}' | cat
```

Expected:
```json
{"id":"...","channel_id":"CHANNEL_ID","text":"Hello","role":"user","created_at":...}
```

- [ ] **Step 8: Test GET /channels/:id/messages → 200 array**

```bash
curl -s http://localhost:3456/channels/CHANNEL_ID/messages | cat
```

Expected (array with the message from Step 7):
```json
[{"id":"...","channel_id":"CHANNEL_ID","text":"Hello","role":"user","created_at":...}]
```

- [ ] **Step 9: Test error cases**

```bash
# Missing name → 400
curl -s -X POST http://localhost:3456/channels \
  -H "Content-Type: application/json" -d '{}' | cat
# Expected: {"error":"name is required"}

# Channel not found → 404
curl -s http://localhost:3456/channels/does-not-exist/messages | cat
# Expected: {"error":"channel not found"}

# Unknown route → 404
curl -s http://localhost:3456/foo | cat
# Expected: {"error":"not found"}
```

- [ ] **Step 10: Test WebSocket broadcast (needs wscat)**

In a second terminal, connect WebSocket:

```bash
wscat -c ws://localhost:3456/ws
```

Expected: connected, cursor waiting. Server logs `[WS] client connected. Total: 1`.

In a third terminal, POST a message:

```bash
curl -s -X POST http://localhost:3456/channels/CHANNEL_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"realtime test"}' | cat
```

Expected in wscat terminal:
```json
{"type":"new_message","data":{"id":"...","channel_id":"...","text":"realtime test","role":"user","created_at":...}}
```

- [ ] **Step 11: Test SQLite persistence — restart server**

Stop the server (Ctrl+C). Restart:

```bash
bun run dev
```

Fetch messages again:

```bash
curl -s http://localhost:3456/channels/CHANNEL_ID/messages | cat
```

Expected: same messages array as before — data persisted in `chat.db`.

- [ ] **Step 12: Delete src/index.ts**

> Per CLAUDE.md: must ask user before deleting files. Ask user for approval before running this step.

```bash
# Only run after user confirms
rm src/index.ts
```

- [ ] **Step 13: Verify TypeScript still compiles cleanly**

```bash
bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 14: Run all tests one final time**

```bash
bun test
```

Expected:
```
5 pass, 0 fail
```

- [ ] **Step 15: Commit**

```bash
git add src/server.ts package.json .gitignore chat.http
git commit -m "feat(M2): wire Bun.serve() entry point, HTTP + WebSocket on port 3456"
```

After confirming `src/index.ts` deletion:

```bash
git add -A
git commit -m "chore(M2): remove M1 terminal chatbot entry point"
```

- [ ] **Step 16: Tag milestone**

```bash
git tag M2-done
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Covered by |
|---|---|
| `Bun.serve()` HTTP + WS on port 3456 | Task 5 `server.ts` |
| SQLite WAL mode | Task 2 `initDatabase()` |
| 3 tables: channels, messages, agents | Task 2 SCHEMA |
| Prepared statements | Task 2 `stmtInsert*` vars |
| `POST /channels` → 201 | Task 4 router, Task 5 Step 6 |
| `GET /channels/:id/messages` → 200 | Task 4 router, Task 5 Step 8 |
| `POST /channels/:id/messages` → 201 + broadcast | Task 4 router, Task 5 Step 7 |
| WebSocket connect + receive broadcast | Task 3 + Task 5 Step 10 |
| SQLite persistence across restarts | Task 5 Step 11 |
| All 10 error cases | Task 4 router, Task 5 Step 9 |
| `chat.db` in `.gitignore` | Task 5 Step 3 |
| TypeScript strict, no `any` | Steps 2 in each task |
| `src/index.ts` deleted | Task 5 Step 12 |
| `package.json` scripts simplified | Task 5 Step 2 |

All spec requirements covered. No gaps found.
