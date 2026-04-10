# Data Flows

## Flow 1: User message → Agent reply

1. User POST message → server saves to SQLite → broadcasts via WebSocket
2. Worker loop detects new message → builds context (system prompt + memories + history + tool schemas)
3. Sends messages array to Claude API with `stream: true`
4. Receives tokens via SSE, buffers response
5. Saves full response to SQLite → broadcasts via WebSocket

User POST and agent reply are two completely separate operations. The user doesn't "wait" for the agent.

## Flow 2: Tool execution (ReAct loop detail)

1. Worker sends messages + tool schemas to LLM
2. LLM returns `stop_reason: "tool_use"` with tool call JSON
3. Server looks up tool in registry, validates inputs
4. Executes tool handler, gets result
5. Appends `tool_use` block + `tool_result` block to messages
6. Calls LLM again with updated messages
7. Repeats until LLM returns `stop_reason: "end_turn"`

Safety mechanisms: model auto-downgrade after 3 consecutive tool-only iterations, unused tool pruning after 5 iterations, context budget enforcement.

## Flow 3: Multi-agent coordination

- Each agent tracks its own `lastProcessedId`
- If agent A is currently replying (typing) → agent B skips this turn
- Agent only replies when last message is NOT from itself
- SQLite is the coordination layer — no in-memory locking needed

## Flow 4: Sub-agent (Space) lifecycle

1. Parent agent calls `spawn_agent(task, agent_name)`
2. SpaceManager creates isolated channel + worker
3. Sub-agent executes independently (reads files, runs tools, etc.)
4. Sub-agent completes → result posted to parent channel
5. Space destroyed (channel + worker deleted)
6. Timeout: 300s default, kill if exceeded, error report to parent

## Flow 5: MCP external tool call

1. Agent outputs `tool_use` with name `mcp__github__list_repos`
2. Server parses namespace → routes to MCP client for "github" server
3. MCP client sends JSON-RPC request to external server
4. External server returns result
5. Result returned to agent as normal `tool_result`

Agent doesn't know whether a tool is local or remote — both go through the same tool registry.

## Flow 6: Full system overview

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
