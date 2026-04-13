# M3 Feature Spec: Agent Loop

> Spec chi tiết cho implementation. Đọc `M03-agent-loop.md` trước để hiểu scope và concepts.

---

## 1. Project Setup

### Dependencies

Không cần thêm npm dependency mới — dùng lại `@anthropic-ai/sdk` đã có.

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

### Environment

```bash
# .env (không thay đổi từ M2)
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # optional, có default
```

### Run commands

```bash
bun run dev        # Start server on port 3456 (không thay đổi)
```

---

## 2. Data Structures

```typescript
// src/types.ts — thay đổi và thêm mới

// --- Fix từ M2 ---

// DbMessage.role: "agent" → "assistant" (match Claude API naming)
export interface DbMessage {
  id: string;
  channel_id: string;
  text: string;
  role: "user" | "assistant";  // đổi "agent" → "assistant"
  created_at: number;
}

// WsBroadcast: mở rộng để support typing event
export type WsBroadcast =
  | { type: "new_message"; data: DbMessage }
  | { type: "typing"; data: { agent_name: string; channel_id: string } };

// --- Thêm mới cho M3 ---

// Agent: thêm model, system_prompt, last_processed_at
export interface Agent {
  id: string;
  name: string;
  channel_id: string;
  model: string;
  system_prompt: string;
  last_processed_at: number;  // Unix ms timestamp — cursor: đã xử lý đến đây
  created_at: number;
}

// HTTP request body cho POST /channels/:id/agents
export interface CreateAgentBody {
  name: string;
  model?: string;
  system_prompt?: string;
}

// Giữ nguyên từ M2: Channel, CreateChannelBody, CreateMessageBody, ApiError
// Giữ nguyên từ M1: TextBlock, ToolUseBlock, ContentBlock, StreamResult, ToolDefinition

// THÊM LẠI (đã xóa ở M2, cần lại cho M3):
export interface UserMessage {
  role: "user";
  content: string;
}
export interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
}
export type Message = UserMessage | AssistantMessage;
```

> **Lưu ý:** `UserMessage`, `AssistantMessage`, `Message` đã bị xóa khỏi `types.ts` ở M2. M3 cần thêm lại vì `sendMessage()` trong `anthropic.ts` dùng kiểu `Message[]` để build conversation history.

---

## 3. SQL Schema

```sql
-- agents table: thêm model, system_prompt, last_processed_at
-- DROP cũ + recreate (chat.db là dev DB, không có data quan trọng)
-- Hoặc: migration bằng ALTER TABLE ADD COLUMN IF NOT EXISTS

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
```

**Migration strategy:** `initDatabase()` dùng `CREATE TABLE IF NOT EXISTS` với schema mới. Vì `chat.db` là dev database không có production data, xóa file `chat.db` trước khi chạy M3 để apply schema mới sạch.

---

## 4. File Specifications

### `src/providers/anthropic.ts` — Remove stdout side effects

**Thay đổi:** Xóa toàn bộ `process.stdout.write()` calls. Function chỉ trả về kết quả, không có terminal output side effects.

```typescript
// XÓA dòng này:
process.stdout.write("\nAssistant > ");

// XÓA callback này:
stream.on("text", (text) => {
  process.stdout.write(text);
});
```

Signature `sendMessage()` không thay đổi — chỉ bỏ side effects.

---

### `src/agent/system-prompt.ts` — Build system prompt

**Responsibility:** Tạo system prompt cho agent.

```typescript
export function buildSystemPrompt(agentName: string, custom?: string): string
// Nếu custom không rỗng: trả về custom
// Nếu custom rỗng/undefined: trả về default prompt:
//   "You are {agentName}, an AI assistant in a chat channel.
//    Read the conversation history and reply to the latest user message.
//    Keep your replies concise and helpful."
```

---

### `src/agent/worker-loop.ts` — WorkerLoop class

**Responsibility:** Quản lý vòng lặp polling cho một agent duy nhất.

```typescript
export class WorkerLoop {
  private running: boolean = false;
  private agent: Agent;

  constructor(agent: Agent)

  start(): void
  // Set running = true
  // Gọi this.tick() lần đầu

  stop(): void
  // Set running = false
  // Tick tiếp theo sẽ không reschedule

  private async tick(): Promise<void>
  // Logic:
  //   1. if (!this.running) return  ← thoát nếu đã bị stop
  //   2. getMessagesAfter(channelId, last_processed_at) → newMessages
  //   3. userMessages = newMessages.filter(m => m.role === "user")
  //   4. if (userMessages.length > 0):
  //        a. broadcast typing event
  //        b. updateAgentCursor(agent.id, Date.now())  ← TRƯỚC khi call LLM
  //        c. history = getMessagesByChannel(channelId)
  //        d. messages: Message[] = history.map(m =>
  //             m.role === "user"
  //               ? { role: "user", content: m.text }
  //               : { role: "assistant", content: [{ type: "text", text: m.text }] }
  //           )
  //        e. systemPrompt = buildSystemPrompt(agent.name, agent.system_prompt)
  //        f. result = await sendMessage(messages, { model: agent.model, systemPrompt })
  //        g. replyText = result.content.filter(b => b.type === "text").map(b => b.text).join("")
  //        h. reply = { id: uuid, channel_id, text: replyText, role: "assistant", created_at: Date.now() }
  //        i. createMessage(reply)
  //        j. broadcast({ type: "new_message", data: reply })
  //   5. if (this.running): setTimeout(() => this.tick(), 200)
  // Wrap toàn bộ trong try/catch — log error, KHÔNG crash loop
}
```

**Cursor update strategy:** `updateAgentCursor` được gọi **trước** `sendMessage`. Lý do: nếu LLM call crash, worker không bị stuck loop xử lý lại cùng message mãi mãi (at-most-once delivery).

**In-memory agent state:** WorkerLoop giữ `agent` object trong memory. Sau khi `updateAgentCursor` lưu vào DB, cũng cập nhật `this.agent.last_processed_at` để tick tiếp theo dùng giá trị mới (không cần re-query DB mỗi tick).

---

### `src/agent/worker-manager.ts` — WorkerManager

**Responsibility:** Quản lý tất cả WorkerLoop instances.

```typescript
// Module-level singleton (không cần class)
const loops = new Map<string, WorkerLoop>();  // agentId → WorkerLoop

export function startAgent(agent: Agent): void
// new WorkerLoop(agent).start()
// loops.set(agent.id, loop)
// Log: [MANAGER] started agent "{name}" in channel "{channel_id}"

export function stopAgent(agentId: string): void
// loop = loops.get(agentId)
// if loop: loop.stop(), loops.delete(agentId)
// Log: [MANAGER] stopped agent "{agentId}"

export function resumeAll(): void
// getAllAgents() → for each agent: startAgent(agent)
// Log: [MANAGER] resumed {n} agent(s)
```

---

### `src/server/database.ts` — Thêm agent CRUD functions

**Thêm mới** (giữ nguyên toàn bộ functions M2):

```typescript
// Prepared statements mới:
// stmtInsertAgent, stmtGetAgent, stmtGetAllAgents,
// stmtDeleteAgent, stmtUpdateAgentCursor, stmtGetAgentByChannelAndName

export function createAgent(agent: Agent): void
// INSERT INTO agents (id, name, channel_id, model, system_prompt, last_processed_at, created_at)

export function getAgent(id: string): Agent | null
// SELECT * FROM agents WHERE id = ?

export function getAllAgents(): Agent[]
// SELECT * FROM agents

export function deleteAgent(id: string): void
// DELETE FROM agents WHERE id = ?

export function updateAgentCursor(id: string, lastProcessedAt: number): void
// UPDATE agents SET last_processed_at = ? WHERE id = ?

export function getAgentByChannelAndName(channelId: string, name: string): Agent | null
// SELECT * FROM agents WHERE channel_id = ? AND name = ?

export function getMessagesAfter(channelId: string, after: number): DbMessage[]
// SELECT * FROM messages WHERE channel_id = ? AND created_at > ? ORDER BY created_at ASC
```

---

### `src/server/router.ts` — Thêm agent routes

**Thêm 2 routes mới** (giữ nguyên toàn bộ routes M2):

```
POST /channels/:id/agents
  Body: { name: string, model?: string, system_prompt?: string }
  → validate: name required (400)
  → getChannel(id) → 404 if not found
  → getAgentByChannelAndName(id, name) → 409 if already exists
  → agent = { id: uuid, name, channel_id: id, model: body.model ?? DEFAULT_MODEL,
               system_prompt: body.system_prompt ?? "", last_processed_at: 0, created_at: now }
  → createAgent(agent)
  → startAgent(agent)
  → return 201: agent object

DELETE /channels/:id/agents/:name
  → getChannel(id) → 404 if not found
  → getAgentByChannelAndName(id, name) → 404 if not found
  → stopAgent(agent.id)
  → deleteAgent(agent.id)
  → return 200: { message: "agent stopped" }
```

**Route matching pattern** (nhất quán với M2):

```typescript
// POST /channels/:id/agents
if (req.method === "POST" && parts.length === 3 &&
    parts[0] === "channels" && parts[2] === "agents") { ... }

// DELETE /channels/:id/agents/:name
if (req.method === "DELETE" && parts.length === 4 &&
    parts[0] === "channels" && parts[2] === "agents") { ... }
```

---

### `src/server/websocket.ts` — Không thay đổi logic

Type `WsBroadcast` được mở rộng trong `types.ts`. Function `broadcast()` không cần thay đổi vì nó nhận `WsBroadcast` — TypeScript tự pick up union type mới.

---

### `src/server.ts` — Thêm resumeAll()

```typescript
import { initDatabase } from "./server/database.ts";
import { handleRequest } from "./server/router.ts";
import { wsHandlers } from "./server/websocket.ts";
import { resumeAll } from "./agent/worker-manager.ts";  // MỚI

initDatabase();
resumeAll();  // MỚI: restart agent loops từ DB

Bun.serve({ ... });  // không thay đổi
```

---

## 5. Edge Cases & Error Handling

| Scenario | HTTP Code | Response Body |
|---|---|---|
| POST /agents — thiếu `name` | 400 | `{ "error": "name is required" }` |
| POST /agents — channel không tồn tại | 404 | `{ "error": "channel not found" }` |
| POST /agents — agent name đã tồn tại trong channel | 409 | `{ "error": "agent already exists" }` |
| DELETE /agents — channel không tồn tại | 404 | `{ "error": "channel not found" }` |
| DELETE /agents/:name — agent không tồn tại | 404 | `{ "error": "agent not found" }` |
| Worker tick — LLM call throw error | — | Log error, continue loop (không crash) |
| Worker tick — result.content không có text block | — | Log warning, skip reply (không save empty message) |
| POST 3 messages nhanh — agent đang xử lý message 1 | — | Messages 2+3 được xử lý ở tick tiếp theo (queue tự nhiên qua cursor) |
| Server restart — agent đang giữa LLM call | — | resumeAll() restart loop, cursor đã update nên không reprocess |

---

## 6. Acceptance Criteria

### Functional

- [ ] `POST /channels/:id/agents` body `{"name":"claude"}` → 201, agent object trả về
- [ ] Sau khi add agent, POST message "Hello" → vài giây sau agent tự reply
- [ ] wscat nhận `{"type":"typing",...}` event trước khi nhận reply message
- [ ] wscat nhận `{"type":"new_message","data":{"role":"assistant",...}}` sau khi agent reply
- [ ] POST 3 messages nhanh → agent reply đủ 3 (không skip), theo thứ tự
- [ ] `DELETE /channels/:id/agents/claude` → agent dừng, không reply nữa
- [ ] Restart server → agent tự resume, tiếp tục reply khi nhận message mới
- [ ] `GET /channels/:id/messages` → thấy cả messages của user và agent (role: "assistant")

### Error handling

- [ ] POST /agents thiếu name → 400
- [ ] POST /agents channel không tồn tại → 404
- [ ] POST /agents duplicate name trong channel → 409
- [ ] DELETE /agents agent không tồn tại → 404

### Code quality

- [ ] TypeScript strict mode, không có `any` type
- [ ] `providers/anthropic.ts` không còn `process.stdout.write`
- [ ] Worker loop không crash khi LLM error — chỉ log và tiếp tục
- [ ] Prepared statements cho tất cả agent queries

---

## 7. File Structure (final)

```
src/
├── server.ts                  ← ~35 lines (+2 lines: import + resumeAll call)
├── agent/                     ← MỚI
│   ├── worker-loop.ts         ← ~70 lines: WorkerLoop class
│   ├── worker-manager.ts      ← ~35 lines: start/stop/resumeAll
│   └── system-prompt.ts       ← ~15 lines: buildSystemPrompt
├── server/
│   ├── database.ts            ← ~150 lines (+65 lines: agent CRUD + getMessagesAfter)
│   ├── router.ts              ← ~170 lines (+55 lines: 2 agent routes)
│   └── websocket.ts           ← ~36 lines (không thay đổi)
├── providers/
│   └── anthropic.ts           ← ~130 lines (-9 lines: xóa stdout writes)
└── types.ts                   ← ~110 lines (+15 lines: Agent update, CreateAgentBody, WsBroadcast update)

Estimated new code: ~230 lines. Total codebase: ~560 lines.
```

---

## 8. What is NOT in M3

- Tool execution (M4) — agent chỉ chat, không gọi tools
- Token counting / context compression (M5)
- Memory system (M6)
- Multi-agent coordination (M7)
- Agent authentication / authorization
- Channels listing (`GET /channels`)
- Agent listing (`GET /channels/:id/agents`)
- Message pagination
- Heartbeat / stuck agent detection (đơn giản hóa khỏi scope M3)
- React UI (M10)
