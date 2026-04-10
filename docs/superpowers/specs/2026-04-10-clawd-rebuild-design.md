# Clawd Rebuild — Design Spec

## Overview

Rebuild the [Clawd](https://github.com/Tuanm/clawd) AI agent platform from scratch across 10 incremental milestones. Each milestone produces a working, testable system and teaches one core concept of AI agent architecture.

**Original project:** https://github.com/Tuanm/clawd | https://tuanm.github.io/clawd/

**Goal:** Understand the architecture, mindset, and technologies behind AI agent platforms (Claude Code, Cursor, etc.) by building one from zero.

**Approach:** Hybrid milestones (Approach C) — start from a terminal chatbot, incrementally add features. Each step answers: "Clawd solves this problem like X — why?"

**Target user:** FE developer (JavaScript, React, Next.js) with limited BE/Bun experience and no prior AI agent/LLM API experience.

---

## Section 1: Mental Model & Core Architecture

### "Clawd is a chat room — AI agents are participants"

Clawd is not an "app that calls AI." It is a **chat platform** where humans and AI participate as equals.

- Agents are not invoked directly — they **poll** messages, like a user refreshing their inbox
- Agents reply by calling the `chat_send_message()` tool, not by streaming text to console
- Multi-agent = multiple "users" reading the same channel, each deciding when to reply

### The ReAct Loop — Heart of every AI agent

Claude Code, Cursor Agent, Devin, and every agentic tool runs on one fundamental loop:

1. **Observe** — Read current state (messages, tool results)
2. **Reason** — Call LLM: "Given this context, what should I do?"
3. **Act** — LLM returns `tool_use` block → execute tool
4. **Loop** — Tool result appended to context → back to Observe

The loop ends when the LLM returns plain text instead of `tool_use` — that's the agent "speaking."

### Why Bun over Node.js

- `bun:sqlite` — built-in SQLite, zero dependencies
- `bun build --compile` — single binary compilation with embedded UI
- Native WebSocket in `Bun.serve()` — HTTP + WS on one process, no `ws` package

---

## Section 2: 10 Milestones

### M1: Terminal Chatbot

**Concept:** LLM API, streaming, tool_use format

**Build:**
```
src/
├── index.ts          — Entry point, readline loop
├── providers/
│   └── anthropic.ts  — Claude API call, streaming handler
└── types.ts          — Message, ToolUse, ToolResult types
```

**Scope:**
- Read API key from environment variable
- Send messages to Claude API (Anthropic SDK)
- Handle streaming response (token-by-token via SSE)
- Parse response: distinguish `text` block vs `tool_use` block
- Display tool_use blocks in terminal (no execution yet, just show JSON)
- Keep conversation history in-memory (array)

**Test cases:**
1. Type "Hello" → receive streaming text response
2. Type "Read file package.json" → receive tool_use block `{name: "read_file", input: {path: "package.json"}}` displayed as JSON
3. Chat 5 turns → context preserved (AI remembers previous messages)
4. Long message → streaming displays token-by-token, no waiting

**Key concepts:** LLM API, Streaming (SSE), Messages array, tool_use block, Stop reason

---

### M2: Chat Server

**Concept:** HTTP, WebSocket, SQLite, real-time messaging

**Build:**
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

**Scope:**
- `Bun.serve()` handles HTTP and WebSocket on port 3456
- SQLite database with 3 tables: `channels`, `messages`, `agents`
- REST API: `POST /channels`, `GET /channels/:id/messages`, `POST /channels/:id/messages`
- WebSocket: client connects → receives real-time messages when new messages arrive
- On POST message → save to SQLite → broadcast via WebSocket
- No agent yet — human messages only

**Test cases:**
1. `curl POST /channels` → create channel, receive channel_id
2. `curl POST /channels/:id/messages body={"text":"Hello"}` → 201
3. `curl GET /channels/:id/messages` → array of messages
4. `wscat -c ws://localhost:3456/ws` → connect successfully
5. POST message while wscat listening → wscat receives message real-time
6. Restart server → messages still there (SQLite persistence)

**Key concepts:** Bun.serve(), SQLite WAL mode, Prepared statements, WebSocket broadcast, Database migrations

---

### M3: Agent Loop

**Concept:** ReAct pattern, polling, worker loop

**Build:**
```
src/
├── agent/
│   ├── worker-loop.ts    — Polling: check messages → call LLM → post reply
│   ├── worker-manager.ts — Manage multiple worker loops
│   └── system-prompt.ts  — Build system prompt for agent
├── server/
│   ├── router.ts         — Add route: POST /channels/:id/agents
│   └── ...
└── ...
```

**Scope:**
- Agent config: `{name, model, system_prompt}`
- Adding agent to channel → starts worker loop
- Worker loop every 200ms: check for new messages → call LLM → save response → broadcast
- Agent replies by INSERT into messages table (same as human, but `role: "assistant"`)
- "Typing indicator" via WebSocket event while agent is processing
- Stop loop when agent removed or server shutdown

**Test cases:**
1. `POST /channels/:id/agents body={"name":"claude"}` → agent starts
2. POST message "Hello" → seconds later, agent auto-replies
3. wscat receives typing event, then message event
4. POST 3 messages rapidly → agent replies sequentially (queue, no skip)
5. `DELETE /channels/:id/agents/:name` → agent stops polling
6. Restart server → agent auto-resumes

**Key concepts:** Worker loop, ReAct loop, System prompt, Polling vs Event-driven, Heartbeat detection

---

### M4: Tool System

**Concept:** Tool schema, execution, path validation, sandbox basics

**Build:**
```
src/
├── tools/
│   ├── registry.ts       — Tool registry: name → handler + schema
│   ├── schemas.ts        — JSON Schema per tool
│   ├── handlers/
│   │   ├── read-file.ts
│   │   ├── write-file.ts
│   │   ├── bash.ts       — Shell command execution (Bun.spawn)
│   │   ├── glob.ts
│   │   └── grep.ts
│   └── sandbox.ts        — Path validation, command filtering
├── agent/
│   └── worker-loop.ts    — Updated: tool_use → execute → loop
└── ...
```

**Scope:**
- Tool registry: map `{name, description, input_schema}` → handler function
- 5 basic tools: `read_file`, `write_file`, `bash`, `glob`, `grep`
- Worker loop extended: detect `tool_use` → execute → append `tool_result` → call LLM again
- Path validation: agent can only access files within project directory
- Bash timeout: commands running over 30s get killed
- Tool schemas sent to LLM in API call via `tools` parameter

**Test cases:**
1. "Read file package.json" → agent calls read_file → returns content
2. "Create file hello.txt with Hello World" → write_file → file created
3. "Run ls -la" → bash tool → listing result
4. "Find all .ts files" → glob tool → file list
5. "Read /etc/passwd" → BLOCKED by path validation
6. Agent chains tools: "Read file X then fix line 5" → read → write

**Key concepts:** Tool schema (JSON Schema), Tool registry, tool_result message, Function calling, Sandbox/path validation

---

### M5: Context Management

**Concept:** Token counting, message scoring, compression, sliding window

**Build:**
```
src/
├── agent/
│   ├── context/
│   │   ├── token-counter.ts  — Approximate token counting
│   │   ├── scorer.ts         — Score messages by importance
│   │   ├── compactor.ts      — Compress old messages to summary
│   │   └── builder.ts        — Build final messages array for LLM call
│   └── worker-loop.ts        — Integrate context builder
└── ...
```

**Scope:**
- Token counting: approximate tokens per message
- Context budget: `max_tokens * 0.75` = threshold, `0.95` = critical
- Message scoring: system prompt (10), recent messages (8), error tool results (7), older messages (3)
- Compaction: messages older than 20 turns → summarize into 1 message
- Hybrid history: 20 most recent messages kept intact, rest compressed
- Critical reset: if exceeding 95% → keep only system prompt + 5 last messages

**Test cases:**
1. Chat 10 turns → context sent contains all 10 messages
2. Chat 50 turns → 30 old messages compressed into summary
3. Check token count before and after compaction
4. Force critical reset → only system prompt + 5 most recent remain
5. Large tool result (long file) → truncated, doesn't break context

**Key concepts:** Context window, Token, Compaction, Message scoring, Sliding window

---

### M6: Memory System

**Concept:** Session persistence, FTS5 knowledge base, long-term agent memories

**Build:**
```
src/
├── memory/
│   ├── session-history.ts    — Save/load conversation history
│   ├── knowledge-base.ts     — FTS5-indexed tool outputs
│   ├── agent-memories.ts     — Long-term facts per agent
│   └── memory-manager.ts     — Orchestrate 3 tiers
├── server/
│   └── database.ts           — Add memory.db
└── ...
```

**Scope:**
- **Session history:** Save full conversation to SQLite, restore on agent restart
- **Knowledge base:** Index tool outputs (file contents, bash results) with SQLite FTS5. Agent searches via natural language
- **Agent memories:** Facts, preferences, decisions saved by agent. Persist across sessions
- Auto-extraction: after each conversation, extract "memorable" facts
- Memory injection: relevant memories injected into system prompt each LLM call
- Secret blocklist: API keys, passwords blocked from saving

**Test cases:**
1. Chat → restart server → agent remembers old conversation
2. Agent reads file X → search "content of file X" → found in knowledge base
3. "Remember that I prefer TypeScript over JavaScript" → memory saved
4. New session → agent mentions "you prefer TypeScript"
5. Try saving "API key is sk-xxx" → blocked

**Key concepts:** FTS5 (Full-Text Search), 3-tier memory, Memory extraction, Memory injection

---

### M7: Multi-Agent & Spaces

**Concept:** Multi-agent orchestration, sub-agent spawning, isolation

**Build:**
```
src/
├── agent/
│   ├── worker-manager.ts  — Manage multiple workers per channel
│   └── worker-loop.ts     — Skip turn if another agent is replying
├── spaces/
│   ├── space-manager.ts   — Create/destroy spaces
│   └── space.ts           — Isolated channel + worker for sub-task
├── tools/handlers/
│   └── spawn-agent.ts     — Tool for agent to spawn sub-agent
└── ...
```

**Scope:**
- Multiple agents per channel, each polling independently
- Collision avoidance: if agent A is replying, agent B waits
- `spawn_agent` tool: creates isolated channel + worker for sub-task
- Space timeout: 300s default, kill if exceeded
- Max 9 spaces per channel
- Space result: report back to parent channel when done
- Recovery: restart server → resume running spaces

**Test cases:**
1. Add 2 agents to 1 channel → both reply (sequentially, no overlap)
2. Agent A calls `spawn_agent("research X")` → sub-channel created
3. Sub-agent completes → result posted to parent channel
4. Sub-agent exceeds 300s → killed, parent receives timeout error
5. Restart server mid-space → space resumes

**Key concepts:** Multi-agent, Space/Sub-agent, Collision avoidance, Orchestration

---

### M8: MCP Protocol

**Concept:** MCP server + client, tool exposure, JSON-RPC

**Build:**
```
src/
├── mcp/
│   ├── server.ts         — MCP server: expose tools via /mcp endpoint
│   ├── client.ts         — MCP client: connect to external MCP servers
│   └── transport.ts      — SSE + HTTP transport layer
├── tools/
│   └── registry.ts       — Updated: merge local tools + MCP tools
└── ...
```

**Scope:**
- **MCP Server:** Expose 10+ tools via standard MCP protocol (`/mcp` endpoint)
- **MCP Client:** Connect to external MCP servers (e.g., filesystem, GitHub)
- Transport: Streamable HTTP (SSE for server→client, POST for client→server)
- Tool discovery: MCP client auto-discovers tools from external servers
- Tool namespacing: `mcp__servername__toolname` to avoid conflicts
- Authentication: Bearer token

**Test cases:**
1. Claude Code connects to `localhost:3456/mcp` → lists tools successfully
2. Claude Code calls `mcp__clawd__chat_send_message` → message appears in channel
3. Configure external MCP server → agent sees additional tools
4. Agent calls external MCP tool → result returned correctly

**Key concepts:** MCP (Model Context Protocol), MCP Server/Client, Tool namespacing, JSON-RPC

---

### M9: Scheduling & Plugins

**Concept:** Cron scheduling, plugin architecture, skills system

**Build:**
```
src/
├── scheduler/
│   ├── scheduler-manager.ts  — 10s tick loop, check cron/interval jobs
│   ├── cron-parser.ts        — Parse cron expressions
│   └── job.ts                — Job definition + execution via spaces
├── plugins/
│   ├── plugin-manager.ts     — Load/unload plugins
│   ├── tool-plugin.ts        — Plugin that adds tools
│   └── lifecycle-plugin.ts   — Plugin with hooks (beforeTool, afterTool)
├── skills/
│   └── skill-loader.ts       — Load SKILL.md files, trigger matching
└── ...
```

**Scope:**
- **Scheduler:** Cron, interval, one-shot jobs. Execute via spaces (isolated)
- **Plugin system:** `ToolPlugin` (adds tools) + `Plugin` (lifecycle hooks)
- **Skills:** SKILL.md format, 4-directory discovery, trigger matching
- Max 3 concurrent scheduled jobs
- Job persistence in scheduler.db

**Test cases:**
1. Schedule "every minute, check server status" → runs every minute
2. One-shot job "after 30s, send reminder" → fires once, auto-deletes
3. Load custom tool plugin → agent sees new tool
4. Create SKILL.md → agent auto-triggers when relevant
5. 4 concurrent jobs → only 3 run, 1 queued

**Key concepts:** Cron expressions, Plugin/lifecycle hooks, Skill system, Tick loop

---

### M10: Browser Extension & React UI

**Concept:** Chrome MV3 extension, React UI, artifact rendering, single binary

**Build:**
```
packages/
├── ui/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── Composer.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── ArtifactRenderer.tsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   └── App.tsx
│   └── vite.config.ts
├── browser-extension/
│   ├── manifest.json
│   ├── background.ts
│   └── content-script.ts
```

**Scope:**
- **UI:** Slack-inspired chat, real-time via WebSocket, artifact rendering (HTML/React/SVG/Chart)
- **Browser extension:** Chrome MV3, CDP mode (navigate, click, screenshot, extract DOM)
- Embed UI into server binary (`Bun.build`)
- 8 artifact types: html, react, svg, chart, csv, markdown, code, interactive

**Test cases:**
1. Open `localhost:3456` → UI loads, channel list visible
2. Type message → agent replies real-time with streaming text
3. Agent creates HTML artifact → renders in sandboxed iframe
4. Agent calls browser tool "navigate to google.com" → extension executes
5. Agent takes screenshot → image displayed in chat

**Key concepts:** Artifact rendering, CDP (Chrome DevTools Protocol), MV3 extension, Embedded UI (Bun.build)

---

## Section 3: Tech Stack Decisions

### Bun over Node.js
Clawd needs SQLite + WebSocket + single binary compilation. Bun provides all three built-in. Node.js would require 3 separate dependencies. Fewer dependencies = fewer bugs = less maintenance.

### SQLite over PostgreSQL/MongoDB
Clawd is a single-user local tool, not SaaS. No need for horizontal scaling. SQLite + WAL mode is the perfect solution: one `.db` file, copy to backup, embed in binary.

### No framework (raw Bun.serve)
Framework abstraction hides how HTTP actually works. `Bun.serve()` exposes the raw truth: HTTP request = `Request` object, you return a `Response` object. That's all HTTP is.

### 5 SQLite databases instead of 1
Separation of concerns at database level. Each database = one domain. Benefits: independent backup, per-database WAL (no cross-locking), isolated migrations.

### Polling (200ms) over event-driven for agents
1. Agent needs a control loop — checks more than just messages (spaces, heartbeat, token budget)
2. Resilience — crash mid-processing, restart, poll from `lastProcessedId`
3. Rate control — 200ms = max 5 LLM calls/second, natural rate limiting
4. Simplicity — one loop, easy to debug

### Zod for runtime validation
TypeScript only checks at compile time. At runtime, any JSON can arrive. Zod validates at system boundaries (API endpoints, LLM responses).

### Key patterns
- **Tool-as-communication:** Agent calls `chat_send_message(text)` tool instead of streaming text directly
- **Database as message bus:** Agents communicate via SQLite, not in-memory events
- **Everything is a channel:** Main chat, sub-agent space, scheduled job — all use the same channel abstraction
- **Graceful degradation:** Context too long → compact. Tool timeout → error result. Agent stuck → heartbeat restart.

---

## Section 4: Data Flows

### Flow 1: User message → Agent reply
1. User POST message → server saves to SQLite → broadcasts via WebSocket
2. Worker loop detects new message → builds context (system prompt + memories + history + tool schemas)
3. Sends messages array to Claude API with `stream: true`
4. Receives tokens via SSE, buffers response
5. Saves full response to SQLite → broadcasts via WebSocket

User POST and agent reply are two completely separate operations. The user doesn't "wait" for the agent.

### Flow 2: Tool execution (ReAct loop detail)
1. Worker sends messages + tool schemas to LLM
2. LLM returns `stop_reason: "tool_use"` with tool call JSON
3. Server looks up tool in registry, validates inputs
4. Executes tool handler, gets result
5. Appends `tool_use` block + `tool_result` block to messages
6. Calls LLM again with updated messages
7. Repeats until LLM returns `stop_reason: "end_turn"`

Safety mechanisms: model auto-downgrade after 3 consecutive tool-only iterations, unused tool pruning after 5 iterations, context budget enforcement.

### Flow 3: Multi-agent coordination
- Each agent tracks its own `lastProcessedId`
- If agent A is currently replying (typing) → agent B skips this turn
- Agent only replies when last message is NOT from itself
- SQLite is the coordination layer — no in-memory locking needed

### Flow 4: Sub-agent (Space) lifecycle
1. Parent agent calls `spawn_agent(task, agent_name)`
2. SpaceManager creates isolated channel + worker
3. Sub-agent executes independently (reads files, runs tools, etc.)
4. Sub-agent completes → result posted to parent channel
5. Space destroyed (channel + worker deleted)
6. Timeout: 300s default, kill if exceeded, error report to parent

### Flow 5: MCP external tool call
1. Agent outputs `tool_use` with name `mcp__github__list_repos`
2. Server parses namespace → routes to MCP client for "github" server
3. MCP client sends JSON-RPC request to external server
4. External server returns result
5. Result returned to agent as normal `tool_result`

Agent doesn't know whether a tool is local or remote — both go through the same tool registry.

### Flow 6: Full system overview

```
Bun.serve() port 3456
├── HTTP (REST API) + WebSocket (real-time)
├── SQLite (chat.db, memory.db, scheduler.db, kanban.db, skills-cache.db)
├── Worker Manager → Worker Loops (one per agent per channel)
├── Memory Manager → Session / Knowledge (FTS5) / Long-term
├── Tool Registry → Local handlers + MCP Client (external tools)
├── Space Manager → Isolated sub-agent channels
├── Scheduler Manager → Cron/interval/one-shot via spaces
├── Plugin Manager → Tool plugins + lifecycle hooks
└── MCP Server (/mcp) → Expose tools to external clients
```

---

## Project Documentation Structure

```
project-root/
├── CLAUDE.md                    — AI assistant context (read each session)
├── CHANGELOG.md                 — Progress per milestone
├── MILESTONES.md                — Roadmap with checklist
├── docs/
│   ├── adr/                     — Architecture Decision Records
│   │   └── 001-why-bun.md      — "Context → Decision → Consequences"
│   ├── journal/                 — Learning journal / aha moments
│   ├── concepts/                — Concept explanations (Vietnamese)
│   └── clawd-notes/             — Notes from reading Clawd source
└── src/                         — Implementation
```

---

## Reference: Clawd Documentation

The original Clawd project has 11 documentation files at https://github.com/Tuanm/clawd/tree/main/docs that serve as reference for each milestone:

| File | Use at milestone |
|---|---|
| architecture.md (98KB) | M2-M10, primary reference |
| codebase-summary.md (52KB) | Start of each milestone |
| code-standards.md (34KB) | Throughout all milestones |
| agents.md (12KB) | M3, M7 |
| memory.md (15KB) | M6 |
| mcp-tools.md (16KB) | M8 |
| custom-tools.md (7KB) | M4, M9 |
| skills.md (9KB) | M9 |
| ui-design-system.md (42KB) | M10 |
| artifacts.md (4KB) | M10 |
| project-overview-pdr.md (22KB) | Before starting M1 |
| user-guide.md (21KB) | M10 for user perspective |

---

## Success Criteria

After completing all 10 milestones:
1. Working AI agent platform with multi-agent chat, tool execution, memory, and scheduling
2. Can explain every architectural decision with "why" not just "what"
3. Understands how Claude Code, Cursor, and similar tools work internally
4. Has MCP server/client working — understands the emerging AI tool standard
5. Can articulate the difference between chatbot and agent (tool-use + ReAct loop)
6. Comfortable with Bun, SQLite, WebSocket server-side — full-stack capability
