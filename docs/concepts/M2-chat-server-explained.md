# M2 — Chat Server: Giải thích toàn bộ

> Tài liệu này giải thích **tại sao** M2 tồn tại, **từng file** làm gì, **từng kỹ thuật** quan trọng như thế nào, và **mindset** bạn cần internalize để hiểu backend của bất kỳ chat app nào. Viết cho FE developer đã biết React/Next.js nhưng chưa quen với Bun server và SQLite.

---

## 1. Tại sao cần M2?

M1 dạy bạn: AI chỉ là một HTTP API. Bạn gửi messages lên, nhận về text.

Nhưng M1 có vấn đề lớn: **mỗi lần restart terminal là mất hết conversation**. Không có persistence, không có nhiều user cùng lúc, không có real-time.

M2 giải quyết 3 câu hỏi nền tảng của bất kỳ chat app nào:

| Câu hỏi | Giải pháp M2 |
|---|---|
| Làm sao lưu messages? | SQLite — database file ngay trong project |
| Làm sao nhiều client kết nối? | HTTP server với `Bun.serve()` |
| Làm sao messages hiện real-time? | WebSocket — kết nối hai chiều luôn mở |

> **Claude Code, ChatGPT, Cursor** — tất cả đều có một server làm đúng 3 việc này. M2 là nền tảng của tất cả chúng.

---

## 2. File map — Ai làm gì

```
src/
├── server.ts          — Bun.serve(): nhận tất cả connections vào, phân luồng
├── server/
│   ├── database.ts    — SQLite: lưu và truy vấn data
│   ├── router.ts      — HTTP: nhận request, trả response
│   └── websocket.ts   — WS: quản lý kết nối real-time
└── types.ts           — Định nghĩa shape của data
```

**FE Analogy:**

| Backend file | FE equivalent |
|---|---|
| `server.ts` | `_app.tsx` trong Next.js — wiring điểm vào, không có logic |
| `router.ts` | `pages/api/*.ts` — mỗi route là một handler |
| `database.ts` | `lib/db.ts` hoặc Prisma client — abstraction layer trên storage |
| `websocket.ts` | `useWebSocket` hook hoặc Pusher client — real-time layer |

---

## 3. `Bun.serve()` — Một server, mọi thứ

### Vấn đề cần hiểu

Trong Node.js/Express truyền thống, bạn cần:
- `express()` cho HTTP
- `ws` library riêng cho WebSocket
- Chạy trên 2 port khác nhau hoặc cấu hình phức tạp

Bun làm khác: **một `Bun.serve()` xử lý cả HTTP lẫn WebSocket trên cùng port 3456.**

```typescript
Bun.serve({
  port: 3456,

  // Mọi connection đều vào đây trước
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      // "Upgrade" HTTP connection → WebSocket connection
      server.upgrade(req);
      return; // không trả về Response — connection đã đổi protocol
    }
    // HTTP bình thường → delegate sang router
    return handleRequest(req);
  },

  // Handlers riêng cho WebSocket events
  websocket: wsHandlers,
});
```

### Tại sao `upgrade()` là magic?

Một WebSocket connection **bắt đầu** là HTTP request. Browser gửi:
```http
GET /ws HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
```

Server nhìn vào header `Upgrade: websocket`, đồng ý nâng cấp, và từ lúc đó connection không còn là HTTP nữa — nó trở thành một **TCP connection hai chiều luôn mở**.

`server.upgrade(req)` làm đúng việc đó. Sau khi upgrade, connection được chuyển sang `wsHandlers.open()`.

**FE Analogy:** Giống như bạn đang dùng `fetch()` (HTTP), rồi switch sang `new WebSocket()`. Nhưng khác là từ phía server — bạn nhận một HTTP request và "biến" nó thành một WS connection.

### Tại sao không return Response sau upgrade?

```typescript
fetch(req, server) {
  if (pathname === "/ws") {
    server.upgrade(req);
    return; // ← return undefined, không phải new Response()
  }
  return handleRequest(req); // ← HTTP: phải return Response
}
```

HTTP protocol: mỗi request phải có response. Nhưng sau khi upgrade, connection đã chuyển sang protocol khác — không còn request/response nữa. Return `undefined` ở đây là Bun API convention: "tôi đã handle connection này theo cách khác, đừng chờ Response."

---

## 4. `database.ts` — SQLite và 3 kỹ thuật quan trọng

### 4.1 Tại sao SQLite?

SQLite là một database đặc biệt: **không cần server riêng**. Toàn bộ database là một file `chat.db` trong project.

```
PostgreSQL:  App → TCP → DB Server process → files trên disk
SQLite:      App → bun:sqlite → file trên disk (không có server giữa)
```

**Trade-off:**
- ✅ Zero setup, zero config, một file duy nhất
- ✅ Cực nhanh vì không có network roundtrip
- ❌ Không scale được khi cần nhiều server instances
- ❌ Concurrent writes bị bottleneck (giải quyết bằng WAL — xem 4.2)

Với Clawd, SQLite là lựa chọn đúng vì chúng ta đang học — không phải build production system.

### 4.2 WAL mode — Tại sao quan trọng?

SQLite mặc định dùng **journal mode**: khi write, lock toàn bộ file. Read phải đợi write xong.

```
Mặc định (journal mode):
  Thread A đang READ  ──────────┐
  Thread B muốn WRITE           │ phải ĐỢI
                                ↓
  Thread A xong → Thread B được WRITE → Thread A READ tiếp

WAL mode (Write-Ahead Log):
  Thread A đang READ  ────────────────── đọc snapshot cũ, không bị block
  Thread B muốn WRITE ── ghi vào WAL file riêng, không đụng đến main DB
```

**WAL là gì?** Thay vì ghi thẳng vào `chat.db`, SQLite ghi vào `chat.db-wal` trước. Background process sẽ merge WAL vào main file khi idle. File `chat.db-shm` là shared memory index để coordinate việc này.

```typescript
db.exec("PRAGMA journal_mode = WAL;");
```

Một dòng này = nhiều người gửi message cùng lúc không block nhau.

**FE Analogy:** Giống như optimistic update trong React Query — bạn update local state ngay (WAL), rồi sync lên server sau (merge vào main DB). UX mượt hơn vì không cần đợi.

### 4.3 Prepared statements — Tại sao quan trọng?

**Vấn đề 1: SQL injection**

```typescript
// ❌ NGUY HIỂM — string interpolation
db.exec(`SELECT * FROM channels WHERE id = '${channelId}'`);

// Nếu channelId = "'; DROP TABLE channels; --"
// → SQL thực thi: SELECT * FROM channels WHERE id = ''; DROP TABLE channels; --
// → Xóa sạch database!
```

```typescript
// ✅ AN TOÀN — prepared statement với ?
const stmt = db.prepare("SELECT * FROM channels WHERE id = ?");
stmt.get(channelId); // channelId được escape tự động
```

**Vấn đề 2: Performance**

Mỗi lần run SQL, database engine phải:
1. Parse SQL text → AST
2. Optimize query plan
3. Execute

Nếu chạy 1000 requests/giây, bước 1-2 lặp lại 1000 lần — lãng phí.

Prepared statement: compile SQL **một lần** khi server khởi động, lưu kết quả, sau đó chỉ execute với parameters khác nhau.

```typescript
// Compile once — chạy khi initDatabase()
const stmtGetChannel = db.prepare("SELECT * FROM channels WHERE id = ?");

// Execute many — chạy mỗi lần có request
stmtGetChannel.get("channel-id-1"); // nhanh, không parse lại
stmtGetChannel.get("channel-id-2"); // nhanh
stmtGetChannel.get("channel-id-3"); // nhanh
```

**FE Analogy:** Giống như `useMemo` — tính toán đắt tiền chỉ chạy một lần, kết quả được cache và reuse.

---

## 5. `router.ts` — Manual routing, không framework

### Tại sao không dùng Express hay Hono?

M2 route thủ công để bạn hiểu **framework làm gì bên dưới** — không dùng magic. Khi bạn hiểu cách làm thủ công, bạn có thể debug framework bất kỳ.

### Cơ chế route matching

```typescript
const parts = url.pathname.split("/").filter(Boolean);
// "/channels/abc-123/messages" → ["channels", "abc-123", "messages"]

// Match từng route bằng cách kiểm tra:
// 1. HTTP method
// 2. Số lượng path parts
// 3. Nội dung từng part (fixed vs variable)

if (method === "POST" && parts.length === 1 && parts[0] === "channels") {
  // POST /channels
}

if (method === "GET" && parts.length === 3 && parts[0] === "channels" && parts[2] === "messages") {
  // GET /channels/:id/messages
  const channelId = parts[1]; // ← lấy dynamic segment
}
```

**FE Analogy:** Giống như Next.js App Router phân tích `[id]` trong `app/channels/[id]/messages/page.tsx`. Bạn đang tự viết phần đó.

### `satisfies` — Tại sao dùng thay vì type assertion?

```typescript
// ❌ Type assertion — TypeScript tin bạn, không check
return json({ error: "not found" } as ApiError, 404);

// ✅ satisfies — TypeScript kiểm tra, nhưng giữ nguyên inferred type
return json({ error: "not found" } satisfies ApiError, 404);
```

Nếu bạn typo `{ errer: "not found" }`, `satisfies` sẽ báo lỗi compile time. `as` sẽ không báo.

**Mindset:** `as` là "tôi biết hơn TypeScript". `satisfies` là "TypeScript, hãy kiểm tra giúp tôi." Luôn prefer `satisfies` khi có thể.

---

## 6. `websocket.ts` — Real-time với Set<WebSocket>

### Cơ chế hoạt động

```typescript
const clients = new Set<ServerWebSocket<unknown>>();
```

Server giữ một `Set` chứa tất cả WebSocket connections đang mở. Mỗi khi có client connect, add vào Set. Disconnect thì remove.

```
Client A connects → clients = {wsA}
Client B connects → clients = {wsA, wsB}
Client C connects → clients = {wsA, wsB, wsC}
Client B disconnects → clients = {wsA, wsC}
```

Khi có message mới:

```typescript
export function broadcast(data: WsBroadcast): void {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    client.send(payload); // gửi tới từng client trong Set
  }
}
```

**FE Analogy:** Giống như `useContext` — một chỗ update, tất cả components đang subscribe đều nhận được. `clients` Set là "context store", `broadcast()` là "dispatch action", `client.send()` là "re-render subscriber".

### Tại sao dùng Set thay vì Array?

```
clients.add(ws)    — O(1) — Set: không loop, hash lookup
clients.delete(ws) — O(1) — Set: không cần findIndex

clients.push(ws)         — O(1) — Array ok
clients.splice(idx, 1)   — O(n) — Array: phải tìm index trước
```

Với 10,000 concurrent connections, `delete` từ Array = loop 10,000 phần tử mỗi lần disconnect. Set = instant.

### Vì sao M2 chỉ server → client?

```typescript
message(_ws, _msg): void {
  // M2: server → client only. Client messages are ignored.
}
```

M2 chỉ cần broadcast khi có message mới qua HTTP POST. Client gửi WS message là pattern của M3+ khi agent loop cần bidirectional communication. Giữ M2 đơn giản: WS chỉ để receive, không để send.

---

## 7. Flow toàn bộ — Khi user gửi message

```
curl POST /channels/abc/messages body={"text":"Hello"}
│
▼ Bun.serve() nhận HTTP request
│
├─ pathname != "/ws" → không upgrade → gọi handleRequest(req)
│
▼ router.ts: handleRequest()
│
├─ Parse URL → parts = ["channels", "abc", "messages"]
├─ Method = POST, parts.length = 3 → match route POST /channels/:id/messages
│
├─ Parse body → { text: "Hello" }
├─ Validate: text không rỗng ✓
│
├─ getChannel("abc") → Channel | null
│   └─ database.ts: stmtGetChannel.get("abc") → trả về channel object
│
├─ channel tồn tại ✓
│
├─ Tạo DbMessage:
│   { id: uuid(), channel_id: "abc", text: "Hello", role: "user", created_at: Date.now() }
│
├─ createMessage(msg)
│   └─ database.ts: stmtInsertMessage.run(...) → ghi vào chat.db
│
├─ broadcast({ type: "new_message", data: msg })
│   └─ websocket.ts: loop qua clients Set → ws.send(JSON)
│        ↓
│        Mỗi wscat / browser đang kết nối nhận ngay:
│        {"type":"new_message","data":{"id":"...","text":"Hello",...}}
│
└─ return json(msg, 201)
     ↓
     curl nhận: {"id":"...","text":"Hello","role":"user","created_at":...}
```

**Điều quan trọng:** HTTP và WebSocket xảy ra **song song**:
- HTTP caller (curl) nhận response 201 với message object
- WebSocket clients nhận broadcast **cùng lúc** — không phải sau

---

## 8. 5 Mindsets cần internalize

### 8.1 HTTP là stateless — WebSocket là stateful

```
HTTP:    Client gửi request → Server xử lý → trả response → kết thúc
         Mỗi request là độc lập, server không nhớ client là ai

WebSocket: Client connect → Server nhớ trong clients Set
           Connection tồn tại vô thời hạn
           Ai cũng có thể gửi message bất cứ lúc nào
```

Đây là tại sao bạn không thể "push" data về browser bằng HTTP thuần — HTTP không có khái niệm "server chủ động gửi". Phải dùng WebSocket (hoặc SSE) cho real-time.

### 8.2 Database là source of truth — WebSocket là delivery mechanism

```
HTTP POST message → SQLite (lưu) → WebSocket (deliver)
```

Nếu SQLite fail, message không được lưu → không broadcast.
Nếu WebSocket fail, message vẫn được lưu → client reconnect sau vẫn GET được.

**Mindset:** Đừng bao giờ chỉ broadcast mà không lưu. Storage trước, delivery sau.

### 8.3 Prepared statements = Security + Performance, không tách được

Nhiều người nghĩ prepared statements chỉ để tăng performance. Sai — chúng là **cơ chế bảo mật primary** chống SQL injection. Hai lợi ích này không tách rời nhau trong thiết kế.

Mỗi khi bạn muốn dùng string interpolation trong SQL → **dừng lại**. Luôn dùng `?` parameters.

### 8.4 Manual routing = Hiểu framework

Express, Hono, Elysia — tất cả đều làm đúng những gì `router.ts` của bạn làm, chỉ thêm nhiều features. Khi bạn gặp bug trong framework, bạn biết cần nhìn vào đâu.

```
Framework magic:  router.get("/channels/:id/messages", handler)
Thực tế bên dưới: split pathname, check method, extract params, call handler
```

### 8.5 WAL mode là default tốt cho mọi Bun SQLite app

Không có lý do gì để không bật WAL. Nó chỉ tốt hơn journal mode trong mọi use case của chat app:
- Concurrent reads không block writes
- Writes không block reads
- Không làm chậm single-user case

Cứ bật mặc định: `db.exec("PRAGMA journal_mode = WAL;")` — một dòng, lợi mãi mãi.

---

## 9. Những gì M2 chưa có (và sẽ được thêm ở milestone sau)

| Tính năng | Milestone |
|---|---|
| AI agent reply trong channel | M3 (Agent Loop) |
| AI tự gọi tool, xem kết quả, tiếp tục | M4 (Tool System) |
| Context management khi history quá dài | M5 |
| WS bidirectional — client gửi message qua WS | M3+ |
| Auth, rate limiting | Production hardening |
| React UI để chat trong browser | M10 |

---

## 10. Tổng kết — M2 dạy bạn điều gì?

Sau M2, bạn hiểu rằng:

1. **`Bun.serve()` = HTTP + WS trên một port** — không cần Express, không cần 2 server.

2. **WebSocket = HTTP connection được "upgrade"** — bắt đầu là GET request, kết thúc là persistent connection.

3. **SQLite WAL = concurrent safe** — reads và writes không block nhau. Một PRAGMA là đủ.

4. **Prepared statements = compile once, run many** — security + performance, không có lý do không dùng.

5. **broadcast = loop qua Set** — không có magic. Real-time chỉ là "gửi JSON cho tất cả connections trong Set."

6. **Storage trước, delivery sau** — SQLite là source of truth. WebSocket chỉ là notification channel.

> **Bất kỳ chat app nào — Slack, Discord, ChatGPT — đều có một server làm đúng 6 việc này. Bạn vừa tự build nó từ đầu.**

---

*Spec: [`docs/superpowers/specs/milestones/M02-chat-server.spec.md`](../superpowers/specs/milestones/M02-chat-server.spec.md)*
*Plan: [`docs/superpowers/plans/2026-04-12-M2-chat-server.md`](../superpowers/plans/2026-04-12-M2-chat-server.md)*
