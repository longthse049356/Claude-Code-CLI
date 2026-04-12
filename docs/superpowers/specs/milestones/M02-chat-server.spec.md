# M2 Feature Spec: Chat Server

> Spec chi tiết cho implementation. Đọc `M02-chat-server.md` trước để hiểu scope và concepts.

---

## 1. Project Setup

### Dependencies

Không cần thêm npm dependency — `bun:sqlite` là built-in.

```json
{
  "name": "clawd-rebuild",
  "type": "module",
  "scripts": {
    "dev": "bun run src/server.ts"
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

> M1 terminal chatbot (`src/index.ts`) bị xóa ở M2. `src/server.ts` là entry point duy nhất từ đây về sau. Testing qua Postman/curl thay vì terminal UI.

### Environment

```bash
# .env (không thay đổi từ M1)
ANTHROPIC_API_KEY=sk-ant-xxx
```

### Database file

```
chat.db   ← tự tạo khi server khởi động, tại project root (gitignored)
```

### Run commands

```bash
bun run dev        # Start HTTP + WebSocket server on port 3456
```

Tùy chọn: tạo `chat.http` file để dùng với VS Code REST Client hoặc import vào Postman:

```http
### Tạo channel
POST http://localhost:3456/channels
Content-Type: application/json

{"name": "general"}

### Gửi message (thay CHANNEL_ID)
POST http://localhost:3456/channels/CHANNEL_ID/messages
Content-Type: application/json

{"text": "Hello"}

### Lấy messages
GET http://localhost:3456/channels/CHANNEL_ID/messages

### Test WebSocket (dùng wscat hoặc Postman WS)
# wscat -c ws://localhost:3456/ws
```

---

## 2. Data Structures

```typescript
// src/types.ts — THAY THẾ HOÀN TOÀN M1 types

// --- Claude API types (dùng bởi providers/anthropic.ts) ---

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

export interface StreamResult {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: { inputTokens: number; outputTokens: number };
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
  id: string;           // UUID: "a1b2c3d4-..."
  name: string;         // "general", "random", v.v.
  created_at: number;   // Unix ms timestamp
}

export interface DbMessage {
  id: string;           // UUID
  channel_id: string;   // FK → channels.id
  text: string;         // nội dung message
  role: "user" | "agent"; // M2: luôn "user"
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

> `Message` type từ M1 (conversation history) bị xóa vì không còn terminal UI. `providers/anthropic.ts` vẫn giữ nhưng type `Message` không cần thiết nữa ở M2 — sẽ dùng lại từ M3 khi có agent loop.

---

## 3. SQL Schema

```sql
-- Migration chạy 1 lần khi server khởi động

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
```

---

## 4. File Specifications

### `src/server.ts` — Entry Point (mới)

**Responsibility:** Khởi tạo database, khởi động `Bun.serve()` với HTTP + WebSocket trên port 3456.

```typescript
import { initDatabase } from "./server/database.ts";
import { handleRequest } from "./server/router.ts";
import { wsHandlers } from "./server/websocket.ts";

initDatabase(); // chạy migrations

Bun.serve({
  port: 3456,
  fetch(req, server) {
    // Upgrade WebSocket nếu path là /ws
    if (new URL(req.url).pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) return new Response("WS upgrade failed", { status: 400 });
      return; // upgrade thành công → không return Response
    }
    return handleRequest(req);
  },
  websocket: wsHandlers,
});

console.log("Clawd server running on http://localhost:3456");
```

**Không có logic** — chỉ wiring. Mọi logic nằm ở các module con.

---

### `src/server/database.ts` — SQLite Layer

**Responsibility:** Mở DB, chạy migrations, export prepared statement functions.

```typescript
import { Database } from "bun:sqlite";

const db = new Database("chat.db");
db.exec("PRAGMA journal_mode = WAL;");

export function initDatabase(): void
// Chạy CREATE TABLE IF NOT EXISTS cho 3 bảng.
// Gọi 1 lần khi server khởi động.

export function createChannel(id: string, name: string, createdAt: number): void
// INSERT INTO channels

export function getChannel(id: string): Channel | null
// SELECT từ channels, trả null nếu không tìm thấy

export function createMessage(msg: DbMessage): void
// INSERT INTO messages

export function getMessagesByChannel(channelId: string): DbMessage[]
// SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC
```

**Prepared statements** (compile once, run many):

```typescript
const stmtInsertChannel = db.prepare(
  "INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)"
);
const stmtGetChannel = db.prepare(
  "SELECT * FROM channels WHERE id = ?"
);
const stmtInsertMessage = db.prepare(
  "INSERT INTO messages (id, channel_id, text, role, created_at) VALUES (?, ?, ?, ?, ?)"
);
const stmtGetMessages = db.prepare(
  "SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC"
);
```

---

### `src/server/router.ts` — HTTP Router

**Responsibility:** Match URL + method → gọi handler đúng → trả Response.

```typescript
export async function handleRequest(req: Request): Promise<Response>
// Route table:
//   POST   /channels                    → createChannelHandler
//   GET    /channels/:id/messages       → getMessagesHandler
//   POST   /channels/:id/messages       → createMessageHandler
//   *      (không match)               → 404 JSON
```

**Route matching thủ công** (không dùng framework):

```typescript
const url = new URL(req.url);
const pathname = url.pathname; // "/channels/abc/messages"
const parts = pathname.split("/").filter(Boolean); // ["channels", "abc", "messages"]

// POST /channels
if (req.method === "POST" && parts.length === 1 && parts[0] === "channels") { ... }

// GET /channels/:id/messages
if (req.method === "GET" && parts.length === 3 && parts[0] === "channels" && parts[2] === "messages") { ... }

// POST /channels/:id/messages
if (req.method === "POST" && parts.length === 3 && parts[0] === "channels" && parts[2] === "messages") { ... }
```

**Handler details:**

```
POST /channels
  Body: { name: string }
  → validate: name required (400 if missing/empty)
  → id = crypto.randomUUID()
  → createChannel(id, name, Date.now())
  → return 201 JSON: { id, name, created_at }

GET /channels/:id/messages
  → getChannel(id) → 404 if null
  → messages = getMessagesByChannel(id)
  → return 200 JSON: messages array ([] nếu không có message nào)

POST /channels/:id/messages
  Body: { text: string }
  → validate: text required (400 if missing/empty)
  → getChannel(id) → 404 if null
  → msg = { id: uuid, channel_id: id, text, role: "user", created_at: Date.now() }
  → createMessage(msg)
  → broadcast({ type: "new_message", data: msg })
  → return 201 JSON: msg
```

**Response helper:**

```typescript
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

---

### `src/server/websocket.ts` — WebSocket Manager

**Responsibility:** Quản lý connected clients, broadcast messages.

```typescript
import type { ServerWebSocket } from "bun";

const clients = new Set<ServerWebSocket<unknown>>();

export const wsHandlers = {
  open(ws: ServerWebSocket<unknown>) {
    clients.add(ws);
    console.log(`[WS] client connected. Total: ${clients.size}`);
  },
  close(ws: ServerWebSocket<unknown>) {
    clients.delete(ws);
    console.log(`[WS] client disconnected. Total: ${clients.size}`);
  },
  message(ws: ServerWebSocket<unknown>, msg: string | Buffer) {
    // M2: client không gửi messages — ignore
  },
};

export function broadcast(data: WsBroadcast): void {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    client.send(payload);
  }
}
```

---

### `src/types.ts` — Rewritten

Xóa `UserMessage`, `AssistantMessage`, `Message` types (không còn terminal UI). Giữ Claude API types (`TextBlock`, `ToolUseBlock`, `ContentBlock`, `StreamResult`, `ToolDefinition`) cho `providers/anthropic.ts`. Thêm toàn bộ M2 types (xem Section 2).

---

### `src/providers/anthropic.ts` — Không thay đổi

Giữ nguyên từ M1. Sẽ được dùng lại ở M3 khi agent loop cần gọi Claude API.

---

### `src/index.ts` — XÓA

File này bị xóa hoàn toàn ở M2. `src/server.ts` là entry point duy nhất.

---

## 5. Edge Cases & Error Handling

| Scenario | HTTP Code | Response Body |
|---|---|---|
| POST /channels — body không có `name` | 400 | `{ "error": "name is required" }` |
| POST /channels — `name` là empty string | 400 | `{ "error": "name is required" }` |
| POST /channels/:id/messages — body không có `text` | 400 | `{ "error": "text is required" }` |
| POST /channels/:id/messages — `text` là empty string | 400 | `{ "error": "text is required" }` |
| GET/POST /channels/:id/messages — channel_id không tồn tại | 404 | `{ "error": "channel not found" }` |
| Request body không phải JSON hợp lệ | 400 | `{ "error": "invalid JSON" }` |
| Route không match | 404 | `{ "error": "not found" }` |
| Method không cho phép (e.g. DELETE /channels) | 404 | `{ "error": "not found" }` |
| WS upgrade path khác `/ws` | 400 | `"WS upgrade failed"` |
| WS client disconnect đột ngột | - | remove khỏi `clients` Set, log |

---

## 6. Acceptance Criteria

### Functional

- [ ] `bun run src/server.ts` → server khởi động, in `"Clawd server running on http://localhost:3456"`
- [ ] `POST /channels` body `{"name":"general"}` → 201, trả về `{ id, name, created_at }`
- [ ] `POST /channels/:id/messages` body `{"text":"Hello"}` → 201, trả về message object
- [ ] `GET /channels/:id/messages` → 200, trả về array messages theo thứ tự `created_at` ASC
- [ ] `wscat -c ws://localhost:3456/ws` → connect thành công, không đóng
- [ ] POST message trong khi wscat đang connect → wscat nhận JSON broadcast realtime
- [ ] Restart server → GET messages vẫn trả về data cũ (SQLite persistence)
- [ ] Nhiều wscat clients connect → tất cả đều nhận broadcast

### Error handling

- [ ] POST /channels thiếu name → 400 + error message
- [ ] GET messages với channel_id không tồn tại → 404 + error message
- [ ] POST messages với channel_id không tồn tại → 404 + error message
- [ ] Body JSON không hợp lệ → 400 + error message
- [ ] Route không tồn tại → 404 + error message

### Code quality

- [ ] TypeScript strict mode, không có `any` type
- [ ] `chat.db` trong `.gitignore`
- [ ] WAL mode được bật khi khởi động
- [ ] Prepared statements dùng cho tất cả queries (không string interpolation SQL)

---

## 7. File Structure (final)

```
src/
├── server.ts             ← ~20 lines: Bun.serve() entry point (MỚI)
├── server/
│   ├── database.ts       ← ~70 lines: SQLite init, prepared statements (MỚI)
│   ├── router.ts         ← ~80 lines: route matching + handlers (MỚI)
│   └── websocket.ts      ← ~30 lines: WS Set management + broadcast (MỚI)
├── providers/
│   └── anthropic.ts      ← ~155 lines: Claude API provider (GIỮ NGUYÊN)
└── types.ts              ← ~75 lines: API types + M2 DB/WS types (VIẾT LẠI)

XÓA: src/index.ts (M1 terminal chatbot)
```

Estimated new code: ~200 lines. Total codebase: ~330 lines (giảm so với giữ M1).

---

## 8. What is NOT in M2

- AI/agent responses — chỉ human messages (`role: "user"` mọi lúc)
- Authentication / authorization
- Channels listing (`GET /channels`) — chỉ create + fetch messages
- Delete channel / delete message
- Message pagination
- WS client → server messages (client chỉ listen, không gửi)
- Multiple server instances / load balancing
- Any React UI (M10)
- Agent loop (M3)
