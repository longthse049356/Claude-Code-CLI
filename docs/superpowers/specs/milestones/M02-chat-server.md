# M2: Chat Server

**Concept:** HTTP, WebSocket, SQLite, real-time messaging

## What you'll build

```
src/
├── index.ts              — Bun.serve() HTTP + WebSocket on one port
├── server/
│   ├── router.ts         — Route matching (GET/POST/PUT/DELETE)
│   ├── websocket.ts      — WS connection management, broadcast
│   └── database.ts       — SQLite init, migrations, prepared statements
├── providers/
│   └── anthropic.ts      — (from M1)
└── types.ts
```

## Scope

- `Bun.serve()` handles HTTP and WebSocket on port 3456
- SQLite database with 3 tables: `channels`, `messages`, `agents`
- REST API: `POST /channels`, `GET /channels/:id/messages`, `POST /channels/:id/messages`
- WebSocket: client connects → receives real-time messages when new messages arrive
- On POST message → save to SQLite → broadcast via WebSocket
- No agent yet — human messages only

## Test cases

1. `curl POST /channels` → create channel, receive channel_id
2. `curl POST /channels/:id/messages body={"text":"Hello"}` → 201
3. `curl GET /channels/:id/messages` → array of messages
4. `wscat -c ws://localhost:3456/ws` → connect successfully
5. POST message while wscat listening → wscat receives message real-time
6. Restart server → messages still there (SQLite persistence)

## Key concepts

| Keyword | One-liner | FE analogy |
|---|---|---|
| **Bun.serve()** | 1 function handling HTTP + WS, no Express needed | Like Next.js but no framework — you route manually |
| **SQLite WAL** | Write-Ahead Logging for concurrent read/write | Like optimistic update — write first, sync later |
| **Prepared statements** | SQL query compiled once, run many times with different params | Like useMemo — avoid re-computation |
| **WebSocket broadcast** | Server keeps Set\<WS\>, loops through sending message to all | Like useContext — one update, everywhere receives |
| **Migration** | SQL script that runs once to create/modify table schema | Database versioning — schema evolves over time |

## Clawd docs to read

`architecture.md` — Database Architecture section, see 5 databases schema.

## After this milestone

You understand the backend of any chat app. Claude Code desktop, ChatGPT, Cursor — all have a server saving messages to DB and broadcasting via WebSocket.
