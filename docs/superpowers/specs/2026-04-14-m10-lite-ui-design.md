# M10 Lite UI — Design Document

**Date:** 2026-04-14  
**Status:** Approved  
**Milestone:** M10 Lite (React UI trước M4, thao tác với M1-M3 backend)

---

## 1. Context

M3 đã xong (agent loop, polling, worker manager). Trước khi tiếp tục M4 (tool system), build một React UI đơn giản để:
- Visualize những gì đã build (channels, messages, agents)
- Testing dễ hơn curl/wscat (nhiều biến số hơn, real-time feedback)
- Phù hợp với background FE developer

---

## 2. Architecture tổng thể

### Package structure

```
Claude-Code-CLI/
├── src/                        # Bun server (hiện tại, M1-M3)
│   ├── server/
│   │   ├── router.ts           # + thêm GET /channels
│   │   ├── websocket.ts        # không đổi
│   │   ├── database.ts         # + thêm getAllChannels()
│   │   └── logger.ts           # NEW — wrapper broadcast log qua WS
│   ├── agent/
│   ├── server.ts               # + thêm serveStatic() fallback
│   └── types.ts                # + thêm { type: "log" } vào WsBroadcast
└── packages/
    └── ui/                     # NEW — React + Vite app
        ├── src/
        │   ├── components/
        │   ├── stores/
        │   ├── hooks/
        │   └── App.tsx
        ├── vite.config.ts
        └── package.json
```

### Request flow

**Dev mode:**
```
Browser :5173 (Vite HMR)
    ↕ proxy /channels/* và /ws
Bun server :3456 (API + WebSocket)
```

**Production (Approach B):**
```
Browser → localhost:3456
    ├── /channels/* → router.ts (REST API)
    ├── /ws         → websocket.ts (WebSocket)
    └── /*          → packages/ui/dist/ (static files)
```

---

## 3. Server-side changes

### 3.1 `src/types.ts`

Thêm `{ type: "log" }` vào `WsBroadcast`:

```typescript
export type WsBroadcast =
  | { type: "new_message"; data: DbMessage }
  | { type: "typing"; data: { agent_name: string; channel_id: string } }
  | { type: "log"; data: string };  // NEW
```

### 3.2 `src/server/database.ts`

Thêm hàm `getAllChannels()`:

```typescript
export function getAllChannels(): Channel[] {
  return db.query<Channel, []>("SELECT * FROM channels ORDER BY created_at ASC").all();
}
```

### 3.3 `src/server/logger.ts` (file mới)

Wrapper capture `console.log` và broadcast qua WebSocket:

```typescript
import { broadcast } from "./websocket.ts";

export function log(...args: unknown[]): void {
  const msg = args.map(String).join(" ");
  console.log(msg);
  broadcast({ type: "log", data: msg });
}
```

Thay tất cả `console.log(...)` trong `router.ts`, `worker-loop.ts`, `worker-manager.ts` bằng `log(...)`.

### 3.4 `src/server/router.ts`

Thêm 2 routes mới:

```typescript
// GET /channels — list all channels
if (req.method === "GET" && parts.length === 1 && parts[0] === "channels") {
  const channels = getAllChannels();
  return json(channels);
}

// GET /channels/:id/agents — list agents in a channel (cần cho AgentPanel)
if (req.method === "GET" && parts.length === 3 && parts[0] === "channels" && parts[2] === "agents") {
  const channelId = parts[1];
  const channel = getChannel(channelId);
  if (!channel) return json({ error: "channel not found" } satisfies ApiError, 404);
  const agents = getAgentsByChannel(channelId); // thêm vào database.ts
  return json(agents);
}
```

`database.ts` cần thêm:
```typescript
export function getAgentsByChannel(channelId: string): Agent[] {
  return db.query<Agent, [string]>("SELECT * FROM agents WHERE channel_id = ?", [channelId]).all();
}
```

### 3.5 `src/server.ts`

Thêm `serveStatic()` fallback sau khi router trả 404:

```typescript
async function serveStatic(pathname: string): Promise<Response> {
  const distDir = path.join(import.meta.dir, "../packages/ui/dist");
  // Sanitize: ngăn path traversal (../../../etc)
  const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(distDir, safePath || "index.html");
  const file = Bun.file(filePath);
  if (await file.exists()) return new Response(file);
  // SPA fallback
  return new Response(Bun.file(path.join(distDir, "index.html")));
}

// Trong fetch handler:
const response = await handleRequest(req);
if (response.status !== 404) return response;
return serveStatic(url.pathname);
```

---

## 4. Frontend structure

### 4.1 Setup

```bash
# Scaffold
bun create vite packages/ui --template react-ts

# Shadcn init (tự setup Tailwind + utils + components/ui/)
cd packages/ui && bunx shadcn@latest init

# State + data fetching
bun add zustand @tanstack/react-query

# Shadcn components dùng trong app
bunx shadcn@latest add button input card badge scroll-area separator
```

### 4.2 Zustand stores

**`src/stores/useAppStore.ts`** — UI state:

```typescript
interface AppStore {
  selectedChannelId: string | null;
  setSelectedChannel: (id: string) => void;
}
```

**`src/stores/useWsStore.ts`** — realtime data từ WebSocket:

```typescript
interface WsStore {
  connected: boolean;
  messages: Record<string, DbMessage[]>; // channelId → messages[]
  typingAgents: { agent_name: string; channel_id: string }[];
  logs: string[];
  // actions
  setConnected: (v: boolean) => void;
  addMessage: (msg: DbMessage) => void;
  setTyping: (data: { agent_name: string; channel_id: string }) => void;
  clearTyping: (channelId: string) => void;
  addLog: (log: string) => void;
}
```

### 4.3 TanStack Query hooks

**`src/hooks/useChannels.ts`:**
```typescript
useQuery(['channels']) → GET /channels
useMutation → POST /channels  (create)
```

**`src/hooks/useMessages.ts`:**
```typescript
useQuery(['messages', channelId]) → GET /channels/:id/messages
```

**`src/hooks/useAgents.ts`:**
```typescript
useQuery(['agents', channelId]) → GET /channels/:id/agents
useMutation → POST /channels/:id/agents   (add agent)
useMutation → DELETE /channels/:id/agents/:name  (remove agent)
```

### 4.4 WebSocket hook

**`src/hooks/useWebSocket.ts`** — mount 1 lần tại `App.tsx`:

```typescript
// URL: dùng window.location để tự động work cả dev (proxy) lẫn production
const wsUrl = `ws://${window.location.host}/ws`;

useEffect(() => {
  let ws: WebSocket;
  let retryDelay = 1000;

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { setConnected(true); retryDelay = 1000; };
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, Math.min(retryDelay *= 2, 30000)); // backoff max 30s
    };
    ws.onmessage = (e) => {
      const event: WsBroadcast = JSON.parse(e.data);
      if (event.type === "new_message") addMessage(event.data);
      if (event.type === "typing")      setTyping(event.data);
      if (event.type === "log")         addLog(event.data);
    };
  }

  connect();
  return () => ws.close();
}, []);
```

### 4.5 Component layout

```
App.tsx
├── <QueryClientProvider>
├── useWebSocket()              ← mount 1 lần
└── Dashboard (CSS Grid 3 cột)
    ├── ChannelPanel [220px]
    │   ├── channel list (useChannels query)
    │   └── create channel form
    ├── ChatPanel [flex-1]
    │   ├── MessageList (wsStore.messages + useMessages query)
    │   ├── TypingIndicator (wsStore.typingAgents)
    │   └── Composer (POST /channels/:id/messages)
    └── RightSidebar [260px]
        ├── AgentPanel
        │   ├── agent list + status (running/stopped)
        │   ├── add agent form
        │   └── remove agent button
        └── LogPanel
            └── log stream (wsStore.logs, scroll-to-bottom)
```

**Dashboard CSS Grid:**
```css
.dashboard {
  display: grid;
  grid-template-columns: 220px 1fr 260px;
  height: 100vh;
}
```

---

## 5. Vite config

```typescript
// packages/ui/vite.config.ts
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": "/src" } },
  server: {
    proxy: {
      "/channels": "http://localhost:3456",
      "/ws": { target: "ws://localhost:3456", ws: true },
    },
  },
})
```

---

## 6. Scripts (root `package.json`)

```json
{
  "scripts": {
    "dev":        "bun run --parallel dev:server dev:ui",
    "dev:server": "bun --watch src/server.ts",
    "dev:ui":     "cd packages/ui && bun run dev",
    "build:ui":   "cd packages/ui && bun run build",
    "start":      "bun src/server.ts"
  }
}
```

---

## 7. Edge cases & error handling

| Case | Handling |
|---|---|
| Server chưa chạy khi mở UI | WS status bar hiển thị "Disconnected", auto-retry |
| Channel chưa được chọn | ChatPanel hiển thị placeholder "Select a channel" |
| Agent typing timeout | `clearTyping` sau 5s không có message mới |
| `packages/ui/dist/` chưa build | Server trả lỗi rõ ràng thay vì crash |
| WS reconnect | Exponential backoff: 1s → 2s → 4s → max 30s |
| Log panel overflow | Giới hạn 500 entries, tự xóa entries cũ nhất |

---

## 8. Acceptance criteria

- [ ] `bun run dev` khởi động cả Bun server (:3456) và Vite (:5173)
- [ ] Mở `http://localhost:5173` → Dashboard 4 panels hiển thị
- [ ] ChannelPanel: list channels, tạo channel mới
- [ ] ChatPanel: gửi message, xem history, typing indicator realtime
- [ ] AgentPanel: add/remove agent, thấy agent đang running
- [ ] LogPanel: stream server logs realtime khi có activity
- [ ] `bun run build:ui && bun run start` → mở `http://localhost:3456` → UI load đúng
- [ ] WS status hiển thị "Connected" / "Disconnected" chính xác

---

## 9. What is NOT in this milestone

- Chrome extension (MV3) — defer đến M10 full
- Artifact rendering — defer đến M10 full
- Authentication / multi-user
- Mobile responsive layout
- Message streaming (hiển thị text từng token) — agent reply sau khi hoàn thành
- Pagination cho message history
