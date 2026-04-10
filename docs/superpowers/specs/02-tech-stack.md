# Tech Stack Decisions

## Bun over Node.js
Clawd needs SQLite + WebSocket + single binary compilation. Bun provides all three built-in. Node.js would require 3 separate dependencies. Fewer dependencies = fewer bugs = less maintenance.

## SQLite over PostgreSQL/MongoDB
Clawd is a single-user local tool, not SaaS. No need for horizontal scaling. SQLite + WAL mode is the perfect solution: one `.db` file, copy to backup, embed in binary.

## No framework (raw Bun.serve)
Framework abstraction hides how HTTP actually works. `Bun.serve()` exposes the raw truth: HTTP request = `Request` object, you return a `Response` object. That's all HTTP is.

## 5 SQLite databases instead of 1
Separation of concerns at database level. Each database = one domain. Benefits: independent backup, per-database WAL (no cross-locking), isolated migrations.

## Polling (200ms) over event-driven for agents
1. Agent needs a control loop — checks more than just messages (spaces, heartbeat, token budget)
2. Resilience — crash mid-processing, restart, poll from `lastProcessedId`
3. Rate control — 200ms = max 5 LLM calls/second, natural rate limiting
4. Simplicity — one loop, easy to debug

## Zod for runtime validation
TypeScript only checks at compile time. At runtime, any JSON can arrive. Zod validates at system boundaries (API endpoints, LLM responses).

## Key Patterns

- **Tool-as-communication:** Agent calls `chat_send_message(text)` tool instead of streaming text directly
- **Database as message bus:** Agents communicate via SQLite, not in-memory events
- **Everything is a channel:** Main chat, sub-agent space, scheduled job — all use the same channel abstraction
- **Graceful degradation:** Context too long → compact. Tool timeout → error result. Agent stuck → heartbeat restart.
